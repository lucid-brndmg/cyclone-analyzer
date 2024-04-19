/**
 * The semantic analyzer module
 * This analyzer declared methods that detects semantic errors in Cyclone
 * Handled by SemanticParserListener
 * */


import {
  ActionKind,
  SemanticErrorType,
  IdentifierKind,
  IdentifierType,
  SemanticContextType
} from "../language/definitions.js";
import {
  declarationContextType,
  declarationContextTypeToIdentifierKind,
  declarationGroupContextTypeToIdentifierKind,
  identifierKindToType,
  identifierNoPushTypeStackBlocks, invalidNodeModifierCombo,
  optionAcceptableValues,
  scopedContextType,
  singleTypedDeclarationGroupContextType,
  typeTokenToType
} from "../language/specifications.js";
import {
  declareMetadata,
  scopeMetadata,
  semanticContextMetadataTable,
  singleTypedDeclGroupMetadata
} from "./metadata.js";
import SemanticAnalyzerContext from "./semanticAnalyzerContext.js";
import {findDuplications, firstCombo} from "../lib/list.js";
import {edgeIndex, edgeTargets, isAnonymousEdge, isClosureEdge} from "../utils/edge.js";
import {checkSignature} from "../utils/type.js";

export default class SemanticAnalyzer {
  context
  events

  constructor(context = null) {
    this.context = context ?? new SemanticAnalyzerContext()
    this.events = new Map()
  }

  emitBlock(isEnter, payload, block) {
    const e = `block:${isEnter ? "enter" : "exit"}`
    this.emit(e, {
      // listener should get the current path by event.currentPath
      // position = block.position
      payload,
      block
    })
  }

  emit(event, payload) {
    if (this.events.has(event)) {
      const es = this.events.get(event)
      if (!es.length) {
        return
      }
      for (let h of this.events.get(event)) {
        h(this.context, payload)
      }
    }
  }

  on(event, handler) {
    if (this.events.has(event)) {
      this.events.get(event).push(handler)
    } else {
      this.events.set(event, [handler])
    }
  }

  off(event, handler = null) {
    if (this.events.has(event)) {
      let del = false
      if (handler) {
        const es = this.events.get(event).filter(e => e !== handler)
        if (es.length) {
          this.events.set(event, es)
        } else {
          del = true
        }
      } else {
        del = true
      }
      if (del) {
        this.events.delete(event)
      }
    }
  }

  pushBlock(type, position, payload, metadataParams = null) {
    let table = null
    const isScope = scopedContextType.has(type)
    if (isScope) {
      // const [x, y] = this.context.scopeCoords
      table = scopeMetadata()
    } else if (declarationContextType.has(type)) {
      table = declareMetadata()
    } else if (singleTypedDeclarationGroupContextType.has(type)) {
      table = singleTypedDeclGroupMetadata()
    }

    const metadataBuilder = semanticContextMetadataTable[type]
    const metadata = metadataBuilder ? metadataBuilder(metadataParams) : null

    const blockContent = {
      type,
      position,
      // index: this.context.blockContextStack.length,
      // identifierTable: new Map(), // Map<Kind, Map<Ident, [definitions]>>
      metadata: table || metadata ? {...table, ...metadata} : null
    }

    this.context.pushBlock(blockContent)
    this.emitBlock(true, payload, blockContent)
  }

  popBlock(payload) {
    const block = this.context.peekBlock()
    this.emitBlock(false, payload, block)
    return this.context.popBlock()
  }
  referenceEnum(identText, position) {
    this.emit("identifier:reference", {references: [{text: identText, position, isEnum: true}]})
    this.pushTypeStack(IdentifierType.Enum)
    const machine = this.context.currentMachineBlock
    if (!machine.metadata.enumFields.has(identText)) {
      this.emit("errors", [{
        ...position,

        type: SemanticErrorType.UndefinedIdentifier,
        params: {desc: "enum literal", ident: `#${identText}`}
      }])
    }
    // return null
  }

  // Handles identifier declaration
  registerIdentifier(block, identText, identPos) {
    // check duplication
    const blockType = block.type
    const scope = this.context.peekScope()
    if (!scope) {
      console.log("warn: scope not found", blockType, identText, identPos)
    }

    let identKind = declarationContextTypeToIdentifierKind[blockType]
      ?? IdentifierKind.Unknown
    if (identKind === IdentifierKind.Unknown) {
      const prev = this.context.peekBlock(1)
      identKind = declarationGroupContextTypeToIdentifierKind[prev.type] ?? IdentifierKind.Unknown
    }
    let isEnum = false // blockType === SemanticContextType.EnumDecl

    // NOTE: Enum fields don't have types, their types are always -1
    const type = identifierKindToType[identKind]
      ?? block.metadata.fieldType
    const machineCtx = this.context.currentMachineBlock.metadata
    // console.log("support shadowing: ", scopeSupportsShadowing.get(scope.type)?.has(identKind), scope.type, identKind)
    let fnSignature = null

    switch (blockType) {
      case SemanticContextType.FnDecl: {
        machineCtx.actionTable.push(ActionKind.Function, identText, {
          action: identText,
          kind: ActionKind.Function,
          signatures: block.metadata.signatures
        })
        fnSignature = block.metadata.signatures[0]
        // block.metadata.identifier = identText
        break
      }

      case SemanticContextType.EnumDecl: {
        isEnum = true
        machineCtx.enumFields.add(identText)
        const prev = this.context.peekBlock(1)
        if (prev.metadata.enums.includes(identText)) {
          this.emit("errors", [{
            type: SemanticErrorType.DuplicatedEnumField,
            params: {text: identText},
            ...identPos
          }])
        }
        prev.metadata.enums.push(identText)
        break
      }
    }

    if (declarationContextType.has(blockType)) {
      block.metadata.identifier = identText
    }
    const isRecordMemberDef = !isEnum && scope.type === SemanticContextType.RecordScope
      // current block is not enum decl
      // (since enum decl also involves identifiers)
      // && this.context.peekBlock().type !== SemanticContextType.EnumDecl
    const recordDecl = isRecordMemberDef ? this.context.findNearestBlock(SemanticContextType.RecordDecl) : null
    const recordIdent = recordDecl?.metadata.identifier // this.context
    const payload = {
      text: identText,
      type,
      position: identPos,
      kind: identKind,
      blockType,
      recordIdent
      // isEnum
    }

    this.emit("identifier:register", payload)

    // const hasCount = !isEnum && (scope
    //   ? scopeSupportsShadowing.get(scope.type)?.has(identKind)
    //     ? scope.metadata.identifierCounts.get(identText) > 0
    //     : machineCtx.identifierStack.getLength(identText) > 0
    //   : machineCtx.identifierStack.getLength(identText) > 0)
    //
    // if (hasCount) {
    //   this.emit("errors", [{
    //     ...identPos,
    //
    //     type: SemanticErrorType.IdentifierRedeclaration,
    //     params: {ident: identText}
    //   }])
    // }

    if (isEnum) {
      return
    }

    const identStack = machineCtx.identifierStack
    let exists = false
    switch (identKind) {
      // TODO: machine
      case IdentifierKind.State: {
        // search state
        exists = identStack.exists(identText, payload => payload.kind === IdentifierKind.State)
        break
      }

      case IdentifierKind.Trans: {
        exists = identStack.exists(identText, payload =>  payload.kind === IdentifierKind.Trans)
        // search trans
        break
      }

      case IdentifierKind.RecordField: {
        // todo: search record NAME, record field
        exists = recordIdent === identText
        break
      }

      case IdentifierKind.FnParam:
      case IdentifierKind.LocalVariable: {
        // search each other
        exists = identStack.exists(identText, payload => [IdentifierKind.FnParam, IdentifierKind.LocalVariable].includes(payload.kind))
        break
      }

      case IdentifierKind.Let: {
        // search let
        exists = identStack.exists(identText, payload => payload.kind === IdentifierKind.Let)
        break
      }

      case IdentifierKind.FnName:
      case IdentifierKind.Record:
      case IdentifierKind.GlobalConst:
      case IdentifierKind.GlobalVariable: {
        // todo: search fn name, global var, global const, record name
        exists = identStack.exists(identText, payload => [IdentifierKind.FnName, IdentifierKind.GlobalVariable, IdentifierKind.GlobalConst, IdentifierKind.Record].includes(payload.kind))
        break
      }
    }

    // this.context.editorCtx.pushScopeLayerIdent(identText, type, identPos, identKind, blockType, this.context.scopedBlocks.length)

    // this.emitLangComponent(context, payload)

    const info = {
      position: identPos,
      kind: identKind,
      type,
      text: identText,
      // recordIdent: null,
      recordChild: [],
      fnSignature,
      fnParams: []
    }
    // this.context.findNearestBlock(SemanticContextType.EnumDecl, SemanticContextType.RecordScope) === null
    // && this.searchNearestBlock(
    //   block => block.metadata?.blockCurrentRecord === true,
    //   SemanticContextType.RecordScope,
    //   // this.context.blockContextStack.length - scope.index
    // ) === null
    if (recordIdent) {
      // info.recordIdent = recordIdent

      const recordInfo = identStack.findLast(recordIdent, ({kind}) => kind === IdentifierKind.Record)
      exists = !exists && recordInfo?.recordChild.find(({text}) => text === identText)
      recordInfo?.recordChild?.push({
        text: identText,
        type,
        kind: identKind
      })
      // no need to check current counts here
      // cuz RecordScope is already a scope

      // scope?.metadata.recordCounts.incr(recordIdent, identText)
      const prevScope = this.context.peekScope(1)
      if (prevScope) {
        prevScope?.metadata.recordCounts.incr(recordIdent, identText)
      } else {
        console.log("warn: no previous scope exists before current scope")
      }
      // this.context.recordCounts.incr(recordIdent, identText)
      machineCtx.recordFieldStack.push(recordIdent, identText, info)
    }

    identStack.push(identText, info)
    scope.metadata.identifierCounts.incr(identText)
    if (exists) {
      this.emit("errors", [{
        ...identPos,

        type: SemanticErrorType.IdentifierRedeclaration,
        params: {ident: identText}
      }])
    }
  }

  // checks identifier usage (reference)
  referenceIdentifier(blockType, identText, identPos) {
    // check existence
    this.emit("identifier:reference", {references: [{position: identPos, text: identText, isEnum: false}]})
    let errParams = {
      desc: "identifier",
      ident: identText
    }
    // const ident = identifiers.peek(identText)
    let shouldNotPushTypeStackBlocks = identifierNoPushTypeStackBlocks.has(blockType)
    const es = []
    let kindLimitations = null, foundIdent = null

    switch (blockType) {
      // case SemanticContextType.StateInc:
      case SemanticContextType.TransScope:
      case SemanticContextType.InExpr:
      case SemanticContextType.Stop:
      case SemanticContextType.PathPrimary: {
        kindLimitations = [IdentifierKind.State]
        errParams.desc = "state"
        break
      }

      case SemanticContextType.PathAssignStatement:
      case SemanticContextType.LetDecl:
      case SemanticContextType.StateInc: {
        kindLimitations = [IdentifierKind.State, IdentifierKind.Let]
        errParams.desc = "state or path"
        break
      }

      case SemanticContextType.With: {
        kindLimitations = [IdentifierKind.Invariant]
        errParams.desc = "invariant"
        break
      }

      case SemanticContextType.DotExpr: {
        kindLimitations = [IdentifierKind.Record]
        errParams.desc = "record"
        break
      }

      case SemanticContextType.Statement:
      case SemanticContextType.InvariantScope:
      case SemanticContextType.StateScope:
      case SemanticContextType.FnCall:
      case SemanticContextType.AssertExpr:
      case SemanticContextType.FnBodyScope:
      case SemanticContextType.VariableInit: {
        kindLimitations = [IdentifierKind.GlobalVariable, IdentifierKind.GlobalConst, IdentifierKind.Record, IdentifierKind.FnName]
        const fnBlockAllowed = [IdentifierKind.LocalVariable, IdentifierKind.FnParam]
        const fnBlock = [
          // These context types are likely exists inside a function body
          SemanticContextType.Statement,
          SemanticContextType.FnCall,
          SemanticContextType.FnBodyScope,
          SemanticContextType.VariableInit,
          ].includes(blockType)
          && this.context.findNearestBlock(SemanticContextType.FnDecl)
        if (fnBlock) {
          kindLimitations.push(...fnBlockAllowed)
        }

        if (blockType === SemanticContextType.FnCall) {
          const block = this.context.peekBlock()
          if (block.metadata.gotReference === 0) {
            // the function itself can not be pushed to typeStack
            shouldNotPushTypeStackBlocks = true
          }
          block.metadata.gotReference += 1
          if (fnBlock) {
            const fnName = fnBlock.metadata.identifier
            // check for recursion
            if (fnName) {
              foundIdent = this.context.peekIdentifier(identText, kindLimitations)
            }
            if (foundIdent && fnName === identText && foundIdent?.kind === IdentifierKind.FnName) {
              es.push({
                ...identPos,

                type: SemanticErrorType.RecursiveFunction,
                params: {ident: identText}
              })
            }
          }
        }
        break
      }

      case SemanticContextType.WhereExpr: {
        kindLimitations = [IdentifierKind.GlobalConst, IdentifierKind.GlobalVariable, IdentifierKind.RecordField]

        const variableDeclBlock = this.context.findNearestBlock(SemanticContextType.VariableDecl)
        if (variableDeclBlock) {
          // check for free variable
          const varIdent = variableDeclBlock.metadata.identifier
          if (varIdent !== identText && !this.context.currentMachineBlock.metadata.identifierStack.exists(identText, ({kind}) => kind === IdentifierKind.GlobalConst)) {
            es.push({
              ...identPos,

              type: SemanticErrorType.WhereFreeVariable,
              params: {ident: varIdent, freeVariable: identText}
            })
          }
        } else {
          // trans block
          kindLimitations.push(IdentifierKind.Record)
        }
        break
      }

      // case SemanticContextType.GoalScope: {
      //   kindLimitations = [IdentifierKind.GlobalConst, IdentifierKind.GlobalVariable, IdentifierKind.Let, IdentifierKind.State]
      //
      //   // if (ident && ident.type !== IdentifierType.Bool) {
      //   //   es.push({
      //   //     ...identPos,
      //   //
      //   //     type: SemanticErrorType.TypeMismatchVarRef,
      //   //     params: {ident: identText, expected: IdentifierType.Bool}
      //   //   })
      //   // }
      //   break
      // }

      // case SemanticContextType.FnCall: {
      //   if (ident) {
      //     const functionDecl = this.context.findNearestBlock(SemanticContextType.FnDecl)
      //     const fnName = functionDecl?.metadata.identifier
      //     if (fnName === identText && ident.kind === IdentifierKind.FnName) {
      //       es.push({
      //         ...identPos,
      //
      //         type: SemanticErrorType.RecursiveFunction,
      //         params: {ident: identText}
      //       })
      //     }
      //   }
      //
      //   const block = this.context.peekBlock()
      //   if (block.metadata.gotReference === 0) {
      //     // the function itself can not be pushed to typeStack
      //     shouldNotPushTypeStackBlocks = true
      //   }
      //   block.metadata.gotReference += 1
      //
      //   break
      // }
    }

    // const whereBlock = this.context.findNearestBlock(SemanticContextType.WhereExpr)
    // if (whereBlock) {
    //   const variableDeclBlock = this.context.findNearestBlock(SemanticContextType.VariableDecl)
    //   if (variableDeclBlock) {
    //     const ident = variableDeclBlock.metadata.identifier
    //     if (ident !== identText && identifiers.peek(identText)?.kind !== IdentifierKind.GlobalConst) {
    //       es.push({
    //         ...identPos,
    //
    //         type: SemanticErrorType.WhereFreeVariable,
    //         params: {ident, freeVariable: identText}
    //       })
    //     }
    //   }
    // }

    if (kindLimitations && !foundIdent) {
      foundIdent = this.context.peekIdentifier(identText, kindLimitations)
    }

    if (!foundIdent) {
      // if (identText === "Can") {
      //   console.log(this.context.currentMachineBlock.metadata.identifierStack.get(identText))
      // }
      es.push({
        ...identPos,

        type: SemanticErrorType.UndefinedIdentifier,
        params: errParams
      })
    }

    // if (!ident || (kindLimitations != null && !kindLimitations.includes(ident.kind))) {
    //   es.push({
    //     ...identPos,
    //
    //     type: SemanticErrorType.UndefinedIdentifier,
    //     params: errParams
    //   })
    // }

    // console.log("ref", identText, ident, shouldPushTypeStack, blockType)

    if (!shouldNotPushTypeStackBlocks) {
      this.pushTypeStack(foundIdent?.type ?? IdentifierType.Hole)
    }

    if (es.length) {
      this.emit("errors", es)
    }
  }

  // checks reference on record fields
  referenceRecordField(parentIdentText, parentPos, identText, identPos) {
    // pop the Record pushed before
    this.context.popTypeStack()
    const scope = this.context.peekScope()
    const es = []
    const machineCtx = this.context.currentMachineBlock.metadata
    this.emit("identifier:reference", {references: [{position: parentPos, text: parentIdentText, isEnum: false}, {position: identPos, text: identText, isEnum: false}]})

    if (!scope) {
      console.log("warn: scope not found when reference record field", parentIdentText, identText, identPos)
    }

    const hasRecord = machineCtx.identifierStack.exists(parentIdentText, ({kind}) => kind === IdentifierKind.Record)

    // const hasRecord = ident && ident.kind === IdentifierKind.Record
    if (!hasRecord) {
      es.push({
        ...parentPos,

        type: SemanticErrorType.UndefinedIdentifier,
        params: {desc: "record", ident: parentIdentText}
      })
    }

    const hasRecordField = hasRecord && machineCtx.recordFieldStack.getLength(parentIdentText, identText) > 0 // this.context.recordCounts.hasCounts([parentIdentText], identText)
    if (!hasRecordField) {
      es.push({
        ...identPos,

        type: SemanticErrorType.UndefinedIdentifier,
        params: {desc: "record field", ident: `${parentIdentText}.${identText}`}
      })
      this.pushTypeStack(IdentifierType.Hole)
    } else {
      const recordField = machineCtx.recordFieldStack.peek(parentIdentText, identText)
      this.pushTypeStack(recordField.type)
    }

    if (es.length) {
      this.emit("errors", es)
    }

  }

  // called when entering identifier literal
  handleIdentifier(identifierText, identifierPos) {
    const block = this.context.peekBlock()
    if (!block) {
      console.log("warn: block type not found")
      return
    }

    const blockType = block.type
    if (declarationContextType.has(blockType)) {
      this.registerIdentifier(block, identifierText, identifierPos)
    } else if (blockType === SemanticContextType.DotExpr) {
      if (block.metadata.parent != null) {
        const [parentIdent, parentPos] = block.metadata.parent
        this.referenceRecordField(parentIdent, parentPos, identifierText, identifierPos)
      } else {
        block.metadata.parent = [identifierText, identifierPos]
        this.referenceIdentifier(blockType, identifierText, identifierPos)
      }
    } else {
      if (blockType === SemanticContextType.FnCall && block.metadata.fnName === null) {
        block.metadata.fnName = identifierText
      }

      // console.log("warn: unhandled block with identifier", block)
      this.referenceIdentifier(blockType, identifierText, identifierPos)
    }
  }

  // 'int', 'real', 'bool', etc
  handleTypeToken(typeText, position) {
    const block = this.context.peekBlock()
    if (!block) {
      console.log("warn: block type not found")
      return
    }

    const type = typeTokenToType[typeText]
      ?? IdentifierType.Hole
    const blockType = block.type

    switch (blockType) {
      case SemanticContextType.FnDecl: {
        block.metadata.signatures[0].output = type
        break
      }

      case SemanticContextType.FnParamsDecl: {
        const fnBlock = this.context.findNearestBlock(SemanticContextType.FnDecl)
        if (fnBlock) {
          fnBlock.metadata.signatures[0].input.push(type)
          const currentIdentText = block.metadata.identifier
          const machineCtx = this.context.currentMachineBlock.metadata
          const currentIdent = machineCtx.identifierStack.findLast(currentIdentText, ({kind}) => kind === IdentifierKind.FnParam)
          if (currentIdent) {
            currentIdent.type = type
            // block.metadata.currentIdentifier = null
            const currentFn = machineCtx.identifierStack.findLast(fnBlock.metadata.identifier, ({kind}) => kind === IdentifierKind.FnName)
            if (currentFn) {
              currentFn.fnParams.push(currentIdentText)
            }
          } else {
            console.log("warn: no identifier caught in fn params", block, typeText)
          }
        } else {
          console.log("warn: no fn decl block exists before fn params block", block)
        }
        break
      }

      default: {
        if (singleTypedDeclarationGroupContextType.has(blockType)) {
          // case SemanticContextType.EnumGroup:
          // case SemanticContextType.GlobalConstantGroup:
          // case SemanticContextType.GlobalVariableGroup:
          // case SemanticContextType.LocalVariableGroup:
          block.metadata.fieldType = type

          if ((blockType === SemanticContextType.GlobalConstantGroup || blockType === SemanticContextType.LocalVariableGroup) && typeText === "enum") {
            this.emit("errors", [{
              ...position,

              type: SemanticErrorType.EnumNotAllowedInVariable,
            }])
          }
        }

        break

      }
    }
  }

  handleFunCall(actionKind) {
    const block = this.context.peekBlock()
    const position = block.position
    if (this.context.findNearestBlock(SemanticContextType.WhereExpr)) {
      this.emit("errors", [{
        ...position,

        type: SemanticErrorType.WhereFunctionCall
      }])
    }
    this.deduceActionCall(actionKind, block.metadata.fnName, block.metadata.gotParams, position)
  }

  deduceActionCall(actionKind, action, inputActualLength, position, identList = null) {
    const fn = this.context.getAction(actionKind, action)
    if (!fn) {
      // This will happen when calling from an unregistered function
      // pushing a hole will save the integrity of the type stack

      // console.log("warn: invalid fn when exit fnCall", action)
      this.pushTypeStack(IdentifierType.Hole)
      return
    }

    let output = IdentifierType.Hole
    let pass = false
    const es = []
    const {signatures, mutation} = fn
    // TODO: isMutation(ctx) function as parameter to check for more
    if (mutation?.length && identList?.length) {
      // const iterLength = Math.min(mutation.length, identList.length)
      for (let i = 0; i < identList.length; i++) {
        const ident = identList[i]
        if (ident && mutation.includes(i)) {
          const {identifier, position} = ident
          const info = this.context.peekIdentifier(identifier, [IdentifierKind.LocalVariable, IdentifierKind.GlobalVariable, IdentifierKind.GlobalConst, IdentifierKind.Record, IdentifierKind.FnParam, IdentifierKind.RecordField])
          if (info?.kind === IdentifierKind.GlobalConst) {
            es.push({
              type: SemanticErrorType.ConstantMutation,
              ...position,
              params: {ident: identifier}
            })
          }
        }
      }
    }
    for (let signature of signatures) {
      const inputExpectedLength = signature.input.length
      if (inputExpectedLength !== inputActualLength) {
        continue
      }
      if (inputActualLength > 0) {
        const types = this.context.sliceTypeStack(0 - inputActualLength)
        const {passed, hole} = checkSignature(signature.input, types)
        if (passed) {
          pass = true
          if (!hole) {
            output = signature.output
          }
          break
        }
      }
    }

    if (pass) {
      // popMulti(this.context.typeStack, inputActualLength)
      this.context.removeMultiTypeStack(inputActualLength)
    } else {
      const currentTypesOrdered = this.context.popMultiTypeStack(inputActualLength).reverse() // popMultiStore(this.context.typeStack, inputActualLength).reverse()
      es.push({
        ...position,

        type: SemanticErrorType.TypeMismatchFunction,
        params: {ident: action, got: currentTypesOrdered, expected: fn.signatures}
      })
      output = IdentifierType.Hole
    }

    if (es.length) {
      this.emit("errors", es)
    }

    this.pushTypeStack(output)
  }

  resetTypeStack(types) {
    // if (this.context.typeStack.length) {
    //   this.context.typeStack = []
    // }

    this.context.resetTypeStack(types)
  }

  pushTypeStack(type) {
    this.context.pushTypeStack(type)
  }

  deduceVariableInit() {
    const block = this.context.peekBlock(1)
    const pos = block.position
    const ident = block.metadata.identifier
    const identInfo = this.context.currentMachineBlock.metadata.identifierStack.peek(ident)

    if (!identInfo) {
      console.log("warn: invalid identifier when exit variableDecl", block)
      return
    }

    const type = this.context.popTypeStack() // int a = 1;
      ?? block.metadata?.fieldType // int a;
    const isException = type === IdentifierType.Int && identInfo.type === IdentifierType.Real // that's dangerous ...
    if (type !== identInfo.type && type !== IdentifierType.Hole && !isException) {
      this.emit("errors", [{
        ...pos,

        type: SemanticErrorType.TypeMismatchVarDecl,
        params: {ident, expected: identInfo.type, got: type}
      }])

      // NO PUSH TO TYPE STACK AGAIN
    }


    // this.resetTypeStack()
  }

  deduceToType(type, position = null, pushType = null, allowNull = false) {
    const actualType = this.context.popTypeStack()
    const isCorrect = actualType === type
      || actualType === IdentifierType.Hole
      || (allowNull && actualType == null)

    if (pushType != null) {
      this.pushTypeStack(pushType)
    }

    if (!isCorrect) {
      this.emit("errors", [{
        ...(position ?? this.context.peekBlock().position),

        type: SemanticErrorType.TypeMismatchExpr,
        params: {expected: [type], got: [actualType]}
      }])
    }
  }

  deduceToMultiTypes(types, position, pushType = null, pushSelf = false) {
    const actualType = this.context.popTypeStack()
    const isCorrect = types.includes(actualType) || actualType === IdentifierType.Hole

    if (pushType != null || pushSelf) {
      this.pushTypeStack(pushType == null ? actualType : pushType)
    }

    if (!isCorrect) {
      this.emit("errors", [{
        ...position,

        type: SemanticErrorType.TypeMismatchExpr,
        params: {expected: types, got: [actualType]}
      }])
    }
  }

  deduceAllToType(type, position, pushType = null, atLeast = 1) {
    const actualTypes = this.context.getTypeStack()
    const isCorrect = (atLeast === 0 && actualTypes.length === 0)
      || (
        actualTypes.length >= atLeast
        && actualTypes.every(actualType =>
          actualType === type
          || actualType === IdentifierType.Hole
        )
      )

    if (pushType != null) {
      this.context.resetTypeStack([pushType])
    }

    if (!isCorrect) {
      this.emit("errors", [{
        ...position,

        type: SemanticErrorType.TypeMismatchExpr,
        params: {expected: [type], got: actualTypes, minLength: atLeast}
      }])
    }
  }

  checkNamedExpr(position, allowedScopes = []) {
    const scope = this.context.peekScope()
    if (!scope) {
      console.log("warn: use of initial without scope")
      return false
    }

    return allowedScopes.includes(scope.type)
  }

  checkOption(optName, lit) {
    const block = this.context.peekBlock()
    const position = block.position
    block.metadata.position = position
    block.metadata.name = optName
    block.metadata.value = lit
    // this.emitLangComponent(context, {name: optName, value: lit})

    const opt = optionAcceptableValues.get(optName)
    if (!opt) {
      return
    }

    if (this.context.isOptionDefined(optName)) {
      this.emit("errors", [{
        ...position,

        type: SemanticErrorType.CompilerOptionDuplicated,
        params: {ident: optName}
      }])
      return
    }

    const es = []

    const {values, regex, description} = opt
    if (values && !values.includes(lit)) {
      es.push({
        ...position,

        type: SemanticErrorType.TypeMismatchCompilerOption,
        params: {ident: optName, expected: values}
      })
    }

    if (regex && !regex.test(lit)) {
      es.push({
        ...position,

        type: SemanticErrorType.TypeMismatchCompilerOption,
        params: {ident: optName, desc: description}
      })
    }

    this.context.addDefinedOption(optName, lit, position)

    if (es.length) {
      this.emit("errors", es)
    }
  }

  handleInitialExpr(position) {
    const scopes = [SemanticContextType.StateScope, SemanticContextType.GoalScope, SemanticContextType.InvariantScope]

    const valid = this.checkNamedExpr(
      position,
      // `'initial' expression can only be used in global / state / node scope, and not in constant definition`,
      scopes
    )

    if (!valid) {
      this.emit("errors", [{
        type: SemanticErrorType.InvalidNamedExprScope,
        ...position,
        params: {
          ident: "initial",
          scopes
        }
      }])
    }
  }

  handleFreshExpr(position) {
    const scopes = [SemanticContextType.StateScope, SemanticContextType.GoalScope, SemanticContextType.InvariantScope]
    const valid = this.checkNamedExpr(
      position,
      // `'fresh' expression can only be used in global / state / node scope, and not in constant definition`,
      scopes
    )

    if (!valid) {
      this.emit("errors", [{
        type: SemanticErrorType.InvalidNamedExprScope,
        ...position,
        params: {
          ident: "fresh",
          scopes
        }
      }])
    }
  }

  handleStateDecl(attrs) {
    const block = this.context.peekBlock()
    const position = block.position
    const es = []

    block.metadata.attributes = attrs

    const invalidComboIdx = firstCombo(attrs, invalidNodeModifierCombo)
    if (invalidComboIdx !== -1) {
      es.push({
        ...position,
        type: SemanticErrorType.InvalidNodeModifier,
        params: {combination: invalidNodeModifierCombo[invalidComboIdx]}
      })
    }

    const dup = findDuplications(attrs)
    if (dup.size) {
      es.push({
        ...position,
        type: SemanticErrorType.InvalidNodeModifier,
        params: {duplication: [...dup]}
      })
    }

    const identifier = block.metadata.identifier
    const machine = this.context.currentMachineBlock
    if (attrs.includes("start")) {
      const startIdent = machine.metadata.startNodeIdentifier
      if (startIdent != null) {
        es.push({
          ...position,

          type: SemanticErrorType.StartNodeDuplicated,
          params: {ident: startIdent}
        })
      } else {
        machine.metadata.startNodeIdentifier = identifier
      }
    }


    if (
      (attrs.includes("abstract") || attrs.length === 1)
      && block.metadata.hasChildren === true
    ) {
      es.push({
        ...position,

        type: SemanticErrorType.CodeInsideAbstractNode,
      })
    }

    if (es.length) {
      this.emit("errors", es)
    }
    machine.metadata.stateSet.add(identifier)
  }

  handleStateScope(hasStatement) {
    this.context.peekBlock().metadata.hasChildren = hasStatement
  }

  handleGoal() {
    // const block = this.context.peekBlock()
    this.context.currentMachineBlock.metadata.goalDefined = true
    // this.emit("lang:goal", block)
  }

  handleMachineDeclEnter(keyword, keywordPosition) {
    const block = this.context.peekBlock()
    block.metadata.keywordPosition = keywordPosition
    block.metadata.keyword = keyword
    // this.emitLangComponent(context, {keyword})
  }

  handleMachineDeclExit() {
    const block = this.context.peekBlock()
    const pos = block.metadata.keywordPosition
    if (!pos) {
      return
    }

    const es = []
    if (!block.metadata.goalDefined) {
      es.push({
        ...pos,

        type: SemanticErrorType.NoGoalDefined,
      })
    }

    if (block.metadata.startNodeIdentifier == null) {
      es.push({
        ...pos,

        type: SemanticErrorType.NoStartNodeDefined
      })
    }

    if (es.length) {
      this.emit("errors", es)
    }
  }

  handleReturn(position, allowedCtxName) {
    const stmt = this.context.peekBlock()
    const notStatement = stmt?.type !== SemanticContextType.Statement
    let isNested = false
    if (notStatement) {
      // invalid return statement - return xxx cannot be used as an initializer.
      this.emit("errors", [{
        ...position,
        type: SemanticErrorType.ReturnExprViolation,
        params: {isOutOfStatement: true}
      }])
      // this return is used as a expression
      // this.pushTypeStack(IdentifierType.Hole)
      // return
    } else {
      // mark stmt as return expr
      stmt.metadata.isReturn = true
      if (stmt.metadata.exprStack.slice(0, -1).some(ctxName => ctxName !== allowedCtxName)) {
        this.emit("errors", [{
          ...position,
          type: SemanticErrorType.ReturnExprViolation,
          params: {isOutOfStatement: true}
        }])
        // nested return expression
        isNested = true


        // return
      }
    }

    // console.log(stmt.metadata.exprStack, CycloneParser.ParExpressionContext.name)



    const scope = this.context.findNearestScope(SemanticContextType.FnBodyScope)

    if (!scope) {
      this.emit("errors", [{
        ...position,

        type: SemanticErrorType.ReturnExprViolation,
        params: {isOutOfFunction: true}
      }])

      return
    }

    if (scope.metadata.isReturned || isNested) {
      return
    }

    scope.metadata.isReturned = true

    const decl = this.context.findNearestBlock(SemanticContextType.FnDecl)
    if (!decl) {
      console.log("warn: unknown function declaration", position)
      return
    }

    const type = this.context.popTypeStack() ?? IdentifierType.Hole
    const expectedType = decl.metadata.signatures[0].output
    if (type !== expectedType) {
      this.emit("errors", [{
        ...position,

        type: SemanticErrorType.TypeMismatchReturn,
        params: {expected: expectedType, got: type}
      }])
    }
  }

  handleStatementEnter(position) {
    // this.emitLangComponent(context, null)

    const scope = this.context.peekScope()
    if (scope && scope.type === SemanticContextType.FnBodyScope && scope.metadata.isReturned) {
      this.emit("errors", [{
        ...position,

        type: SemanticErrorType.StatementAfterReturn
      }])
    }
  }

  handleStatementExit(position) {
    const isReturnExpr = this.context.peekBlock().metadata.isReturn
    if (!isReturnExpr) {
      const type = this.context.peekTypeStack()
      if (type != null && type !== IdentifierType.Hole && type !== IdentifierType.Bool) {
        this.emit("errors", [{
          ...position,
          params: {got: type},

          type: SemanticErrorType.InvalidStatement
        }])
      }
    }
    this.resetTypeStack()
  }

  handleTransExclusion(idents) {
    const transDecl = this.context.findNearestBlock(SemanticContextType.TransDecl).metadata
    for (let id of idents) {
      transDecl.excludedStates.push(id)
    }

    // block.metadata.exclusionFlag = isEnter
  }

  handleTransOp(op) {
    this.context.findNearestBlock(SemanticContextType.TransDecl).metadata.operators.add(op)
  }

  handleTransToStates(idents) {
    const trans = this.context.findNearestBlock(SemanticContextType.TransDecl).metadata
    const s = new Set()
    for (let {identifier, position} of idents) {
      trans.toStates.push(identifier)
      if (s.has(identifier)) {
        this.emit("errors", [{
          ...position,
          params: {block: SemanticContextType.TransDecl, identifier},

          type: SemanticErrorType.DuplicatedEdgeTarget
        }])
      } else {
        s.add(identifier)
      }
    }
  }

  handleTransLabel(label, labelKeywordIsLabel) {
    const block = this.context.findNearestBlock(SemanticContextType.TransDecl)

    // get rid of ""
    block.metadata.label = label.slice(1, label.length - 1).trim()
    block.metadata.labelKeyword = labelKeywordIsLabel ? "label" : "on"
  }

  handleWhereExpr(expr, position) {
    const transBlock = this.context.findNearestBlock(SemanticContextType.TransDecl)

    // const block = this.context.peekBlock(1)
    const sanitized = expr
      .slice("where ".length)
      .replace(/(?:\r\n|\r|\n)/g, " ")
      .replace(/\s\s+/g, " ")

    if (transBlock) {
      transBlock.metadata.whereExpr = sanitized
    } else if (this.context.findNearestBlock(SemanticContextType.LocalVariableGroup)) {
      this.emit("errors", [{
        ...position,
        type: SemanticErrorType.WhereInlineVariable
      }])
    }

    this.context.peekBlock().metadata.expr = sanitized

    // this.emitLangComponent(ctx, null)
  }

  handleTrans() {
    const block = this.context.peekBlock()
    const position = block.position
    const md = block.metadata
    const {fromState, toStates, operators, excludedStates, identifier} = md
    const es = []
    const excludedStatesSet = new Set(excludedStates)
    const isAnon = isAnonymousEdge(md)

    if (isAnon && identifier != null) {
      es.push({
        ...position,
        type: SemanticErrorType.AnonymousEdgeIdentifier
      })
    }

    if (!md.whereExpr) {
      const label = edgeIndex(fromState, operators, new Set(toStates), excludedStatesSet)
      const machine = this.context.currentMachineBlock
      if (machine.metadata.transitionSet.has(label)) {
        es.push({
          ...position,
          type: SemanticErrorType.DuplicatedEdge
        })
      } else {
        machine.metadata.transitionSet.add(label)
      }
    }

    const machine = this.context.currentMachineBlock

    const targetStates = edgeTargets({operators, toStates, fromState, excludedStates}, [...machine.metadata.stateSet])

    if (targetStates.size === 0) {
      es.push({
        ...position,
        type: SemanticErrorType.EmptyEdge
      })
    }

    if (es.length) {
      this.emit("errors", es)
    }

    block.metadata.involvedStates = targetStates

    // this.emit("lang:transition", {metadata: md, targetStates, position, expr})
    // this.emitLangComponent(context, {targetStates})
  }

  handleTransKeyword(keyword) {
    const block = this.context.peekBlock()
    block.metadata.keyword = keyword
  }

  handleTransScope(ident) {
    if (ident) {
      this.context.findNearestBlock(SemanticContextType.TransDecl).metadata.fromState = ident
    } else {
      console.trace("warn: start state not found for trans")
    }
  }

  handleInExpr(identifiers) {
    if (identifiers?.length) {
      const assertionBlock = this.context.findNearestBlock(SemanticContextType.AssertExpr)
      if (assertionBlock) {
        assertionBlock.metadata.inExpr = true
      }
      // if (assertionBlock) {
      //   this.emit("lang:assertion:states", {expr, position: parentExprPos, identifiers})
      // } else {
      //   const invariantBlock = this.context.findNearestBlock(SemanticContextType.InvariantDecl)
      //   if (invariantBlock) {
      //     const name = invariantBlock.metadata.identifier
      //     this.emit("lang:invariant:states", {name, identifiers})
      //   }
      // }
      const identsArr = this.context.peekBlock().metadata.identifiers
      const s = new Set()
      for (let {identifier, position} of identifiers) {
        identsArr.push(identifier)
        if (s.has(identifier)) {
          this.emit("errors", [{
            ...position,
            params: {block: SemanticContextType.InExpr, identifier},

            type: SemanticErrorType.DuplicatedEdgeTarget
          }])
        } else {
          s.add(identifier)
        }
      }
    }
  }

  handleStopExpr(identifiers) {
    const def = this.context.peekScope()
    // if (keyword) {
    //   def.metadata.stopKeyword = keyword
    // }
    if (identifiers?.length) {
      const s = new Set()
      for (let {identifier, position} of identifiers) {
        def.metadata.states.push(identifier)
        if (s.has(identifier)) {
          this.emit("errors", [{
            ...position,
            params: {block: SemanticContextType.Stop, identifier},

            type: SemanticErrorType.DuplicatedEdgeTarget
          }])
        } else {
          s.add(identifier)
        }
      }
    }
  }

  handleWithExpr(identifiers) {
    const def = this.context.peekScope()
    if (identifiers?.length) {
      const s = new Set()
      for (let {identifier, position} of identifiers) {
        def.metadata.invariants.push(identifier)
        if (s.has(identifier)) {
          this.emit("errors", [{
            ...position,
            params: {block: SemanticContextType.With, identifier},

            type: SemanticErrorType.DuplicatedEdgeTarget
          }])
        } else {
          s.add(identifier)
        }
      }
    }
  }

  handleCheckExpr(expr) {
    // this.context.peekScope().metadata.keyword = keyword
    const goal = this.context.peekScope()
    // goal.metadata.expr = expr
    goal.metadata.finalPosition = this.context.peekBlock().position
    goal.metadata.expr = expr

    // this.emitLangComponent(context, null)
  }

  handleCheckForExpr(pathLengths) {
    const pathSet = new Set()
    const es = []
    for (let {text, position} of pathLengths) {
      if (pathSet.has(text)) {
        es.push({
          type: SemanticErrorType.DuplicatedCheckForPathLength,
          params: {text},
          ...position
        })
      } else {
        pathSet.add(text)
      }

      const num = parseInt(text)
      if (isNaN(num) || num < 1) {
        es.push({
          type: SemanticErrorType.InvalidCheckForPathLength,
          params: {text},
          ...position
        })
      }
    }

    if (es.length) {
      this.emit("errors", es)
    }
  }

  // handleCheckMainExpr(expr) {
  //   this.context.peekScope().metadata.expr = expr
  // }

  handleExpressionEnter(ctxName) {
    const block = this.context.peekBlock()
    // if (block.type === SemanticContextType.FnCall) {
    //   block.metadata.gotParams += 1
    // }

    switch (block.type) {
      case SemanticContextType.FnCall: {
        block.metadata.gotParams += 1
        break
      }
      case SemanticContextType.Statement: {
        block.metadata.exprStack.push(ctxName)
        break
      }
    }
  }

  handleExpressionExit() {
    const block = this.context.peekBlock()
    if (block.type === SemanticContextType.Statement) {
      block.metadata.exprStack.pop()
    }
  }

  handlePathCondAssign(expr) {
    this.deduceToType(IdentifierType.Bool)
    const decl = this.context.findNearestBlock(SemanticContextType.LetDecl)
    if (decl) {
      // decl.metadata.hasBody = true
      decl.metadata.body = expr
    }
  }

  handleLetExpr() {
    const block = this.context.peekBlock()
    const position = block.position
    this.deduceToType(IdentifierType.Bool, position, null, true)
    if (block.type === SemanticContextType.LetDecl && !block.metadata.body) {
      this.emit("errors", [{
        ...position,
        type: SemanticErrorType.LetBodyUndefined
      }])
    } else if (block.type !== SemanticContextType.LetDecl) {
      console.log("warn: let block not found")
    }
  }

  handleAssertExpr(modifier) {
    if (modifier) {
      const block = this.context.peekBlock()
      if (block.metadata.inExpr) {
        this.emit("errors", [{
          ...block.position,
          type: SemanticErrorType.AssertModifierInExpr
        }])
      }
    }

    this.deduceToType(IdentifierType.Bool)
  }

  registerTypeForVariableDecl() {
    const prevBlock = this.context.peekBlock(1)
    if (singleTypedDeclarationGroupContextType.has(prevBlock.type)) {
      this.context.peekBlock().metadata.fieldType = prevBlock.metadata.fieldType
    }
  }

  handleIntLiteral() {
    const blockType = this.context.peekBlock().type
    if (blockType !== SemanticContextType.StateInc && blockType !== SemanticContextType.PathPrimary) {
      this.pushTypeStack(IdentifierType.Int)
    }
  }

  handleAnalyzeOptions() {
    const trace = this.context.getDefinedOption("trace")
    const out = this.context.getDefinedOption("output")
    if (trace?.literal !== "true" && out) {
      const {position} = out
      this.emit("errors", [{
        type: SemanticErrorType.OptionTraceNotFound,
        ...position
      }])
    }
  }
}