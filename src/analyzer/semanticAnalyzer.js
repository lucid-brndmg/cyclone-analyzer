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
  declarationGroupContextTypeToIdentifierKind, identifierKindShouldHasReference,
  identifierKindToType,
  identifierNoPushTypeStackBlocks, invalidNodeModifierCombo, literalBounds,
  optionAcceptableValues, parametrizationTypes,
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
import {
  edgeIndex,
  edgeTargets,
  edgeTargetsFromExpanded,
  expandEdge,
  isAnonymousEdge,
  isClosureEdge, possibleMaxPathLength
} from "../utils/edge.js";
import {checkOperateTypeParams, checkSignature, checkTypeParameters} from "../utils/type.js";
import TypeInfo from "./typeInfo.js";
import {elementEq, firstOfSet} from "../lib/set.js";

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
      for (const h of this.events.get(event)) {
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
    // if (singleTypedDeclarationGroupContextType.has(block.type)) {
    //   this.handlePopSingleDeclGroup(block)
    // }
    this.emitBlock(false, payload, block)
    return this.context.popBlock()
  }
  referenceEnum(identText, position) {
    this.emit("identifier:reference", {references: [{text: identText, position, kinds: [IdentifierKind.EnumField]}]})
    this.context.pushTypeStack(TypeInfo.identifier(IdentifierType.Enum, null, identText, IdentifierKind.EnumField))
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
    const prev = this.context.peekBlock(1)
    const scope = this.context.peekScope()
    if (!scope) {
      console.log("warn: scope not found", blockType, identText, identPos)
    }

    let identKind = declarationContextTypeToIdentifierKind[blockType]
      ?? IdentifierKind.Unknown
    if (identKind === IdentifierKind.Unknown) {
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
          signature: block.metadata.signature
        })
        fnSignature = block.metadata.signature
        // block.metadata.identifier = identText
        break
      }

      case SemanticContextType.EnumDecl: {
        isEnum = true
        machineCtx.enumFields.set(identText, prev.metadata.enums)
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
    if (isEnum) {
      const payload = {
        text: identText,
        type,
        position: identPos,
        kind: identKind,
        blockType,
        recordIdent,
        isEnum // true
      }
      this.emit("identifier:register", payload)
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
      case IdentifierKind.Invariant: {
        exists = identStack.exists(identText, payload => payload.kind === IdentifierKind.Invariant)
        break
      }
    }
    let typeParams = null
    if (singleTypedDeclarationGroupContextType.has(prev?.type)) {
      prev.metadata.identifiers.push(identText)
      if (recordIdent) {
        prev.metadata.parent = recordIdent
      }
      typeParams = prev.metadata.fieldTypeParams
    }

    const info = {
      position: identPos,
      kind: identKind,
      text: identText,
      type,
      typeParams,
      recordIdent,
      blockType,
      recordChild: [],
      fnSignature,
      fnParams: [],
      enums: type === IdentifierType.Enum ? prev.metadata.enums : undefined,
      isEnum // false
    }
    this.emit("identifier:register", info)
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
    machineCtx.referenceCounts.set(info, 0)
    if (exists) {
      this.emit("errors", [{
        ...identPos,

        type: SemanticErrorType.IdentifierRedeclaration,
        params: {ident: identText, recordIdent, kind: identKind}
      }])
    }
  }

  // checks identifier usage (reference)
  referenceIdentifier(blockType, identText, identPos) {
    // check existence
    const errParams = {
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
        errParams.desc = "node"
        break
      }

      case SemanticContextType.PathAssignStatement: {
        kindLimitations = [IdentifierKind.Let]
        errParams.desc = "path variable"
        break
      }
      case SemanticContextType.LetDecl:
      case SemanticContextType.StateInc: {
        kindLimitations = [IdentifierKind.State, IdentifierKind.Let]
        errParams.desc = "node / path"
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
        errParams.desc = "variable / constant"
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
        errParams.desc = "variable / constant"
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
    }

    if (kindLimitations && !foundIdent) {
      foundIdent = this.context.peekIdentifier(identText, kindLimitations)
    }

    if (!foundIdent) {
      es.push({
        ...identPos,

        type: SemanticErrorType.UndefinedIdentifier,
        params: errParams
      })
    }

    if (identifierKindShouldHasReference.has(foundIdent?.kind)) {
      const counts = this.context.currentMachineBlock.metadata.referenceCounts
      counts.set(foundIdent, (counts.get(foundIdent) ?? 0) + 1)
    }

    if (!shouldNotPushTypeStackBlocks) {
      const ty = foundIdent?.type
        ? TypeInfo.identifier(foundIdent.type, foundIdent.typeParams, identText, foundIdent.kind)
        : TypeInfo.hole()
      this.context.pushTypeStack(ty)
    }
    this.emit("identifier:reference", {references: [{position: identPos, text: identText, kinds: kindLimitations ?? []}]})
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
    this.emit("identifier:reference", {references: [{position: parentPos, text: parentIdentText, kinds: [IdentifierKind.Record]}, {position: identPos, text: identText, kinds: [IdentifierKind.RecordField]}]})

    if (!scope) {
      console.log("warn: scope not found when reference record field", parentIdentText, identText, identPos)
    }

    const record = this.context.peekIdentifier(parentIdentText, [IdentifierKind.Record])
    // const hasRecord = machineCtx.identifierStack.exists(parentIdentText, ({kind}) => kind === IdentifierKind.Record)

    // const hasRecord = ident && ident.kind === IdentifierKind.Record
    if (record) {
      machineCtx.referenceCounts.set(record, (machineCtx.referenceCounts.get(record) ?? 0) + 1)
    } else {
      es.push({
        ...parentPos,

        type: SemanticErrorType.UndefinedIdentifier,
        params: {desc: "record", ident: parentIdentText}
      })
    }
    const hasRecordField = record && machineCtx.recordFieldStack.getLength(parentIdentText, identText) > 0 // this.context.recordCounts.hasCounts([parentIdentText], identText)
    if (!hasRecordField) {
      es.push({
        ...identPos,

        type: SemanticErrorType.UndefinedIdentifier,
        params: {desc: "record field", ident: `${parentIdentText}.${identText}`}
      })
      this.context.pushTypeStack(TypeInfo.hole())
    } else {
      const recordField = machineCtx.recordFieldStack.peek(parentIdentText, identText)
      this.context.pushTypeStack(TypeInfo.identifier(recordField.type, recordField.typeParams, identText, IdentifierKind.RecordField, {parent: parentIdentText}))
      machineCtx.referenceCounts.set(recordField, (machineCtx.referenceCounts.get(recordField) ?? 0) + 1)
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

  // 'int', 'real', 'bool', 'bv', 'char', 'enum', etc
  handleTypeToken(typeText, position, params = null) {
    const block = this.context.peekBlock()
    if (!block) {
      console.log("warn: block type not found")
      return
    }

    const type = typeTokenToType[typeText]
      ?? IdentifierType.Hole
    const blockType = block.type
    const es = []

    switch (blockType) {
      case SemanticContextType.FnDecl: {
        block.metadata.signature.output = type
        block.metadata.signature.outputParams = params
        break
      }

      case SemanticContextType.FnParamsDecl: {
        const fnBlock = this.context.findNearestBlock(SemanticContextType.FnDecl)
        if (fnBlock) {
          fnBlock.metadata.signature.input.push(type)
          fnBlock.metadata.signature.inputParams.push(params)
          const currentIdentText = block.metadata.identifier
          const machineCtx = this.context.currentMachineBlock.metadata
          const currentIdent = machineCtx.identifierStack.findLast(currentIdentText, ({kind}) => kind === IdentifierKind.FnParam)
          if (currentIdent) {
            currentIdent.type = type
            currentIdent.typeParams = params
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
          block.metadata.fieldTypeParams = params

          if ((blockType === SemanticContextType.GlobalConstantGroup || blockType === SemanticContextType.LocalVariableGroup) && typeText === "enum") {
            es.push({
              ...position,

              type: SemanticErrorType.EnumNotAllowedInVariable,
            })
          }
        }

        break

      }
    }
    if (params) {
      const e = checkTypeParameters(type, params) // this.#checkTypeParams(type, params)
      if (e) {
        es.push({...e, ...position})
      }
    }

    if (es.length) {
      this.emit("errors", es)
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

  findEnumSourceDefinitions(typeInfo) {
    const machineCtx = this.context.currentMachineBlock.metadata
    let srcSet // rhs.identifier

    switch (typeInfo.identifierKind) {
      case IdentifierKind.EnumField: {
        const enums = machineCtx.enumFields.get(typeInfo.identifier)
        if (enums) {
          srcSet = new Set(enums)
        }
        // if (enumIdents) {
        //   const id = firstOfSet(enumIdents)
        //   if (id) {
        //
        //   }
        // }
        break
      }
      case IdentifierKind.RecordField: {
        const parent = typeInfo.metadata.parent
        const ident = typeInfo.identifier
        if (parent) {
          const info = machineCtx.recordFieldStack.peek(parent, ident)
          const enums = info.enums
          if (enums?.length) {
            srcSet = new Set(enums)
          }
        }
        break
      }
      default: {
        const id = typeInfo.identifier
        if (id) {
          const enums = this.context.peekIdentifier(id, [IdentifierKind.RecordField, IdentifierKind.FnParam, IdentifierKind.GlobalConst, IdentifierKind.GlobalVariable, IdentifierKind.LocalVariable])?.enums
          if (enums?.length) {
            srcSet = new Set(enums)
          }
        }
        break
      }
    }

    return srcSet
  }

  #actionTypeParamInheritance(inTypeInfos, signature) {
    const outType = signature.output
    if (parametrizationTypes.has(outType)) {
      const fst = signature.outputParams
        ?? inTypeInfos.find(info => info?.typeParams != null)?.typeParams
      return TypeInfo.action(outType, fst)
    }

    return TypeInfo.action(outType)
  }

  #checkSignatureParams(signature, stackSlice, isMutOpOrFnCall) {
    const es = []

    for (let i = 0; i < signature.inputParams.length; i++) {
      const signParams = signature.inputParams[i]
      const stackInfo = stackSlice[i]
      if (!stackInfo || !signParams) {
        continue
      }
      const stackParams = stackInfo.typeParams
      const e = checkOperateTypeParams(stackInfo.type, signParams, stackParams,
        // TypeInfo.signature(signature.input[i], signParams), stackInfo, isMutOpOrFnCall
      )
      if (e) {
        es.push(e)
      }

      // switch (stackInfo.type) {
      //   case IdentifierType.BitVector: {
      //     if (stackParams != null && !isNaN(signParams[0]) && !isNaN(stackParams[0]) && signParams[0] !== stackParams[0]) {
      //       es.push({
      //         type: SemanticErrorType.InvalidBitVectorOperation,
      //         params: {lhs: signParams[0], rhs: stackParams[0]}
      //       })
      //     }
      //     break
      //   }
      // }
    }

    return es
  }

  deduceActionCall(actionKind, action, inputActualLength, position) {
    // console.log("ACTION", action)
    const fn = this.context.getAction(actionKind, action)
    if (!fn) {
      // This will happen when calling from an unregistered function
      // pushing a hole will save the integrity of the type stack

      // console.log("warn: invalid fn when exit fnCall", action)
      this.context.pushTypeStack(TypeInfo.hole())
      return
    }

    let output = TypeInfo.hole()
    let pass = false
    const es = []
    const {signatures, mutation, isFromMachine} = fn
    const isMutation = mutation?.length
    for (const signature of signatures) {
      const inputExpectedLength = signature.input.length
      if (inputExpectedLength !== inputActualLength) {
        continue
      }
      if (inputActualLength > 0) {
        const typeInfos = this.context.sliceTypeStack(0 - inputActualLength)
        const {passed, hole} = checkSignature(signature.input, typeInfos.map(t => t?.type))

        // console.log("check signature", action, signature.input, "MATCH", typeInfos.map(t => t?.type), "PASSED", passed, "HOLE", hole)

        if (passed) {
          if (signature.inputParams) {
            const paramErrors = this.#checkSignatureParams(signature, typeInfos, isMutation || isFromMachine)
            if (paramErrors) {
              es.push(...paramErrors.map(e => ({...e, ...position})))
            }
          }
          pass = true
          if (!hole) {
            // console.log("OUT", signature.output)
            output = this.#actionTypeParamInheritance(typeInfos, signature) // TypeInfo.action(signature.output)
          }
          break
        }
      }
    }

    if (pass) {
      // popMulti(this.context.typeStack, inputActualLength)
      if (isMutation) {
        for (const idx of mutation) {
          const ti = this.context.indexOfTypeStack(idx)
          if (ti?.isImmutable()) {
            es.push({
              type: SemanticErrorType.InvalidValueMutation,
              ...position,
              params: {ident: ti.identifier, action} // TODO: specific
            })
          }
        }
      }

      if (actionKind === ActionKind.InfixOperator) {
        const [lhs, rhs] = this.context.sliceTypeStack(-2)
        if (lhs && rhs) {
          switch (lhs.type) {
            case IdentifierType.Enum: {
              const lSources = this.findEnumSourceDefinitions(lhs), rSources = this.findEnumSourceDefinitions(rhs)

              if (lSources && rSources && !elementEq(lSources, rSources)) {
                es.push({
                  type: SemanticErrorType.OperatingDifferentEnumSources,
                  ...position,
                  params: {lhs: lSources, rhs: rSources}
                })
              }
              break
            }
            default: {
              const lParams = lhs?.typeParams, rParams = rhs?.typeParams
              const e = checkOperateTypeParams(lhs.type, lParams, rParams)
              if (e) {
                es.push({...e, ...position})
              }
              // if (lParams?.length && rParams?.length && !isNaN(lParams[0]) && !isNaN(rParams[0]) && lParams[0] !== rParams[0]) {
              //   es.push({
              //     type: SemanticErrorType.InvalidBitVectorOperation,
              //     ...position,
              //     params: {lhs: lParams[0], rhs: rParams[0]}
              //   })
              // }
              break
            }
          }
        }
      }

      this.context.removeMultiTypeStack(inputActualLength)
    } else {
      const currentTypesOrdered = this.context.popMultiTypeStack(inputActualLength).reverse() // popMultiStore(this.context.typeStack, inputActualLength).reverse()
      es.push({
        ...position,

        type: SemanticErrorType.TypeMismatchFunction,
        params: {ident: action, got: currentTypesOrdered.map(t => t?.type), expected: fn.signatures}
      })
      // output = IdentifierType.Hole
    }

    if (es.length) {
      this.emit("errors", es)
    }

    this.context.pushTypeStack(output)
  }

  resetTypeStack() {
    this.context.resetTypeStack()
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
    const tsInfo = this.context.popTypeStack()
    const type = tsInfo?.type // int a = 1;
      ?? block.metadata?.fieldType // int a;
    const expectedType = identInfo.type
    const isException = type === IdentifierType.Int && expectedType === IdentifierType.Real // that's dangerous ...
    if (type !== expectedType && type !== IdentifierType.Hole && !isException) {
      this.emit("errors", [{
        ...pos,

        type: SemanticErrorType.TypeMismatchVarDecl,
        params: {ident, expected: expectedType, got: type}
      }])

      // NO PUSH TO TYPE STACK AGAIN
    } else if (tsInfo && type === expectedType) {
      const e = checkOperateTypeParams(type, identInfo.typeParams, tsInfo.typeParams)
      if (e) {
        this.emit("errors", [{
          ...pos,
          ...e
        }])
      }
    }

    // this.resetTypeStack()
  }

  deduceToType(type, position = null, pushType = null, allowNull = false) {
    const actualTypeInfo = this.context.popTypeStack()
    const actualType = actualTypeInfo?.type
    const isCorrect = actualType === type
      || actualType === IdentifierType.Hole
      || (allowNull && actualType == null)

    if (pushType != null) {
      this.context.pushTypeStack(TypeInfo.action(pushType, actualType === pushType ? actualTypeInfo.typeParams : null))
    }

    if (!isCorrect) {
      this.emit("errors", [{
        ...(position ?? this.context.peekBlock().position),

        type: SemanticErrorType.TypeMismatchExpr,
        params: {expected: [type], got: [actualType]}
      }])
    }
  }

  deduceToMultiTypes(types, position, pushType, action, isMutableOnly = false) {
    const actualTypeInfo = this.context.popTypeStack()
    const actualType = actualTypeInfo?.type
    const isCorrect = types.includes(actualType) || actualType === IdentifierType.Hole

    if (pushType != null) {
      const typeParams = parametrizationTypes.has(actualType) ? actualTypeInfo.typeParams : null
      this.context.pushTypeStack(TypeInfo.action(pushType, typeParams))
    }

    const es = []

    if (!isCorrect) {
      es.push({
        ...position,

        type: SemanticErrorType.TypeMismatchExpr,
        params: {expected: types, got: [actualType]}
      })
    }

    if (isMutableOnly && actualTypeInfo?.isImmutable()) {
      es.push({
        ...position,
        type: SemanticErrorType.InvalidValueMutation,
        params: {ident: actualTypeInfo.identifier, action}
      })
    }

    if (es.length) {
      this.emit("errors", es)
    }
  }

  deduceMultiToType(type, position, length, pushType = null) {
    // consume {length} of types
    const typeStack = this.context.popMultiTypeStack(length)
    const actualTypes = typeStack.map(ty => ty?.type)
    const isCorrect = (length === 0 && actualTypes.length === 0)
      || (
        actualTypes.length === length
        && actualTypes.every(actualType =>
          actualType === type
          || actualType === IdentifierType.Hole
        )
      )

    if (pushType != null) {
      const fstInfo = typeStack.find(info => info?.typeParams != null)
      // produce a return type
      this.context.pushTypeStack(TypeInfo.action(pushType, fstInfo?.type === pushType ? fstInfo.typeParams : null))
    }

    if (!isCorrect) {
      this.emit("errors", [{
        ...position,

        type: SemanticErrorType.TypeMismatchExpr,
        params: {expected: [type], got: actualTypes, length}
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

    if (this.context.isOptionDefined(optName)) {
      this.emit("errors", [{
        ...position,

        type: SemanticErrorType.CompilerOptionDuplicated,
        params: {ident: optName}
      }])
      return
    }

    const es = []
    const opt = optionAcceptableValues.get(optName)
    if (opt) {
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

    }

    this.context.addDefinedOption(optName, lit, position)

    if (es.length) {
      this.emit("errors", es)
    }
  }

  handleInitialExpr(position) {
    const scopes = [SemanticContextType.StateScope, SemanticContextType.GoalScope, SemanticContextType.InvariantScope, SemanticContextType.MachineScope]

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

  handlePrevExpr(position) {
    const scopes = [SemanticContextType.StateScope, SemanticContextType.GoalScope, SemanticContextType.InvariantScope, SemanticContextType.MachineScope]

    const valid = this.checkNamedExpr(
      position,
      scopes
    )

    if (!valid) {
      this.emit("errors", [{
        type: SemanticErrorType.InvalidNamedExprScope,
        ...position,
        params: {
          ident: "prev",
          scopes
        }
      }])
    }
  }

  handleFreshExpr(position) {
    const scopes = [SemanticContextType.StateScope, SemanticContextType.InvariantScope, SemanticContextType.MachineScope]
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

  handleStateDecl(attrs, identPosition) {
    const block = this.context.peekBlock()
    // const position = block.position
    const es = []

    block.metadata.attributes = attrs
    block.metadata.position = identPosition

    const invalidComboIdx = firstCombo(attrs, invalidNodeModifierCombo)
    if (invalidComboIdx !== -1) {
      es.push({
        ...identPosition,
        type: SemanticErrorType.InvalidNodeModifier,
        params: {combination: invalidNodeModifierCombo[invalidComboIdx]}
      })
    }

    const dup = findDuplications(attrs)
    if (dup.size) {
      es.push({
        ...identPosition,
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
          ...identPosition,

          type: SemanticErrorType.StartNodeDuplicated,
          params: {ident: startIdent}
        })
      } else {
        machine.metadata.startNodeIdentifier = identifier
      }
    }

    if (attrs.includes("final")) {
      machine.metadata.finalNodeIdentifiers.push(identifier)
    }

    if (
      (attrs.includes("abstract") || attrs.length === 1)
      && block.metadata.hasChildren === true
    ) {
      es.push({
        ...identPosition,

        type: SemanticErrorType.CodeInsideAbstractNode,
      })
    }

    if (es.length) {
      this.emit("errors", es)
    }
    machine.metadata.stateMap.set(identifier, block.metadata)
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
    const {keywordPosition, stateMap, referenceCounts} = block.metadata
    // const pos = block.metadata.keywordPosition
    if (!keywordPosition) {
      return
    }

    const es = []
    if (!block.metadata.goalDefined) {
      es.push({
        ...keywordPosition,

        type: SemanticErrorType.NoGoalDefined,
      })
    }

    if (block.metadata.startNodeIdentifier == null) {
      es.push({
        ...keywordPosition,

        type: SemanticErrorType.NoStartNodeDefined
      })
    }

    for (const nodeInfo of stateMap.values()) {
      if (nodeInfo.edgeSource <= 0 && nodeInfo.edgeTargets <= 0) {
        es.push({
          type: SemanticErrorType.NodeUnconnected,
          ...nodeInfo.position
        })
      }
    }

    for (const [info, counts] of referenceCounts) {
      if (!info) {
        continue
      }
      const {kind, text, position} = info
      if (counts === 0 && identifierKindShouldHasReference.has(kind)) {
        es.push({
          type: SemanticErrorType.IdentifierNeverUsed,
          ...position,
          params: {text, kind}
        })
      }
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

    const type = this.context.popTypeStack()?.type ?? IdentifierType.Hole
    const expectedType = decl.metadata.signature.output
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
      const type = this.context.peekTypeStack()?.type
      if (type != null && type !== IdentifierType.Hole && type !== IdentifierType.Bool) {
        this.emit("errors", [{
          ...position,
          params: {got: type},

          type: SemanticErrorType.InvalidStatement
        }])
      }
    }
    this.context.resetTypeStack()
  }

  handleTransExclusion(idents) {
    const transDecl = this.context.findNearestBlock(SemanticContextType.TransDecl).metadata
    for (const id of idents) {
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
    for (const {identifier, position} of idents) {
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

  markStatesForEdge(source, targets, exclusions) {
    const stateMap = this.context.currentMachineBlock.metadata.stateMap
    if (stateMap.has(source)) {
      stateMap.get(source).edgeSource ++
    }

    for (const t of targets) {
      if (stateMap.has(t)) {
        stateMap.get(t).edgeTargets ++
      }
    }

    for (const e of exclusions) {
      if (stateMap.has(e)) {
        stateMap.get(e).edgeExclusions ++
      }
    }
  }

  handleTrans() {
    const block = this.context.peekBlock()
    const position = block.position
    const md = block.metadata
    const {fromState, toStates, operators, excludedStates, identifier} = md
    const es = []
    const excludedStatesSet = new Set(excludedStates)
    const isAnonymous = isAnonymousEdge(md)
    const machine = this.context.currentMachineBlock
    const machineData = machine.metadata

    if (isAnonymous && identifier != null) {
      es.push({
        ...position,
        type: SemanticErrorType.AnonymousEdgeIdentifier
      })
    }

    if (!md.whereExpr) {
      const label = edgeIndex(fromState, operators, new Set(toStates), excludedStatesSet)
      if (machineData.transitionIndexSet.has(label)) {
        es.push({
          ...position,
          type: SemanticErrorType.DuplicatedEdge
        })
      } else {
        machineData.transitionIndexSet.add(label)
      }
    }

    if (machineData.stateList == null) {
      machineData.stateList = [...machineData.stateMap.keys()]
    }

    const solvedRelations = expandEdge(md, machineData.stateList)
    const solvedTargets = edgeTargetsFromExpanded(solvedRelations)

    if (solvedTargets.size === 0) {
      es.push({
        ...position,
        type: SemanticErrorType.EmptyEdge
      })
    }

    if (es.length) {
      this.emit("errors", es)
    }

    this.markStatesForEdge(fromState, solvedTargets, excludedStates)

    md.involvedStates = solvedTargets
    md.involvedRelations = solvedRelations
    md.isAnonymous = isAnonymous
    machineData.transitionDefinitions.push(md)
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
      for (const {identifier, position} of identifiers) {
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
      for (const {identifier, position} of identifiers) {
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
      for (const {identifier, position} of identifiers) {
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

  handleCheckExprEnter(expr, checkKeyword) {
    // this.context.peekScope().metadata.keyword = keyword
    const goal = this.context.peekScope()
    // goal.metadata.expr = expr
    goal.metadata.finalPosition = this.context.peekBlock().position
    goal.metadata.expr = expr
    goal.metadata.checkKeyword = checkKeyword

    // this.emitLangComponent(context, null)
  }

  handleCheckExprExit() {
    const goal = this.context.peekScope()
    const machineData = this.context.currentMachineBlock.metadata
    const validStates = new Set(machineData.stateList)
    const edgeRelations = machineData.transitionDefinitions.flatMap(md => md.involvedRelations)
    const start = machineData.startNodeIdentifier
    const terminalStates = new Set(goal.metadata.states.concat(machineData.finalNodeIdentifiers))
    const pathLengthSet = goal.metadata.validCheckPathLengths
    const es = []
    if (!terminalStates.size) {
      es.push({
        type: SemanticErrorType.NoFinalStateOrReachSpecified,
        ...machineData.keywordPosition
      })
    }
    const pathTerminalStates = new Set(
      goal.metadata.states.length
        ? goal.metadata.states
        : machineData.finalNodeIdentifiers
    )
    if (validStates.size && edgeRelations.length && start != null && pathLengthSet?.size && pathTerminalStates.size) {
      const block = this.context.peekBlock()
      const length = possibleMaxPathLength(start, validStates, edgeRelations, pathTerminalStates)

      // console.log("max", length, pathTerminalStates)
      if (length !== Number.POSITIVE_INFINITY) {
        const unreachableLengths = [...pathLengthSet].filter(l => l > length)
        if (unreachableLengths.length) {
          // one of the most tricky errors to check
          // possibly not accurate
          // do not use this number as a strict result
          es.push({
            type: SemanticErrorType.UnreachableCheckForPathLength,
            ...block.position,
            params: {length, unreachableLengths}
          })
        }
      }
    }

    if (es.length) {
      this.emit("errors", es)
    }
  }

  handleCheckForExpr(pathLengths, kwd, pos) {
    const es = []
    const goal = this.context.peekScope()
    const goalKeyword = goal.metadata.checkKeyword

    if ((kwd === "upto" || goalKeyword === "enumerate") && pathLengths.length > 1) {
      es.push({
        type: SemanticErrorType.CheckUnsupportedRangeMode,
        params: {length: pathLengths.length},
        ...pos
      })
    }

    const pathSet = new Set()
    for (const {text, position} of pathLengths) {
      const num = parseInt(text)

      if (isNaN(num) || num < 1) {
        es.push({
          type: SemanticErrorType.InvalidCheckForPathLength,
          params: {text},
          ...position
        })
      } else if (pathSet.has(num)) {
        es.push({
          type: SemanticErrorType.DuplicatedCheckForPathLength,
          params: {text},
          ...position
        })
      } else {
        pathSet.add(num)
      }
    }
    goal.metadata.validCheckPathLengths = pathSet

    if (goalKeyword === "enumerate" && (kwd === "upto" || kwd === "each")) {
      es.push({
        type: SemanticErrorType.InvalidCheckForModes,
        params: {keywords: [goalKeyword, kwd]},
        ...pos
      })
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
      block.metadata.modifier = modifier
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

  handleLiteral(type, text, pos) {
    switch (type) {
      case IdentifierType.Int: {
        const blockType = this.context.peekBlock().type
        if (blockType !== SemanticContextType.StateInc && blockType !== SemanticContextType.PathPrimary) {
          this.context.pushTypeStack(TypeInfo.literal(IdentifierType.Int))
        }
        const [lo, hi] = literalBounds[type]
        const v = BigInt(text)
        if (v < lo || v > hi) {
          this.emit("errors", [{
            type: SemanticErrorType.LiteralOutOfBoundary,
            params: {type},
            ...pos
          }])
        }
        break
      }

      case IdentifierType.BitVector: {
        // const size = bitVectorLiteralSize(text.trim())
        // const params = isNaN(size) ? null : [size]
        this.context.pushTypeStack(TypeInfo.literal(type))
        break
      }

      default: {
        this.context.pushTypeStack(TypeInfo.literal(type))
        break
      }
    }
  }

  handleStateIncPathPrimaryExit() {
    this.context.pushTypeStack(TypeInfo.action(IdentifierType.Bool))
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