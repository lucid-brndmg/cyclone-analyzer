import {IdentifierKind, IdentifierType, SemanticContextType, SyntaxBlockKind} from "../language/definitions.js";
import {getExpression, getOnlyExpression, listenerWalk, parseCycloneSyntax} from "../utils/antlr.js";
import {CategorizedStackTable, StackedTable} from "../lib/storage.js";

import {syntaxBlockIdPrefix} from "../language/specifications.js";
import SyntaxBlock from "./syntaxBlock.js";
import {elementReplacer, findLast, replaceByMap} from "../lib/list.js";
import {replaceIdentifiers} from "./refactorHelper.js";
import {posPair} from "../lib/position.js";
import CycloneParser from "../generated/antlr/CycloneParser.js";
import CheckExprListener from "./checkExprListener.js";

// Get the syntax block kind using id prefix
const idPrefixKind = (() => {
  const result = {}
  for (const [kind, pref] of Object.entries(syntaxBlockIdPrefix)) {
    result[pref] = parseInt(kind)
  }
  return result
})()

export const buildId = (kind, numId) => {
  return `${syntaxBlockIdPrefix[kind]}:${numId}`
}

export const idToKind = id => {
  return idPrefixKind[id.split(":")[0]]
}

// const syntaxBlockParsingEntry = {
//   [SyntaxBlockKind.CompilerOption]: "compOptions",
//   [SyntaxBlockKind.Machine]: "machineDecl",
//   [SyntaxBlockKind.State]: "stateExpr",
//   [SyntaxBlockKind.Transition]: "trans",
//   [SyntaxBlockKind.Assertion]: "assertExpr",
//   [SyntaxBlockKind.Variable]: null,
//   [SyntaxBlockKind.Func]: "functionDeclaration",
//   [SyntaxBlockKind.Goal]: "goal",
//   [SyntaxBlockKind.Invariant]: "invariantExpression",
//   [SyntaxBlockKind.Statement]: "statement",
//   [SyntaxBlockKind.PathVariable]: "letExpr",
//   [SyntaxBlockKind.PathStatement]: "pathAssignStatement",
//   [SyntaxBlockKind.Record]: "record",
//   [SyntaxBlockKind.SingleTypedVariableGroup]: null,
//   [SyntaxBlockKind.FnParamGroup]: "functionParamsDecl",
//   [SyntaxBlockKind.GoalFinal]: "checkExpr",
//   [SyntaxBlockKind.Program]: "program"
// }

const semanticTypePathToBlockKind = path => {
  for (let i = path.length - 1; i >= 0 ; i--) {
    const blockType = path[i]
    switch (blockType) {
      case SemanticContextType.GoalFinal: return SyntaxBlockKind.GoalFinal
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
      case SemanticContextType.ProgramScope: return SyntaxBlockKind.Program
    }
  }

  console.trace("warn: semantic block path can not be converted to syntax block kind", path)
  return null
}

/*
* an IR builder via semantic analysis
*
* */
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

  createBlock(kind, position = null, parentId = null, data = null, atIndex = null, pushChild = true) {
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

    if (parentId && pushChild) {
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

  createErrors(errors, blockKind) {
    return errors.map((error) => ({error, blockKind, id: this.assignErrorId()}))
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
    for (const block of blocks) {
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
    }
    return undefined
  }

  getLatestBlockId(kind) {
    return this.context.kindBlocks.peek(kind)?.id
  }

  getBlocksByKind(kind) {
    return this.context.kindBlocks.get(kind) ?? []
  }

  markIdentifier(ident, kind, blockId, scopeId = null) {
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

    gb.data.identifiers.push(ident, {blockId, scopeId, kind})
  }

  clearIdentifier(tgtScopeId) {
    const gb = this.getLatestBlock(SyntaxBlockKind.Machine)
    if (!gb || !tgtScopeId) {
      console.log("machine or scope id not found for ident", tgtScopeId)
      return
    }
    // for (let ident of idents) {
    //   gb.data.identifiers.filtered(ident, blockKind => !graphicalBlockKinds.includes(blockKind))
    // }
    gb.data.identifiers.filtered(({scopeId}) => scopeId !== tgtScopeId)
  }

  markReference(currentBlockKind, ident, identKindLimitations) {
    const block = this.getLatestBlock(currentBlockKind)
    const machine = this.getLatestBlock(SyntaxBlockKind.Machine)
    if (!block || !machine) {
      console.log("block or machine not found when marking reference", currentBlockKind, ident)
      return
    }
    const identRegBlockIds = machine.data.identifiers.get(ident)
    if (!identRegBlockIds?.length) {
      return;
    }

    const markId = identRegBlockIds.findLast(({kind}) => identKindLimitations.includes(kind))?.blockId // = identRegBlockIds[identRegBlockIds.length - 1]?.blockId

    // if (!blockRestrictions.length) {
    //   markId = identRegBlockIds[identRegBlockIds.length - 1]?.blockId
    // } else {
    //   for (let i = identRegBlockIds.length - 1; i <= 0; i--) {
    //     const {blockId} = identRegBlockIds[i]
    //     if (blockRestrictions.includes(blockId)) {
    //       markId = blockId
    //       break
    //     }
    //   }
    // }

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
          type: null
        })
        break
      }

      case SemanticContextType.RecordDecl: {
        this.createBlock(SyntaxBlockKind.Record, position, this.getLatestBlockId(SyntaxBlockKind.Machine))
        break
      }
      case SemanticContextType.RecordVariableDeclGroup: {
        this.createBlock(SyntaxBlockKind.SingleTypedVariableGroup, position, this.getLatestBlockId(SyntaxBlockKind.Record), {
          varKind: IdentifierKind.RecordField,
          type: null
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
          varKind: IdentifierKind.LocalVariable,
          type: null
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
          code: getOnlyExpression(payload, CycloneParser.AssertMainExprContext) // getExpression(payload)
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
    const {type, metadata} = block
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
        const {input, output, inputParams, outputParams} = metadata.signature
        // align & write data
        const paramBlocks = this.context.kindBlocks
          .get(SyntaxBlockKind.Variable)
          .filter(it => it.data.kind === IdentifierKind.FnParam)
          .slice(0 - input.length)
        for (let i = 0; i < input.length; i++) {
          const type = input[i]
          const block = paramBlocks[i]
          block.data.type = type
          block.data.typeParams = inputParams[i]
        }

        this.markData(SyntaxBlockKind.Func, {
          returnType: output,
          returnTypeParams: outputParams,
          identifier: metadata.identifier
        })
        this.clearIdentifier(this.getLatestBlockId(SyntaxBlockKind.Func))
        break
      }

      // case SemanticContextType.FnBodyScope: {
      //   this.clearIdentifier(this.getLatestBlockId(SyntaxBlockKind.Func))
      //   break
      // }

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
          identifier,
          labelKeyword,

          involvedRelations,
          isAnonymous
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
          identifier,
          labelKeyword,
          involvedRelations,
          isAnonymous
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
        const code = metadata.expr
        const {tree} = parseCycloneSyntax({
          input: code,
          entry: "checkExpr"
        })

        const lis = new CheckExprListener()
        listenerWalk(lis, tree)
        const {
          checkKeyword,
          forKeyword,
          forValues,
          viaKeyword,
          viaExpr,
          stopKeyword
        } = lis.result

        const data = {
          invariants: metadata.invariants,
          states: metadata.states,
          checkKeyword,
          forKeyword,
          forValues,
          viaKeyword,
          viaExpr,
          stopKeyword
        }

        this.markData(SyntaxBlockKind.GoalFinal, data)
        this.clearIdentifier(this.getLatestBlockId(SyntaxBlockKind.Goal))
        break
      }

      case SemanticContextType.LetDecl: {
        this.markData(SyntaxBlockKind.PathVariable, {
          codeInit: metadata.body?.replace(/^\s*=\s*/g, "") ?? "",
          identifier: metadata.identifier
        })
        break
      }
      case SemanticContextType.MachineDecl: {
        this.markData(SyntaxBlockKind.Machine, {
          identifier: metadata.identifier,
          keyword: metadata.keyword,
          stateSet: [...metadata.stateMap.keys()],
        })
        break
      }
      case SemanticContextType.AssertExpr: {
        this.markData(SyntaxBlockKind.Assertion, {
          modifier: metadata.modifier
        })
        break
      }
    }
  }

  #onAnalyzerIdentifierRegister(context, {text, type, position, kind, typeParams, recordIdent}) {
    const machineId = this.getLatestBlockId(SyntaxBlockKind.Machine)
    switch (kind) {
      case IdentifierKind.EnumField: {
        this.markIdentifier(`#${text}`, kind, this.context.latestBlock.id, machineId)
        break
      }
      case IdentifierKind.RecordField:
      case IdentifierKind.LocalVariable:
      case IdentifierKind.GlobalVariable:
      case IdentifierKind.GlobalConst: {
        this.markData(SyntaxBlockKind.SingleTypedVariableGroup, {
          type,
          typeParams
        })
        const {id} = this.createBlock(SyntaxBlockKind.Variable, position, this.getLatestBlockId(SyntaxBlockKind.SingleTypedVariableGroup), {
          identifier: text,
          type,
          typeParams,
          kind
        })

        if (kind !== IdentifierKind.RecordField) {
          this.markIdentifier(text, kind, id, kind === IdentifierKind.LocalVariable ? this.getLatestBlockId(SyntaxBlockKind.Func) : machineId)
        } else {
          if (recordIdent) {
            this.markIdentifier(`${recordIdent}.${text}`, kind, id, machineId)
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
        this.markIdentifier(text, kind, id, this.getLatestBlockId(SyntaxBlockKind.Func))
        break
      }

      case IdentifierKind.Machine: {
        const id = this.getLatestBlockId(SyntaxBlockKind.Machine)
        this.markIdentifier(text, kind, id, machineId)
        break
      }
      case IdentifierKind.State: {
        const id = this.getLatestBlockId(SyntaxBlockKind.State)
        this.markIdentifier(text, kind, id, machineId)
        break
      }
      case IdentifierKind.Trans: {
        const id = this.getLatestBlockId(SyntaxBlockKind.Transition)
        this.markIdentifier(text, kind, id, machineId)
        break
      }
      case IdentifierKind.Let: {
        const id = this.getLatestBlockId(SyntaxBlockKind.PathVariable)
        this.markIdentifier(text, kind, id, this.getLatestBlockId(SyntaxBlockKind.Goal))
        break
      }
      case IdentifierKind.Record: {
        const id = this.getLatestBlockId(SyntaxBlockKind.Record)
        this.markIdentifier(text, kind, id, machineId)
        break
      }
      case IdentifierKind.FnName: {
        const id = this.getLatestBlockId(SyntaxBlockKind.Func)
        this.markIdentifier(text, kind, id, machineId)
        break
      }
      case IdentifierKind.Invariant: {
        const id = this.getLatestBlockId(SyntaxBlockKind.Invariant)
        this.markIdentifier(text, kind, id, machineId)
        break
      }
    }
  }

  #onAnalyzerIdentifierReference(context, {references}) {
    const path = context.currentBlockPath
    const currentBlockKind = semanticTypePathToBlockKind(path)
    if (!currentBlockKind || !references.length) {
      return
    }
    const isEnum = references.length === 1 && references[0].kinds.length === 1 && references[0].kinds[0] === IdentifierKind.EnumField
    let ident, identKindLimitations
    if (references.length === 2) {
      // record
      ident = references[0].text + '.' + references[1].text
      identKindLimitations = [IdentifierKind.RecordField]
    } else if (isEnum) {
      // enum
      ident = '#' + references[0].text
      identKindLimitations = [IdentifierKind.EnumField]
    } else {
      ident = references[0].text
      identKindLimitations = references[0].kinds
    }
    this.markReference(currentBlockKind, ident, identKindLimitations)
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

    for (const o of searchOrder) {
      searchedBlock = this.getFirstBlock(o)
      if (searchedBlock) {
        break
      }
    }

    return searchedBlock?.parentIndex
  }

  findBlockInsertionIndex(kind, parentId) {
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
        const parent = this.getBlockById(parentId)
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

    const block = this.createBlock(kind, null, parentId, data, this.findBlockInsertionIndex(kind, parentId))
    this.markDirty()

    return block
  }

  // findBlockParsingEntry(block) {
  //   const entry = syntaxBlockParsingEntry[block.kind]
  //   if (entry) {
  //     return entry
  //   }
  //
  //   switch (block.kind) {
  //     case SyntaxBlockKind.Variable: {
  //       switch (block.data.kind) {
  //         case IdentifierKind.GlobalConst: return "globalConstantDecl"
  //         case IdentifierKind.RecordField:
  //         case IdentifierKind.LocalVariable:
  //         case IdentifierKind.GlobalVariable: return "variableDeclarator"
  //         case IdentifierKind.FnParam: return "functionParam"
  //       }
  //       break
  //     }
  //     case SyntaxBlockKind.SingleTypedVariableGroup: {
  //       switch (block.data.varKind) {
  //         case IdentifierKind.GlobalConst: return "globalConstantGroup"
  //         case IdentifierKind.RecordField: return "recordVariableDecl"
  //         case IdentifierKind.LocalVariable: return "localVariableGroup"
  //         case IdentifierKind.GlobalVariable: return "globalVariableGroup"
  //       }
  //       break
  //     }
  //   }
  //
  //   return null
  // }

  updateTransition(block, keyword, identifier, fromState, toStates, operators, excludedStates, label, labelKeyword, codeWhere) {
    const data = block.data
    if (keyword) {
      data.keyword = keyword
    }

    if (identifier != null) {
      // const oldIdent = data.identifier
      data.identifier = identifier
      // if (isRefactorMode && !block.isNewlyInserted()) {
      //   const goal = this.getLatestBlock(SyntaxBlockKind.Goal)
      //   if (goal) {
      //     const code = goal.codegen()
      //     const newCode = replaceIdentifiers(code, "goal", {commonIdentifiersMap: new Map([[oldIdent, identifier]])})
      //     goal.markCodegenOverride(newCode)
      //   }
      // }
    }

    if (fromState != null) {
      data.fromState = fromState
    }

    if (toStates != null) {
      data.toStates = toStates
    }

    if (operators != null) {
      data.operators = operators
    }

    if (excludedStates != null) {
      data.excludedStates = excludedStates
    }

    if (label != null && labelKeyword != null) {
      data.label = label
      data.labelKeyword = labelKeyword
    }

    if (codeWhere != null) {
      data.codeWhere = codeWhere
    }

    this.markDirty()
  }

  insertTransition(keyword, identifier, fromState, toStates, operators, excludedStates, label, labelKeyword, codeWhere) {
    return this.insertBlock(SyntaxBlockKind.Transition, this.getLatestBlockId(SyntaxBlockKind.Machine), {
      keyword: keyword ?? "trans",
      identifier,
      fromState,
      toStates: toStates ?? [],
      operators: operators ?? new Set(),
      excludedStates: excludedStates ?? [],
      label,
      labelKeyword: label ? labelKeyword ? labelKeyword : "label" : null,
      codeWhere
    })
  }

  upsertTransitionByStates(
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

  overrideBody(block, codePieces) {
    const stmtBlock = this.createBlock(SyntaxBlockKind.Statement, null, block.id, null, null, false)
    stmtBlock.markCodegenOverride(codePieces)
    block.overrideChildren([stmtBlock])
    return stmtBlock
  }

  updateState(block, identifier, attributes, statementCode = null, isRefactorMode = true) {
    if (identifier) {
      const oldIdent = block.data.identifier
      block.data.identifier = identifier
      if (isRefactorMode && !block.isNewlyInserted()) {
        this.refactorBlockIdentifier(block, new Map([[oldIdent, identifier]]), IdentifierKind.State)

        // this.context.kindBlocks
        //   .get(SyntaxBlockKind.Transition)
        //   ?.forEach(t => {
        //     if (t.data.fromState === oldIdent) {
        //       t.data.fromState = identifier
        //     }
        //     if (t.data.toStates.includes(oldIdent)) {
        //       t.data.toStates = t.data.toStates.map(elementReplacer(oldIdent, identifier))
        //     }
        //     if (t.data.excludedStates.includes(oldIdent)) {
        //       t.data.excludedStates = t.data.excludedStates.map(elementReplacer(oldIdent, identifier))
        //     }
        //   })
        //
        // const goal = this.getLatestBlock(SyntaxBlockKind.Goal)
        // if (goal) {
        //   const code = goal.codegen()
        //   const newCode = replaceIdentifiers(code, "goal", {commonIdentifiersMap: new Map([[oldIdent, identifier]])})
        //   goal.markCodegenOverride(newCode)
        // }
      }
    }
    if (attributes) {
      block.data.attributes = attributes
    }

    if (statementCode != null) {
      this.overrideBody(block, statementCode)
    }

    this.markDirty()
  }

  insertState(identifier, attributes, statementCode = null) {
    const block = this.insertBlock(SyntaxBlockKind.State, this.getLatestBlockId(SyntaxBlockKind.Machine), {
      attributes,
      identifier,
    })
    if (statementCode) {
      this.overrideBody(block, statementCode)
    }
    return block
  }

  updateMachine(block, keyword, identifier) {
    block.data.keyword = keyword
    block.data.identifier = identifier
    this.markDirty()
  }

  insertMachine(keyword, identifier) {
    return this.insertBlock(SyntaxBlockKind.Machine, this.getLatestBlockId(SyntaxBlockKind.Program), {
      keyword,
      identifier
    })
  }

  updateOption(block, name, value) {
    block.data.name = name
    block.data.value = value

    this.markDirty()
  }

  insertOption(name, value) {
    return this.insertBlock(SyntaxBlockKind.CompilerOption, this.getLatestBlockId(SyntaxBlockKind.Program), {
      name,
      value
    })
  }

  insertVariableGroup(parentId, varKind, enums = null, type = null, typeParams = null) {
    // const {type, identifier, codeWhere, codeInit} = firstVariable

    return this.insertBlock(SyntaxBlockKind.SingleTypedVariableGroup, parentId, {
      enums,
      varKind,
      type,
      typeParams
    })

    // this.createBlock(SyntaxBlockKind.Variable, null, group.id, {
    //   kind: varKind,
    //   type,
    //   identifier,
    //   codeWhere,
    //   codeInit
    // })

    // this.markDirty()
  }

  updateVariableGroup(block, identKind, identType, identTypeParams = null, enums = null) {
    let overrideType = false
    let overrideKind = false
    let overrideTypeParams = false
    if (identKind != null && block.data.varKind !== identKind) {
      block.data.varKind = identKind
      overrideKind = true
    }

    if (identTypeParams != null) {
      overrideTypeParams = true
      block.data.typeParams = identTypeParams
    }

    if (identType != null) {
      overrideType = true
      block.data.type = identType
    }

    if (enums) {
      block.data.enums = enums
    }

    if (overrideType || overrideKind || overrideTypeParams) {
      for (const child of block.children) {
        if (overrideKind) {
          child.data.varKind = identKind
        }
        if (overrideType) {
          child.data.type = identType
        }
        if (overrideTypeParams) {
          child.data.typeParams = identTypeParams
        }
      }
    }
  }

  insertVariable(groupId, identifier, codeInit, codeWhere, type, typeParams, kind) {
    const parent = this.getBlockById(groupId)
    if (!parent) {
      return null
    }
    if (parent.data.type == null && type != null) {
      parent.data.type = type
      if (typeParams != null) {
        parent.data.typeParams = typeParams
      }
    }
    return this.insertBlock(SyntaxBlockKind.Variable, groupId, {
      identifier,
      codeInit,
      codeWhere,
      kind: kind ?? parent.data.varKind,
      type: type ?? parent.data.type ?? parent.children[0]?.type,
      typeParams
    })
  }

  updateVariable(block, identifier, codeInit, codeWhere, type, typeParams, isRefactorMode) {
    if (codeInit != null) {
      block.data.codeInit = codeInit
    }

    if (codeWhere != null) {
      block.data.codeWhere = codeWhere
    }

    if (type != null) {
      block.data.type = type
    }

    if (typeParams != null) {
      block.data.typeParams = typeParams
    }

    if (identifier) {
      const oldIdent = block.data.identifier
      block.data.identifier = identifier
      if (isRefactorMode && !block.isNewlyInserted()) {
        const parent = this.getBlockById(block.parentId)
        const blockKind = block.data.kind

        if (blockKind === IdentifierKind.RecordField) {
          const record = this.getBlockById(parent.parentId)
          const recordIdent = record.data.identifier
          const replacement = new Map([[`${recordIdent}.${oldIdent}`, `${recordIdent}.${identifier}`]])
          this.refactorBlockIdentifier(block, replacement, IdentifierKind.RecordField)
        } else {
          this.refactorBlockIdentifier(block, new Map([[oldIdent, identifier]]), blockKind)
        }

        // switch (blockKind) {
        //   case IdentifierKind.FnParam:
        //   case IdentifierKind.LocalVariable:{
        //     // do refactor inside fn
        //     // fn :: parent :: block :: []
        //     const fn = this.getBlockById(parent.parentId)
        //     const replacements = {
        //       commonIdentifiersMap: new Map([[oldIdent, identifier]]),
        //     }
        //     for (let i = parent.parentIndex + 1; i < fn.children.length; i++) {
        //       // this iteration implicitly skipped kind = FnParamGroup
        //       const child = fn.children[i]
        //       if (!child.isCodeOverridden() && !child.isNewlyInserted() && child.references.has(block.id)) {
        //         replaceIdentifiers(
        //           child.codegen(),
        //           this.findBlockParsingEntry(child),
        //           replacements
        //         )
        //       }
        //     }
        //     if (blockKind === IdentifierKind.LocalVariable) {
        //       for (let i = block.parentIndex + 1; i < parent.children.length; i++) {
        //         const child = parent.children[i]
        //         if (!child.isCodeOverridden() && !child.isNewlyInserted() && child.references.has(block.id)) {
        //           replaceIdentifiers(
        //             child.codegen(),
        //             this.findBlockParsingEntry(child),
        //             replacements
        //           )
        //         }
        //       }
        //     }
        //     break
        //   }
        //   case IdentifierKind.RecordField: {
        //     // do refactor with dotExpr
        //     const record = this.getBlockById(parent.parentId)
        //     const recordIdent = record.data.identifier
        //     const machine = this.getBlockById(record.parentId)
        //     const replacement = new Map([[`${recordIdent}.${oldIdent}`, `${recordIdent}.${identifier}`]])
        //     for (let i = parent.parentIndex + 1; i < machine.children.length; i++) {
        //       const child = machine.children[i]
        //       if (!child.isCodeOverridden() && !child.isNewlyInserted() && child.references.has(block.id)) {
        //         replaceIdentifiers(
        //           child.codegen(),
        //           this.findBlockParsingEntry(child),
        //           {
        //             commonIdentifiersMap: replacement
        //           }
        //         )
        //       }
        //     }
        //     break
        //   }
        //   case IdentifierKind.GlobalVariable:
        //   case IdentifierKind.GlobalConst: {
        //     // do global scan
        //     const replacements = {
        //       commonIdentifiersMap: new Map([[oldIdent, identifier]])
        //     }
        //     // for each parent
        //     for (let i = block.parentIndex + 1; i < parent.children.length; i++) {
        //       const child = parent.children[i]
        //       if (!child.isCodeOverridden() && !child.isNewlyInserted() && child.references.has(block.id)) {
        //         replaceIdentifiers(
        //           child.codegen(),
        //           this.findBlockParsingEntry(child),
        //           replacements
        //         )
        //       }
        //     }
        //     // for each machine
        //     const machine = this.getBlockById(parent.parentId)
        //     for (let i = parent.parentIndex + 1; i < machine.children.length; i++) {
        //       const child = machine.children[i]
        //       if (!child.isCodeOverridden() && !child.isNewlyInserted() && child.references.has(block.id)) {
        //         replaceIdentifiers(
        //           child.codegen(),
        //           this.findBlockParsingEntry(child),
        //           replacements
        //         )
        //       }
        //     }
        //     break
        //   }
        // }
      }
    }

    this.markDirty()
  }

  insertRecord(identifier) {
    return this.insertBlock(SyntaxBlockKind.Record, this.getLatestBlockId(SyntaxBlockKind.Machine), {identifier})
  }

  updateRecord(block, identifier, isRefactorMode) {
    const oldIdent = block.data.identifier
    block.data.identifier = identifier

    if (isRefactorMode && !block.isNewlyInserted()) {
      // const recVars = []
      // const allMembers = block.children
      //   .map(it => {
      //     const vBlock = it.children[0]
      //     recVars.push(vBlock)
      //     return vBlock.data?.identifier
      //   })
      //   .filter(it => !!it)
      //   .map(it => [`${oldIdent}.${it}`, `${identifier}.${it}`])
      // for (let i = block.index + 1; i < this.context.blocks.length; i++) {
      //   const child = this.context.blocks[i]
      //   if (!child.isCodeOverridden() && !child.isNewlyInserted() && child.references.has(block.id)) {
      //     const code = replaceIdentifiers(
      //       child.codegen(),
      //       this.findBlockParsingEntry(child), {
      //         commonIdentifiersMap: new Map([[oldIdent, identifier], ...allMembers]),
      //         // dotIdentifiersMap: new Map(allMembers)
      //       }
      //     )
      //     child.markCodegenOverride(code)
      //   }
      // }

      const m = new Map([[oldIdent, identifier]])
      this.refactorBlockIdentifier(block, m, IdentifierKind.Record)

      for (const child of block.children) {
        const vb = child.children[0]
        const field = vb?.data.identifier
        if (field) {
          this.refactorBlockIdentifier(vb, new Map([[`${oldIdent}.${field}`, `${identifier}.${field}`]]), IdentifierKind.RecordField)
        }
      }

    }

    this.markDirty()
  }

  insertFunction(identifier, returnType, returnTypeParams) {
    // manually insert local variables + parameter variables after
    const fnBlock = this.insertBlock(SyntaxBlockKind.Func, this.getLatestBlockId(SyntaxBlockKind.Machine), {identifier, returnType, returnTypeParams})

    this.createBlock(SyntaxBlockKind.FnParamGroup, null, fnBlock.id)

    return fnBlock
  }

  insertSingleStatement(parentId, code) {
    return this.insertBlock(SyntaxBlockKind.Statement, parentId, {code})
  }

  insertMultiStatements(parentId, codePieces) {
    const s = this.insertBlock(SyntaxBlockKind.Statement, parentId, null)
    s.markCodegenOverride(codePieces)
    return s
  }

  updateFunction(block, identifier, returnType, returnTypeParams, codeVariables, codeBody, isRefactorMode = true) {
    if (returnType != null) {
      block.data.returnType = returnType
    }

    if (returnTypeParams != null) {
      block.data.returnTypeParams = returnTypeParams
    }

    if (codeVariables != null) {
      const vars = this.createBlock(SyntaxBlockKind.SingleTypedVariableGroup, null, block.id, null, null, false)
      vars.markCodegenOverride(codeVariables)
      let statementIdx = -1
      for (let i = 0; i < block.children.length; i++) {
        const child = block.children[i]
        if (child.kind === SyntaxBlockKind.SingleTypedVariableGroup) {
          this.removeBlock(child)
        } else if (child.kind === SyntaxBlockKind.Statement) {
          if (statementIdx === -1) {
            statementIdx = i
            break
          }
        }
      }

      if (statementIdx === -1) {
        block.pushChild(vars)
      } else {
        block.insertChild(vars, statementIdx)
      }
    }

    if (codeBody != null) {
      const statementFirstIdx = block.children.findIndex(child => child.kind === SyntaxBlockKind.Statement)
      const statement = this.createBlock(SyntaxBlockKind.Statement, null, block.id, null, null, false)
      statement.markCodegenOverride(codeBody)
      if (statementFirstIdx !== -1) {
        block.children = block.children.slice(0, statementFirstIdx)
      }
      block.pushChild(statement)
    }


    if (identifier) {
      const oldIdent = block.data.identifier
      block.data.identifier = identifier
      if (isRefactorMode && !block.isNewlyInserted()) {
        // const parent = this.getBlockById(block.parentId)
        // for (let i = block.index + 1; i < this.context.blocks.length; i++) {
        //   const child = this.context.blocks[i]
        //   if (!child.isCodeOverridden() && !child.isNewlyInserted() && child.references.has(block.id)) {
        //     // const stop = block.position.stopPosition
        //     const code = replaceIdentifiers(
        //       child.codegen(),
        //       this.findBlockParsingEntry(child), {
        //         commonIdentifiersMap: new Map([[oldIdent, identifier]]),
        //         // rangePair: posPair(stop.line, stop.column)
        //       }
        //     )
        //     child.markCodegenOverride(code)
        //   }
        // }

        this.refactorBlockIdentifier(block, new Map([[oldIdent, identifier]]), IdentifierKind.FnName)
      }
    }

    this.markDirty()
  }

  clearFunctionParamGroup(fnBlock) {
    const params = this.createBlock(SyntaxBlockKind.FnParamGroup, null, fnBlock.id, null, null, false)
    fnBlock.replaceChild(params, 0)
    this.markDirty()
    return params
  }

  insertInvariant(identifier, inIdentifiers = []) {
    return this.insertBlock(SyntaxBlockKind.Invariant, this.getLatestBlockId(SyntaxBlockKind.Machine), {identifier, inIdentifiers})
  }

  updateInvariant(block, identifier, inIdentifiers, isRefactorMode = false) {
    if (inIdentifiers != null) {
      block.data.inIdentifiers = inIdentifiers
    }
    if (identifier) {
      const oldIdent = block.data.identifier
      block.data.identifier = identifier
      if (isRefactorMode && !block.isNewlyInserted()) {
        this.refactorBlockIdentifier(block, new Map([[oldIdent, identifier]]), IdentifierKind.Invariant)

        // const goal = this.getLatestBlock(SyntaxBlockKind.Goal)
        // if (goal) {
        //   const code = goal.codegen()
        //   const newCode = replaceIdentifiers(code, "goal", {commonIdentifiersMap: new Map([[oldIdent, identifier]])})
        //   goal.markCodegenOverride(newCode)
        // }
      }
    }
    this.markDirty()
  }

  insertGoal() {
    return this.insertBlock(SyntaxBlockKind.Goal, this.getLatestBlockId(SyntaxBlockKind.Machine))
  }

  updateGoal(block, goalCode) {
    block.markCodegenOverride(goalCode)
    this.markDirty()
  }

  insertAssertion(code, inIdentifiers, modifier) {
    return this.insertBlock(SyntaxBlockKind.Assertion, this.getLatestBlockId(SyntaxBlockKind.Goal), {code, inIdentifiers, modifier})
  }

  updateAssertion(block, code, inIdentifiers, modifier) {
    if (code != null) {
      block.data.code = code
    }
    if (inIdentifiers != null) {
      block.data.inIdentifiers = inIdentifiers
    }
    block.data.modifier = modifier
    this.markDirty()
  }

  insertPathVariable(identifier, codeInit) {
    return this.insertBlock(SyntaxBlockKind.PathVariable, this.getLatestBlockId(SyntaxBlockKind.Goal), {codeInit})
  }

  updatePathVariable(block, identifier, codeInit, isRefactorMode = true) {
    if (codeInit != null) {
      block.data.codeInit = codeInit
    }

    if (identifier) {
      const oldIdent = block.data.identifier
      block.data.identifier = identifier
      if (isRefactorMode && !block.isNewlyInserted()) {
        this.refactorBlockIdentifier(block, new Map([[oldIdent, identifier]]), IdentifierKind.Let)
        // const goal = this.getLatestBlock(SyntaxBlockKind.Goal)
        // if (goal) {
        //   const code = goal.codegen()
        //   const position = block.position
        //   const goalStop = goal.position?.stopPosition
        //   const newCode = replaceIdentifiers(code, "goal", {
        //     commonIdentifiersMap: new Map([[oldIdent, identifier]]),
        //     rangePair: posPair(position.stopPosition.line, position.stopPosition.column, goalStop?.line, goalStop?.column)
        //   })
        //   goal.markCodegenOverride(newCode)
        // }
      }
    }

    this.markDirty()
  }

  insertPathStatement(code) {
    return this.insertBlock(SyntaxBlockKind.PathStatement, this.getLatestBlockId(SyntaxBlockKind.Goal), {code})
  }

  updatePathStatement(block, code) {
    block.data.code = code
    this.markDirty()
  }

  insertGoalFinal(checkKeyword, forKeyword, forValues, viaKeyword, viaExpr, stopKeyword, invariants, states) {
    return this.insertBlock(SyntaxBlockKind.GoalFinal, this.getLatestBlockId(SyntaxBlockKind.Goal), {checkKeyword, forKeyword, forValues, viaKeyword, viaExpr, stopKeyword, invariants, states})
  }

  updateGoalFinal(block, checkKeyword, forKeyword, invariants, states, forValues, viaKeyword, viaExpr, stopKeyword) {
    if (checkKeyword != null) {
      block.data.checkKeyword = checkKeyword
    }
    if (forKeyword != null) {
      block.data.forKeyword = forKeyword
    }
    if (forValues != null) {
      block.data.forValues = forValues
    }
    if (viaKeyword != null) {
      block.data.viaKeyword = viaKeyword
    }
    if (viaExpr != null) {
      block.data.viaExpr = viaExpr
    }
    if (stopKeyword != null) {
      block.data.stopKeyword = stopKeyword
    }
    if (invariants) {
      block.data.invariants = invariants
    }
    if (states) {
      block.data.states = states
    }
    this.markDirty()
  }

  refactorBlockIdentifier(updatedBlock, replacementMap, identPossibleKind) {
    for (const [k, v] of replacementMap) {
      if (k === v) {
        replacementMap.delete(k)
      }
    }
    if (!replacementMap.size) {
      return
    }
    const refs = this.context.blocks.filter(block => block.references.has(updatedBlock.id))

    for (const block of refs) {
      this.updateReferencedIdentifier(block, replacementMap, identPossibleKind)
    }
  }

  updateReferencedIdentifier(block, replacementMap, identPossibleKind = null) {
    const blockKind = block.kind
    const replacementCtx = {
      commonIdentifiersMap: replacementMap,
    }

    // block referencing this identifier
    switch (blockKind) {
      case SyntaxBlockKind.PathStatement: {
        block.data.code = replaceIdentifiers(block.data.code, "pathAssignStatement", replacementCtx)
        this.markDirty()
        break
      }
      case SyntaxBlockKind.Statement: {
        block.data.code = replaceIdentifiers(block.data.code, "statement", replacementCtx)
        this.markDirty()
        break
      }
      case SyntaxBlockKind.PathVariable: {
        if (block.data.codeInit) {
          block.data.codeInit = replaceIdentifiers(block.data.codeInit, "pathExpr", replacementCtx)
          this.markDirty()
        }

        break
      }
      case SyntaxBlockKind.Variable: {
        let replaced = false
        if (block.data.codeInit) {
          block.data.codeInit = replaceIdentifiers(block.data.codeInit, "expression", replacementCtx)
          replaced = true
        }
        if (block.data.codeWhere) {
          block.data.codeWhere = replaceIdentifiers(block.data.codeWhere, "expression", replacementCtx)
          replaced = true
        }
        if (replaced) {
          this.markDirty()
        }
        break
      }
      case SyntaxBlockKind.Transition: {
        const {codeWhere, fromState, toStates, excludedStates} = block.data
        let replaced = false
        if (codeWhere && identPossibleKind !== IdentifierKind.State) {
          block.data.codeWhere = replaceIdentifiers(block.data.codeWhere, "expression", replacementCtx)
          replaced = true
        }

        if (identPossibleKind === IdentifierKind.State || identPossibleKind === null) {
          if (replacementMap.has(fromState)) {
            block.data.fromState = replacementMap.get(fromState)
            replaced = true
          }

          if (toStates.length) {
            block.data.toStates = replaceByMap(block.data.toStates, replacementMap)
            replaced = true
          }

          if (excludedStates.length) {
            block.data.excludedStates = replaceByMap(block.data.excludedStates, replacementMap)
            replaced = true
          }
        }

        if (replaced) {
          this.markDirty()
        }

        break
      }

      case SyntaxBlockKind.Assertion: {
        if (block.data.inIdentifiers?.length && (identPossibleKind === IdentifierKind.State || identPossibleKind == null)) {
          block.data.inIdentifiers = replaceByMap(block.data.inIdentifiers, replacementMap)
        }

        if (identPossibleKind !== IdentifierKind.State) {
          block.data.code = replaceIdentifiers(block.data.code, "expression", replacementCtx)
        }

        this.markDirty()
        break
      }

      case SyntaxBlockKind.Invariant: {
        if (block.data.inIdentifiers?.length && (identPossibleKind === IdentifierKind.State || identPossibleKind == null)) {
          block.data.inIdentifiers = replaceByMap(block.data.inIdentifiers, replacementMap)
        }

        if (identPossibleKind !== IdentifierKind.State) {
          for (const child of block.children) {
            this.updateReferencedIdentifier(child, replacementMap, identPossibleKind)
          }
        }
        this.markDirty()
        break
      }

      case SyntaxBlockKind.GoalFinal: {
        const {
          invariants,
          states,
          viaExpr
        } = block.data

        if (invariants.length && (identPossibleKind === IdentifierKind.Invariant || identPossibleKind == null)) {
          block.data.invariants = replaceByMap(block.data.invariants, replacementMap)
        }

        if (states.length && (identPossibleKind === IdentifierKind.State || identPossibleKind == null)) {
          block.data.states = replaceByMap(block.data.states, replacementMap)
        }

        if (viaExpr && identPossibleKind !== IdentifierKind.Invariant) {
          block.data.viaExpr = replaceIdentifiers(viaExpr, "pathExprList", replacementCtx)
        }

        this.markDirty()

        break
      }

      default: {
        for (const child of block.children) {
          this.updateReferencedIdentifier(child, replacementMap, identPossibleKind)
        }
        break
      }
    }
  }

  searchReferences(blockIds) {
    const s = new Set()
    for (const block of this.context.blocks) {
      if (blockIds.some(id => block.references.has(id))) {
        s.add(block.id)
      }
    }

    return s
  }

  searchReferencesInDepthWithSet(block, set) {
    if (block.references.size) {
      for (const r of block.references) {
        set.add(r)
      }
    }

    for (const child of block.children) {
      this.searchReferencesInDepthWithSet(child, set)
    }
  }

  searchReferencesInDepth(block) {
    const s = new Set()
    return this.searchReferencesInDepthWithSet(block, s)
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

  previousBlock(block) {
    if (!block.parentId) {
      return null
    }

    const parent = this.getBlockById(block.parentId)
    return parent?.children[block.parentIndex - 1]
  }

  nextBlock(block) {
    if (!block.parentId) {
      return null
    }

    const parent = this.getBlockById(block.parentId)
    return parent?.children[block.parentIndex + 1]
  }

  attach(analyzer) {
    analyzer.on("block:enter", (...args) => this.#onAnalyzerBlockEnter(...args))
    analyzer.on("block:exit", (...args) => this.#onAnalyzerBlockExit(...args))
    analyzer.on("identifier:register", (...args) => this.#onAnalyzerIdentifierRegister(...args))
    analyzer.on("identifier:reference", (...args) => this.#onAnalyzerIdentifierReference(...args))
    analyzer.on("errors", (...args) => this.#onAnalyzerErrors(...args))
  }
}