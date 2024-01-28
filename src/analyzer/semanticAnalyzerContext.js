import {CategorizedStackTable} from "../lib/storage.js";
import {builtinActions, scopedContextType} from "../language/specifications.js";
import {popMulti, popMultiStore} from "../lib/list.js";

export default class SemanticAnalyzerContext {
  #blockContextStack
  #scopedBlocks
  #actionTable
  #typeStack
  #definedOptions

  constructor() {
    this.#blockContextStack = []
    this.#scopedBlocks = []
    this.#actionTable = new CategorizedStackTable(builtinActions)
    this.#typeStack = []
    this.#definedOptions = new Set()
  }

  get currentMachineBlock() {
    return this.#blockContextStack[1]
  }

  get currentBlockPath() {
    return this.#blockContextStack.map(it => it.type)
  }

  get scopeLength() {
    return this.#scopedBlocks.length
  }

  pushBlock(block) {
    this.#blockContextStack.push(block)
    if (scopedContextType.has(block.type)) {
      this.#scopedBlocks.push(block)
    }
  }

  peekBlock(skip = 0) {
    return this.#blockContextStack[this.#blockContextStack.length - 1 - skip]
  }

  popBlock() {
    const block = this.#blockContextStack.pop()
    if (block) {
      if (scopedContextType.has(block.type)) {
        this.#clearScope(block)
        this.#scopedBlocks.pop()
      }
      // if (block.type === SemanticContextType.RecordDecl) {
      //   this.context.currentRecordIdent.pop()
      // }
    } else {
      console.log("warn: no block to pop")
    }
    return block
  }
  #clearScope(block) {
    // this.emit("scope:exit", block)
    const machineCtx = this.currentMachineBlock?.metadata
    if (block.metadata && machineCtx) {
      machineCtx.identifierStack.subCountTable(block.metadata?.identifierCounts)
      // this.context.identifierCounts.sub(block.metadata?.identifierCounts)
      // this.context.recordCounts.sub(block.metadata?.recordCounts)
      machineCtx.recordFieldStack.subCategorizedCountTable(block.metadata.recordCounts)
    } else if (machineCtx) {
      console.log("warn: no local identifier count table found")
    }
  }

  peekScope(skip = 0) {
    return this.#scopedBlocks[this.#scopedBlocks.length - 1 - skip]
  }

  searchNearestBlock(f, stopAtType = null, skip = 0) {
    for (let i = this.#blockContextStack.length - 1 - skip; i >= 0; i--) {
      const block = this.#blockContextStack[i]
      if (f(block)) {
        return block
      }
      if (block.type === stopAtType) {
        return null
      }
    }

    return null
  }

  findNearestBlock(type, stopAt = null) {
    for (let i = this.#blockContextStack.length - 1; i >= 0; i--) {
      const block = this.#blockContextStack[i]
      if (block.type === type) {
        return block
      }
      if (stopAt !== null && block.type === stopAt) {
        return null
      }
    }

    return null
  }

  findNearestBlockByTypes(types) {
    for (let i = this.#blockContextStack.length - 1; i >= 0; i--) {
      const block = this.#blockContextStack[i]
      if (types.includes(block.type)) {
        return block
      }
    }

    return null
  }

  findNearestScope(type) {
    for (let i = this.#scopedBlocks.length - 1; i >= 0; i--) {
      const scope = this.#scopedBlocks[i]
      if (scope.type === type) {
        return scope
      }
    }

    return null
  }

  resetTypeStack(types = null) {
    if (types) {
      this.#typeStack = types
    } else if (this.#typeStack.length) {
      this.#typeStack = []
    }

    // if (this.typeStack.length) {
    //   this.typeStack = []
    // }
  }

  pushTypeStack(type) {
    this.#typeStack.push(type)
  }

  popTypeStack() {
    return this.#typeStack.pop()
  }

  peekTypeStack() {
    return this.#typeStack[this.#typeStack.length - 1]
  }

  sliceTypeStack(start, end) {
    return this.#typeStack.slice(start, end)
  }

  removeMultiTypeStack(length) {
    popMulti(this.#typeStack, length)
  }

  popMultiTypeStack(length) {
    return popMultiStore(this.#typeStack, length)
  }

  getTypeStack() {
    return this.#typeStack
  }

  getAction(actionKind, action) {
    // TODO: optimize certain action kind

    const machine = this.currentMachineBlock
    let fn = machine.metadata.actionTable.peek(actionKind, action)
    if (!fn) {
      // public actions
      fn = this.#actionTable.peek(actionKind, action)
    }

    return fn
  }

  addDefinedOption(option) {
    this.#definedOptions.add(option)
  }

  isOptionDefined(option) {
    return this.#definedOptions.has(option)
  }
}