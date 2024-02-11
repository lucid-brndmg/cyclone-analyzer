import {IdentifierKind, IdentifierType, SemanticContextType, SyntaxBlockKind} from "../language/definitions.js";
import {getExpression} from "../utils/antlr.js";
import {CategorizedStackTable, StackedTable} from "../lib/storage.js";

import {syntaxBlockIdPrefix} from "../language/specifications.js";
import {typeToString} from "../utils/type.js";
import SyntaxBlock from "./syntaxBlock.js";
import {findLast} from "../lib/list.js";

const idPrefixKind = (() => {
  const result = {}
  Object.entries(syntaxBlockIdPrefix).forEach(([kind, pref]) => {
    result[pref] = parseInt(kind)
  })
  return result
})()

export const buildId = (kind, numId) => {
  return `${syntaxBlockIdPrefix[kind]}:${numId}`
}

export const idToKind = id => {
  return idPrefixKind[id.split(":")[0]]
}

const semanticTypePathToBlockKind = path => {
  for (let i = path.length - 1; i >= 0 ; i--) {
    const blockType = path[i]
    switch (blockType) {
      case SemanticContextType.MachineDecl: return SyntaxBlockKind.Machine
      case SemanticContextType.StateDecl: return SyntaxBlockKind.State
      case SemanticContextType.TransDecl: return SyntaxBlockKind.Transition
      case SemanticContextType.InvariantDecl: return SyntaxBlockKind.Invariant
      case SemanticContextType.GoalScope: return SyntaxBlockKind.Goal
      case SemanticContextType.LetDecl: return SyntaxBlockKind.PathVariable
      case SemanticContextType.RecordDecl: return SyntaxBlockKind.Record
      case SemanticContextType.VariableDecl: return SyntaxBlockKind.Variable

      case SemanticContextType.RecordVariableDeclGroup:
      case SemanticContextType.GlobalVariableGroup:
      case SemanticContextType.LocalVariableGroup:
      case SemanticContextType.GlobalConstantGroup: return SyntaxBlockKind.SingleTypedVariableGroup

      case SemanticContextType.FnDecl: return SyntaxBlockKind.Func
      case SemanticContextType.FnParamsDecl: return SyntaxBlockKind.FnParamGroup
      case SemanticContextType.AssertExpr: return SyntaxBlockKind.Assertion
      case SemanticContextType.CompilerOption: return SyntaxBlockKind.CompilerOption
      case SemanticContextType.Statement: return SyntaxBlockKind.Statement
      case SemanticContextType.PathAssignStatement: return SyntaxBlockKind.PathStatement
    }
  }

  console.trace("warn: semantic block path can not be converted to syntax block kind", path)
  return null
}

// "IR-I"
export default class SyntaxBlockBuilder {
  context

  constructor() {
    this.prepare()
  }

  prepare() {
    this.context = {
      program: null,
      blocks: [],
      kindBlocks: new StackedTable(),
      ids: new Map(),
      unsortedError: [],
      idBlocks: new Map(),
      latestBlock: null,
      errorId: 0,

      stateIdentifierBlockId: new CategorizedStackTable(),
      invariantIdentifierBlockId: new CategorizedStackTable()
    }

    this.context.program = this.createBlock(SyntaxBlockKind.Program, null, null, {
      isDirty: false
    })
  }

  getProgramBlock() {
    return this.context.program
  }

  codegen() {
    return this.getProgramBlock().codegen()
  }

  getBlockById(id) {
    return this.context.idBlocks.get(id)
  }

  static idToKind(id) {
    return idToKind(id)
  }

  static semanticTypePathToBlockKind(path) {
    return semanticTypePathToBlockKind(path)
  }

  assignId(kind) {
    let id
    if (this.context.ids.has(kind)) {
      id = this.context.ids.get(kind) + 1
    } else {
      id = 0
    }
    this.context.ids.set(kind, id)
    return buildId(kind, id)
  }

  assignErrorId() {
    return this.context.errorId++
  }

  createBlock(kind, position = null, parentId = null, data = null, atIndex = null) {
    const id = this.assignId(kind)
    // const block = {
    //   id,
    //   parentId,
    //   position,
    //   errors: [],
    //   childErrors: [],
    //   references: new Set(),
    //   children: [],
    //   kind,
    //   data: data ?? {},
    //   index: this.context.blocks.length
    // }
    const block = new SyntaxBlock(id, kind, parentId, data, position, this.context.blocks.length)
    this.context.blocks.push(block)
    this.context.kindBlocks.push(kind, block)
    this.context.idBlocks.set(id, block)
    this.context.latestBlock = block

    // if (children?.length) {
    //   for (let block of children) {
    //     block.pushChild(block)
    //   }
    // }

    if (parentId) {
      const parent = this.context.idBlocks.get(parentId)
      if (atIndex != null) {
        parent?.insertChild(block, atIndex)
      } else {
        parent?.pushChild(block)
      }
    }

    return block
  }

  followBlocks(parentId, acc = []) {
    const block = this.context.idBlocks.get(parentId)
    if (!block) {
      console.trace("warn: no block found by id", parentId)
      return acc
    }

    acc.push(block)

    if (!block.parentId) {
      return acc
    }

    return this.followBlocks(block.parentId, acc)
  }

  createErrors(errors, kind) {
    return errors.map((error) => ({error, kind, id: this.assignErrorId()}))
  }

  markErrors(kind, errors, pushUnsorted = true) {
    let block
    if (kind) {
      block = this.getLatestBlock(kind)
    }
    const createdErrors = this.createErrors(errors, kind)
    if (!block) {
      if (pushUnsorted) {
        this.context.unsortedError.push(createdErrors)
      }
      return false
    }

    block.markErrors(...createdErrors)

    if (!block.parentId) {
      return true
    }

    const blocks = this.followBlocks(block.parentId)
    for (let block of blocks) {
      block.markChildErrors(...createdErrors)
    }
    return true
  }

  markData(kind, data) {
    const block = this.getLatestBlock(kind)
    if (!block) {
      console.log("warn: no block found with data", kind, data)
      return
    }
    block.markData(data)
  }

  getLatestBlock(kind) {
    return this.context.kindBlocks.peek(kind)
  }

  getFirstBlock(kind) {
    if (this.context.kindBlocks.has(kind)) {
      return this.context.kindBlocks.get(kind)[0]
    } else {
      return undefined
    }
  }

  getLatestBlockId(kind) {
    return this.context.kindBlocks.peek(kind)?.id
  }

  markIdentifier(ident, blockId, scopeId = null) {
    if (!blockId) {
      console.log("warn: block id not found for ident", ident)
      return;
    }
    // for record fields: rec.field
    // for enums: #enum
    const gb = this.getLatestBlock(SyntaxBlockKind.Machine)
    if (!gb) {
      console.log("machine not found for ident", ident, blockId)
      return
    }

    gb.data.identifiers.push(ident, {blockId, scopeId})
  }

  clearIdentifier(scopeId) {
    const gb = this.getLatestBlock(SyntaxBlockKind.Machine)
    if (!gb || !scopeId) {
      console.log("machine or scope id not found for ident", scopeId)
      return
    }
    // for (let ident of idents) {
    //   gb.data.identifiers.filtered(ident, blockKind => !graphicalBlockKinds.includes(blockKind))
    // }
    gb.data.identifiers.filtered(({blockId, scopeId}) => scopeId === scopeId)
  }

  markReference(kind, ident, blockRestrictions = []) {
    const block = this.getLatestBlock(kind)
    const machine = this.getLatestBlock(SyntaxBlockKind.Machine)
    if (!block || !machine) {
      console.log("block or machine not found when marking reference", kind, ident, blockRestrictions)
      return
    }
    const identRegBlockIds = machine.data.identifiers.get(ident)
    if (!identRegBlockIds?.length) {
      return;
    }

    let markId

    if (!blockRestrictions.length) {
      markId = identRegBlockIds[identRegBlockIds.length - 1]?.blockId
    } else {
      for (let i = identRegBlockIds.length - 1; i <= 0; i--) {
        const {blockId} = identRegBlockIds[i]
        if (blockRestrictions.includes(blockId)) {
          markId = blockId
          break
        }
      }
    }

    if (markId) {
      block.addReference(markId)
    }
  }

  #registerInvariant(machineId, identifier, id) {
    this.context.invariantIdentifierBlockId.push(machineId, identifier, id)
  }

  searchInvariantsByIdentifier(machineId, identifier) {
    return this.context.invariantIdentifierBlockId.getAll(machineId, identifier)
  }

  #registerState(machineId, identifier, id) {
    this.context.stateIdentifierBlockId.push(machineId, identifier, id)
  }

  searchStatesByIdentifier(machineId, identifier) {
    return this.context.stateIdentifierBlockId.getAll(machineId, identifier)
  }

  #onAnalyzerBlockEnter(context, {block, payload}) {
    const {type, position} = block
    switch (type) {
      case SemanticContextType.CompilerOption: {
        this.createBlock(SyntaxBlockKind.CompilerOption, position, this.getLatestBlockId(SyntaxBlockKind.Program))
        break
      }
      case SemanticContextType.MachineDecl: {
        this.createBlock(SyntaxBlockKind.Machine, position, this.getLatestBlockId(SyntaxBlockKind.Program), {
          identifiers: new StackedTable(),
          recordFields: new CategorizedStackTable()
        })
        break
      }
      case SemanticContextType.GlobalVariableGroup:
      case SemanticContextType.GlobalConstantGroup: {
        this.createBlock(SyntaxBlockKind.SingleTypedVariableGroup, position, this.getLatestBlockId(SyntaxBlockKind.Machine), {
          varKind: type === SemanticContextType.GlobalVariableGroup
            ? IdentifierKind.GlobalVariable
            : IdentifierKind.GlobalConst,
        })
        break
      }

      case SemanticContextType.RecordDecl: {
        this.createBlock(SyntaxBlockKind.Record, position, this.getLatestBlockId(SyntaxBlockKind.Machine))
        break
      }
      case SemanticContextType.RecordVariableDeclGroup: {
        this.createBlock(SyntaxBlockKind.SingleTypedVariableGroup, position, this.getLatestBlockId(SyntaxBlockKind.Record), {
          varKind: IdentifierKind.RecordField
        })
        break
      }
      case SemanticContextType.VariableInit: {
        const codeInit = getExpression(payload)
        this.markData(SyntaxBlockKind.Variable, {
          codeInit
        })
        break
      }
      case SemanticContextType.FnDecl: {
        this.createBlock(SyntaxBlockKind.Func, position, this.getLatestBlockId(SyntaxBlockKind.Machine), {
          returnType: IdentifierType.Hole,
          identifier: ""
        })
        break
      }
      case SemanticContextType.FnParamsDecl: {
        this.createBlock(SyntaxBlockKind.FnParamGroup, position, this.getLatestBlockId(SyntaxBlockKind.Func))
        break
      }
      case SemanticContextType.Statement: {
        const semBlocks = context.findNearestBlockByTypes([
          SemanticContextType.FnBodyScope,
          SemanticContextType.InvariantScope,
          SemanticContextType.StateScope
        ])

        const content = {
          code: getExpression(payload)
        }

        switch (semBlocks.type) {
          case SemanticContextType.FnBodyScope: {
            this.createBlock(SyntaxBlockKind.Statement, position, this.getLatestBlockId(SyntaxBlockKind.Func), content)
            break
          }
          case SemanticContextType.StateScope: {
            this.createBlock(SyntaxBlockKind.Statement, position, this.getLatestBlockId(SyntaxBlockKind.State), content)
            break
          }
          case SemanticContextType.InvariantScope: {
            this.createBlock(SyntaxBlockKind.Statement, position, this.getLatestBlockId(SyntaxBlockKind.Invariant), content)
            break
          }
        }
        break
      }
      case SemanticContextType.LocalVariableGroup: {
        // For now, local var can only exist in fn
        this.createBlock(SyntaxBlockKind.SingleTypedVariableGroup, position, this.getLatestBlockId(SyntaxBlockKind.Func), {
          varKind: IdentifierKind.LocalVariable
        })

        break
      }

      case SemanticContextType.StateDecl: {
        this.createBlock(SyntaxBlockKind.State, position, this.getLatestBlockId(SyntaxBlockKind.Machine))
        break
      }

      case SemanticContextType.TransDecl: {
        this.createBlock(SyntaxBlockKind.Transition, position, this.getLatestBlockId(SyntaxBlockKind.Machine))
        break
      }

      case SemanticContextType.InvariantDecl: {
        this.createBlock(SyntaxBlockKind.Invariant, position, this.getLatestBlockId(SyntaxBlockKind.Machine))
        break
      }

      case SemanticContextType.GoalScope: {
        this.createBlock(SyntaxBlockKind.Goal, position, this.getLatestBlockId(SyntaxBlockKind.Machine))
        break
      }

      case SemanticContextType.AssertExpr: {
        this.createBlock(SyntaxBlockKind.Assertion, position, this.getLatestBlockId(SyntaxBlockKind.Goal), {
          code: getExpression(payload)
        })
        break
      }

      case SemanticContextType.PathAssignStatement: {
        this.createBlock(SyntaxBlockKind.PathStatement, position, this.getLatestBlockId(SyntaxBlockKind.Goal), {
          code: getExpression(payload)
        })
        break
      }

      case SemanticContextType.LetDecl: {
        this.createBlock(SyntaxBlockKind.PathVariable, position, this.getLatestBlockId(SyntaxBlockKind.Goal))
        break
      }

      case SemanticContextType.GoalFinal: {
        this.createBlock(SyntaxBlockKind.GoalFinal, position, this.getLatestBlockId(SyntaxBlockKind.Goal))
        break
      }
    }
  }

  #onAnalyzerBlockExit(context, {block}) {
    const {type, position, metadata} = block
    switch (type) {
      case SemanticContextType.CompilerOption: {
        const {name, value} = metadata
        this.markData(SyntaxBlockKind.CompilerOption, {
          name,
          value
        })
        break
      }
      case SemanticContextType.RecordDecl: {
        this.markData(SyntaxBlockKind.Record, {
          identifier: metadata.identifier
        })
        break
      }
      case SemanticContextType.WhereExpr: {
        const trans = context.findNearestBlock(SemanticContextType.TransDecl)
        if (!trans) {
          // trans is handled by trans's metadata
          this.markData(SyntaxBlockKind.Variable, {
            codeWhere: metadata.expr
          })
        }
        break
      }

      case SemanticContextType.RecordVariableDeclGroup:
      case SemanticContextType.LocalVariableGroup:
      case SemanticContextType.GlobalVariableGroup:
      case SemanticContextType.GlobalConstantGroup: {
        if (metadata.fieldType === IdentifierType.Enum) {
          this.getLatestBlock(SyntaxBlockKind.SingleTypedVariableGroup).data.enums = metadata.enums
        }
        break
      }
      case SemanticContextType.FnDecl: {
        const [{input, output}] = metadata.signatures
        // align & write data
        const paramBlocks = this.context.kindBlocks
          .get(SyntaxBlockKind.Variable)
          .filter(it => it.data.kind === IdentifierKind.FnParam)
          .slice(0 - input.length)
        for (let i = 0; i < input.length; i++) {
          const type = input[i]
          const block = paramBlocks[i]
          block.data.type = type
        }

        this.markData(SyntaxBlockKind.Func, {
          returnType: output,
          identifier: metadata.identifier
        })
        break
      }

      case SemanticContextType.FnBodyScope: {
        this.clearIdentifier(this.getLatestBlockId(SyntaxBlockKind.Func))
        break
      }

      case SemanticContextType.StateDecl: {
        const {identifier, attributes} = metadata
        this.markData(SyntaxBlockKind.State, {
          identifier, attributes
        })
        this.#registerState(this.getLatestBlockId(SyntaxBlockKind.Machine), identifier, this.getLatestBlockId(SyntaxBlockKind.State))
        break
      }

      case SemanticContextType.TransDecl: {
        const {
          label,
          whereExpr,
          fromState,
          toStates,
          operators,
          excludedStates,
          involvedStates,
          keyword,
          identifier
        } = metadata

        this.markData(SyntaxBlockKind.Transition, {
          label,
          codeWhere: whereExpr,
          fromState,
          toStates,
          operators,
          excludedStates,
          involvedStates,
          keyword,
          identifier
        })

        break
      }

      case SemanticContextType.InvariantDecl: {
        this.markData(SyntaxBlockKind.Invariant, {
          identifier: metadata.identifier
        })
        this.#registerInvariant(this.getLatestBlockId(SyntaxBlockKind.Machine), metadata.identifier, this.getLatestBlockId(SyntaxBlockKind.Invariant))
        break
      }

      case SemanticContextType.InExpr: {
        const {identifiers} = metadata
        if (!identifiers?.length) {
          break
        }

        const semBlocks = context.findNearestBlockByTypes([
          SemanticContextType.InvariantDecl,
          SemanticContextType.AssertExpr
        ])

        switch (semBlocks.type) {
          case SemanticContextType.InvariantDecl: {
            this.markData(SyntaxBlockKind.Invariant, {inIdentifiers: identifiers})
            break
          }
          case SemanticContextType.AssertExpr: {
            this.markData(SyntaxBlockKind.Assertion, {inIdentifiers: identifiers})
            break
          }
        }
        break
      }

      case SemanticContextType.GoalScope: {
        this.markData(SyntaxBlockKind.GoalFinal, {
          code: metadata.expr,
          invariants: metadata.invariants,
          states: metadata.states
        })
        this.clearIdentifier(this.getLatestBlockId(SyntaxBlockKind.Goal))
        break
      }

      case SemanticContextType.LetDecl: {
        this.markData(SyntaxBlockKind.PathVariable, {
          codeInit: metadata.body,
          identifier: metadata.identifier
        })
        break
      }
      case SemanticContextType.MachineDecl: {
        this.markData(SyntaxBlockKind.Machine, {
          identifier: metadata.identifier,
          keyword: metadata.keyword
        })
        break
      }
    }
  }

  #onAnalyzerIdentifierRegister(context, {text, type, position, kind, blockType, recordIdent}) {
    switch (kind) {
      case IdentifierKind.EnumField: {
        this.markIdentifier(`#${text}`, this.context.latestBlock.id)
        break
      }
      case IdentifierKind.RecordField:
      case IdentifierKind.LocalVariable:
      case IdentifierKind.GlobalVariable:
      case IdentifierKind.GlobalConst: {
        this.markData(SyntaxBlockKind.SingleTypedVariableGroup, {
          type
        })
        const {id} = this.createBlock(SyntaxBlockKind.Variable, position, this.getLatestBlockId(SyntaxBlockKind.SingleTypedVariableGroup), {
          identifier: text,
          type,
          kind
        })

        if (kind !== IdentifierKind.RecordField) {
          this.markIdentifier(text, id, kind === IdentifierKind.LocalVariable ? this.getLatestBlockId(SyntaxBlockKind.Func) : null)
        } else {
          if (recordIdent) {
            this.markIdentifier(`${recordIdent}.${text}`, id)
          }
        }
        break
      }

      case IdentifierKind.FnParam: {
        const {id} = this.createBlock(SyntaxBlockKind.Variable, position, this.getLatestBlockId(SyntaxBlockKind.FnParamGroup), {
          identifier: text,
          type, // <- type here is always hole
          kind
        })
        this.markIdentifier(text, id, this.getLatestBlockId(SyntaxBlockKind.Func))
        break
      }

      case IdentifierKind.Machine: {
        const id = this.getLatestBlockId(SyntaxBlockKind.Machine)
        this.markIdentifier(text, id)
        break
      }
      case IdentifierKind.State: {
        const id = this.getLatestBlockId(SyntaxBlockKind.State)
        this.markIdentifier(text, id)
        break
      }
      case IdentifierKind.Trans: {
        const id = this.getLatestBlockId(SyntaxBlockKind.Transition)
        this.markIdentifier(text, id)
        break
      }
      case IdentifierKind.Let: {
        const id = this.getLatestBlockId(SyntaxBlockKind.PathVariable)
        this.markIdentifier(text, id, this.getLatestBlockId(SyntaxBlockKind.Goal))
        break
      }
      case IdentifierKind.Record: {
        const id = this.getLatestBlockId(SyntaxBlockKind.Record)
        this.markIdentifier(text, id)
        break
      }
      case IdentifierKind.FnName: {
        const id = this.getLatestBlockId(SyntaxBlockKind.Func)
        this.markIdentifier(text, id)
        break
      }
      case IdentifierKind.Invariant: {
        const id = this.getLatestBlockId(SyntaxBlockKind.Invariant)
        this.markIdentifier(text, id)
        break
      }
    }
  }

  #onAnalyzerIdentifierReference(context, {references}) {
    const path = context.currentBlockPath
    const kind = semanticTypePathToBlockKind(path)
    if (!kind || !references.length) {
      return
    }
    let ident
    if (references.length > 1) {
      // record
      ident = references[0].text + '.' + references[1].text
    } else if (references[0].isEnum) {
      // enum
      ident = '#' + references[0].text
    } else {
      ident = references[0].text
    }
    this.markReference(kind, ident)
  }

  #onAnalyzerErrors(context, errors) {
    const path = context.currentBlockPath
    const kind = semanticTypePathToBlockKind(path)
    if (!kind) {
      return
    }
    this.markErrors(kind, errors)
  }

  markDirty() {
    this.markData(SyntaxBlockKind.Program, {isDirty: true})
  }

  #updateWithParent(block, f) {
    const {parentId} = block
    if (!parentId) {
      return false
    }

    const parentBlock = this.getBlockById(parentId)
    if (!parentBlock) {
      return false
    }

    if (f(parentBlock) === false) {
      return false
    }
    this.markDirty()
    return true
  }

  removeBlock(block) {
    return this.#updateWithParent(block, parentBlock => parentBlock.children = parentBlock.children.filter(node => node.id !== block.id))
  }

  removeBlocksFromSameParent(blocks) {
    switch (blocks.length) {
      case 0: return true
      case 1: return this.removeBlock(blocks[0])
      default: {
        const idSet = new Set(blocks.map(it => it.id))
        return this.#updateWithParent(blocks[0], parentBlock => {
          parentBlock.children = parentBlock.children.filter(node => !idSet.has(node.id))
        })
      }
    }
  }

  swapBlockIndex(block, targetIndex) {
    return this.#updateWithParent(block, parentBlock => {
      const target = parentBlock.children[targetIndex]
      if (!target) {
        return false
      }

      const i = block.parentIndex
      block.parentIndex = targetIndex
      target.parentIndex = i

      parentBlock.children[targetIndex] = block
      parentBlock.children[i] = target
    })
  }

  #findBlockInsertionIndexByOrder(searchOrder) {
    let searchedBlock

    for (let o of searchOrder) {
      searchedBlock = this.getFirstBlock(o)
      if (searchedBlock) {
        break
      }
    }

    return searchedBlock?.parentIndex
  }

  findBlockInsertionIndex(kind) {
    switch (kind) {
      // insert AT last
      case SyntaxBlockKind.Variable:
      case SyntaxBlockKind.Goal:
      case SyntaxBlockKind.GoalFinal:
      case SyntaxBlockKind.Statement:
      case SyntaxBlockKind.Machine: {
        return null
      }

      // insert BEFORE last
      case SyntaxBlockKind.CompilerOption: {
        // first machine
        const machine = this.getFirstBlock(SyntaxBlockKind.Machine)
        return machine?.parentIndex
      }

      case SyntaxBlockKind.Invariant: {
        // first goal
        const goal = this.getFirstBlock(SyntaxBlockKind.Goal)
        return goal?.parentIndex
      }

      case SyntaxBlockKind.PathStatement:
      case SyntaxBlockKind.PathVariable:
      case SyntaxBlockKind.Assertion: {
        const goalFin = this.getFirstBlock(SyntaxBlockKind.GoalFinal)
        return goalFin?.parentIndex
      }

      // searchOrder dependent kinds
      case SyntaxBlockKind.Transition: {
        return this.#findBlockInsertionIndexByOrder([SyntaxBlockKind.Invariant, SyntaxBlockKind.Goal])
      }
      case SyntaxBlockKind.State: {
        return this.#findBlockInsertionIndexByOrder([SyntaxBlockKind.Transition, SyntaxBlockKind.Invariant, SyntaxBlockKind.Goal])
      }
      case SyntaxBlockKind.Record:
      case SyntaxBlockKind.Func: {
        return this.#findBlockInsertionIndexByOrder([SyntaxBlockKind.State, SyntaxBlockKind.Transition, SyntaxBlockKind.Invariant, SyntaxBlockKind.Goal])
      }
      case SyntaxBlockKind.FnParamGroup: {
        return this.#findBlockInsertionIndexByOrder([SyntaxBlockKind.SingleTypedVariableGroup, SyntaxBlockKind.Statement])
      }

      // complicated kinds
      case SyntaxBlockKind.SingleTypedVariableGroup: {
        switch (parent.kind) {
          case SyntaxBlockKind.Machine: {
            // global variable, constant, etc
            return this.#findBlockInsertionIndexByOrder([SyntaxBlockKind.State, SyntaxBlockKind.Transition, SyntaxBlockKind.Invariant, SyntaxBlockKind.Goal])
          }
          case SyntaxBlockKind.Record: {
            // record field
            return null
          }
          case SyntaxBlockKind.Func: {
            // local variable
            const stmt = this.getFirstBlock(SyntaxBlockKind.Statement)
            return stmt?.parentIndex
          }
        }
      }
    }

    return null
  }

  insertBlock(kind, parentId, data) {
    // const parent = this.getBlockById(parentId)
    // if (!parent) {
    //   return null
    // }

    const block = this.createBlock(kind, null, parentId, data, this.findBlockInsertionIndex(kind))
    this.markDirty()

    return block
  }

  insertBasicTransition(
    sourceStateBlock,
    targetStateBlock,

    isAppend,
    isBiWay,
    transKeyword = "trans"
  ) {
    if ((sourceStateBlock.kind !== SyntaxBlockKind.State || targetStateBlock.kind !== SyntaxBlockKind.State) || (sourceStateBlock.parentId !== targetStateBlock.parentId)) {
      return false
    }

    // TODO: multi machine
    const targetIdent = targetStateBlock.data.identifier
    const sourceIdent = sourceStateBlock.data.identifier

    const transFromSource = isAppend && this.context.kindBlocks.has(SyntaxBlockKind.Transition)
      ? findLast(this.context.kindBlocks.get(SyntaxBlockKind.Transition), ts =>
        // matches the source block
        ts.data.fromState === sourceIdent
        && ts.references.has(sourceStateBlock.id)
        // specify direction
        && ts.data.operators.has(isBiWay ? "<->" : "->")
        // must not be excluded
        && ts.data.excludedStates.length === 0 // .includes(targetIdent)
        // must not be labeled
        && !ts.data.label
        // can not be conditional
        && !ts.data.codeWhere
        // must not be dynamic (*, +, etc..)
        && ts.data.toStates.length >= 1)
      : null

    if (transFromSource) {
      // if (transFromSource.data.toStates.includes(targetIdent)) {
      //   // duplicated state
      //   return false
      // }
      transFromSource.data.toStates.push(targetIdent)
      this.markDirty()
    } else {
      this.insertBlock(SyntaxBlockKind.Transition, sourceStateBlock.parentId, {
        fromState: sourceIdent,
        toStates: [targetIdent],
        operators: new Set([isBiWay ? "<->" : "->"]),

        excludedStates: [],
        keyword: transKeyword
      })
    }
    return true
  }

  searchReferences(blockIds) {
    const s = new Set()
    for (let block of this.context.blocks) {
      if (blockIds.some(id => block.references.has(id))) {
        s.add(block.id)
      }
    }

    return s
  }

  getParentChildrenLength(block) {
    const {parentId} = block
    if (!parentId) {
      return 0
    }

    const parentBlock = this.getBlockById(parentId)
    if (!parentBlock) {
      return 0
    }

    return parentBlock.children.length
  }

  isLastOfParentChildren(block) {
    return block.parentIndex === this.getParentChildrenLength(block) - 1
  }

  attach(analyzer) {
    analyzer.on("block:enter", (...args) => this.#onAnalyzerBlockEnter(...args))
    analyzer.on("block:exit", (...args) => this.#onAnalyzerBlockExit(...args))
    analyzer.on("identifier:register", (...args) => this.#onAnalyzerIdentifierRegister(...args))
    analyzer.on("identifier:reference", (...args) => this.#onAnalyzerIdentifierReference(...args))
    analyzer.on("errors", (...args) => this.#onAnalyzerErrors(...args))
  }
}