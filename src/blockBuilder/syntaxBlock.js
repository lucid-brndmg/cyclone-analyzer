import {IdentifierKind, IdentifierType, SyntaxBlockKind} from "../language/definitions.js";
import {typeToString} from "../utils/type.js";

// generates source code from an edge definition object
const codegenTransitionBody = ({
  label,
  codeWhere,
  fromState,
  toStates,
  operators,
  excludedStates,
  labelKeyword
}) => {
  const codeArrow = operators.has("<->") ? "<->" : "->"

  const parts = [
    fromState,
    codeArrow
  ]

  if (toStates.length) {
    parts.push(toStates.join(", "))
  } else if (operators.has("*")) {
    parts.push("*")
  } else if (operators.has("+")) {
    parts.push("+")
  }

  if (excludedStates.length) {
    parts.push(`[${excludedStates.join(", ")}]`)
  }

  if (labelKeyword != null && label != null) {
    parts.push(`${labelKeyword} "${label}"`)
  }

  // TODO: replace new line or multiple spaces to single space?
  if (codeWhere) {
    parts.push(`where ${codeWhere.trim()};`)
  }

  return parts.join(" ")
}

const codeBlock = (prefix, bodyLines, currentIndent, options) => {
  const currentIndentChar = options.indentChar.repeat(currentIndent)
  const body = bodyLines
    .map(line =>
      // options.indentChar.repeat(options.indentUnit + currentIndent) +
      currentIndentChar +
      line)
    .join(options.breakChar)

  if (bodyLines.length) {
    const code = `${currentIndentChar}${prefix} {${options.breakChar}${body}${options.breakChar}${currentIndentChar}}`

    return code
  }

  return `${currentIndentChar}${prefix} {}`
}

/*
* Syntax block object, as a code block of Cyclone
* */
export default class SyntaxBlock {
  id // auto-assigned id
  data // data of code generation
  kind
  parentId // parent syntax block id
  position // code position, null if newly inserted
  errors // semantic errors
  childErrors // semantic errors in children
  references // identifier references (as a set)
  children // child blocks
  index // the block index, as in parent block
  parentIndex // the parent block's index
  codegenOverride = null // If this field is defined, the code generation function would take this field as generated code
  originalCode

  constructor(id, kind, parentId, data, position, index, originalCode) {
    this.id = id
    this.kind = kind
    this.parentId = parentId
    this.data = data ?? {}
    this.index = index ?? -1
    this.position = position
    this.parentIndex = -1
    this.originalCode = originalCode

    this.children = []
    this.references = new Set()
    this.childErrors = []
    this.errors = []
  }

  pushChild(childBlock) {
    childBlock.parentIndex = this.children.push(childBlock) - 1
  }

  insertChild(childBlock, atIndex) {
    const childrenLength = this.children.length
    if (childrenLength) {
      for (let i = childrenLength - 1; i >= atIndex; i--) {
        const block = this.children[i]
        block.parentIndex = i + 1
        this.children[i + 1] = block
      }
      childBlock.parentIndex = atIndex
      this.children[atIndex] = childBlock
    } else {
      this.pushChild(childBlock)
    }
  }

  replaceChild(childBlock, atIndex) {
    this.children[atIndex] = childBlock
    childBlock.parentIndex = atIndex
  }

  overrideChildren(children) {
    this.children = children
    for (let i = 0; i < children.length; i++) {
      children[i].parentIndex = i
    }
  }

  markData(data) {
    this.data = {...this.data, ...data}
  }

  markErrors(...errors) {
    this.errors.push(...errors)
  }

  markChildErrors(...childErrors) {
    this.childErrors.push(...childErrors)
  }

  hasError() {
    return this.errors.length > 0 || this.childErrors.length > 0
  }

  markCodegenOverride(code) {
    this.codegenOverride = code
  }

  addReference(ref) {
    this.references.add(ref)
  }

  isBefore(block) {
    return this.index < block.index
  }

  isNewlyInserted() {
    return this.position == null
  }

  isCodeOverridden() {
    return !!this.codegenOverride
  }

  // code generation function
  codegen(codegenOpts, currentIndent = 0) {
    const options = {
      indentUnit: 4,
      indentChar: ' ',
      breakChar: "\n",
      ...codegenOpts
    }
    const overwrite = options.overwrite
    const nextIndent = currentIndent + options.indentUnit
    const indentPrefix = options.indentChar.repeat(currentIndent)
    if (this.codegenOverride != null) {
      const r = indentPrefix + this.codegenOverride
      return overwrite?.(this, r, options, currentIndent) ?? r
    }
    switch (this.kind) {
      case SyntaxBlockKind.CompilerOption: {
        const r = `${indentPrefix}option-${this.data.name}=${this.data.value};`
        return overwrite?.(this, r, options, currentIndent) ?? r // `${indentPrefix}option-${this.data.name}=${this.data.value};`
      }
      case SyntaxBlockKind.Machine: {
        const body = []

        for (const child of this.children) {
          body.push(child.codegen(codegenOpts, nextIndent))
        }

        const r = codeBlock(`${this.data.keyword} ${this.data.identifier}`, body, currentIndent, options)

        return overwrite?.(this, r, options, currentIndent) ?? r // `${this.data.keyword} ${this.data.identifier} {${body.join(options.breakChar)}}`
      }
      case SyntaxBlockKind.State: {
        const body = []
        for (const child of this.children) {
          body.push(child.codegen(codegenOpts, nextIndent))
        }

        const modifiers = this.data.attributes.filter(a => ["abstract", "normal", "start", "final"].includes(a))

        const keyword = this.data.attributes.includes("state") ? "state" : "node"
        const r = codeBlock(`${modifiers.join(" ")} ${keyword} ${this.data.identifier}`, body, currentIndent, options)
        return overwrite?.(this, r, options, currentIndent) ?? r // `${modifiers.join(" ")} ${keyword} ${this.data.identifier} {${body.join(options.breakChar)}}`
      }

      case SyntaxBlockKind.Transition: {
        const {
          keyword,
          identifier
        } = this.data

        // NOT an actual code block
        // treat as line level
        const r = `${indentPrefix}${keyword}${identifier ? " " + identifier : ""} {${codegenTransitionBody(this.data)}}`
        return overwrite?.(this, r, options, currentIndent) ?? r
      }

      case SyntaxBlockKind.Statement:
      case SyntaxBlockKind.PathStatement: {
        const r = `${indentPrefix}${this.data.code}`
        return overwrite?.(this, r, options, currentIndent) ?? r
      }

      case SyntaxBlockKind.GoalFinal: {
        const {
          invariants,
          states,
          checkKeyword,
          forKeyword,
          forValues,
          viaKeyword,
          viaExpr,
          stopKeyword
        } = this.data

        const parts = [
          `${checkKeyword} ${forKeyword} ${forValues.join(", ")}`
        ]

        if (viaKeyword) {
          parts.push(`${viaKeyword} (${viaExpr})`)
        }

        if (invariants?.length) {
          parts.push(`with (${invariants.join(", ")})`)
        }

        if (states?.length) {
          parts.push(`${stopKeyword ?? "reach"} (${states.join(", ")})`)
        }
        const r = indentPrefix + parts.join(" ")
        return overwrite?.(this, r, options, currentIndent) ?? r
      }

      case SyntaxBlockKind.Assertion: {
        const inExpr = this.data.inIdentifiers?.length
          ? ` in (${this.data.inIdentifiers.join(", ")})`
          : ""
        const modifier = this.data.modifier ? `${this.data.modifier} ` : ""
        const r = `${indentPrefix}assert ${modifier}${this.data.code}${inExpr};`
        return overwrite?.(this, r, options, currentIndent) ?? r
      }

      case SyntaxBlockKind.Variable: {
        const {kind, type, identifier, codeWhere, codeInit, typeParams} = this.data
        let r = ""
        switch (kind) {
          case IdentifierKind.FnParam: r = `${identifier}:${typeToString(type, typeParams)}`; break;
          case IdentifierKind.RecordField:
          case IdentifierKind.GlobalConst:
          case IdentifierKind.GlobalVariable:
          case IdentifierKind.LocalVariable: r = `${identifier}${codeInit?.length ? ` = ${codeInit}` : ""}${codeWhere ? ` where ${codeWhere}` : ""}`; break;
        }
        return overwrite?.(this, r, options, currentIndent) ?? r
      }
      case SyntaxBlockKind.Func: {
        const {
          returnType,
          returnTypeParams,
          identifier,
        } = this.data
        const body = []
        let paramsExpr
        for (const child of this.children) {
          switch (child.kind) {
            case SyntaxBlockKind.FnParamGroup:
              paramsExpr = child.codegen(codegenOpts, nextIndent)
              break
            case SyntaxBlockKind.Statement:
            case SyntaxBlockKind.SingleTypedVariableGroup:
              body.push(options.indentChar.repeat(options.indentUnit) + child.codegen(codegenOpts, nextIndent))
              break
          }
        }
        const r = codeBlock(`function ${identifier}: ${typeToString(returnType, returnTypeParams)} ${paramsExpr}`, body, currentIndent, options)
        return overwrite?.(this, r, options, currentIndent) ?? r // `function ${identifier}: ${typeToString(returnType)} ${paramsExpr} {${body.join(options.breakChar)}}`
      }
      case SyntaxBlockKind.Goal: {
        const body = []
        for (const child of this.children) {
          body.push(child.codegen(codegenOpts, nextIndent))
        }
        const r = codeBlock("goal", body, currentIndent, options)
        return overwrite?.(this, r, options, currentIndent) ?? r // `goal {${body.join(options.breakChar)}}`
      }
      case SyntaxBlockKind.Invariant: {
        const body = []
        for (const child of this.children) {
          body.push(child.codegen(codegenOpts, nextIndent))
        }
        const inExpr = this.data.inIdentifiers?.length
          ? ` in (${this.data.inIdentifiers.join(", ")})`
          : ""
        // return `invariant ${this.data.identifier} {${body.join(options.breakChar)}}${inExpr}`
        const r = codeBlock(`invariant ${this.data.identifier}`, body, currentIndent, options) + inExpr
        return overwrite?.(this, r, options, currentIndent) ?? r
      }
      case SyntaxBlockKind.PathVariable: {
        const r = `${indentPrefix}let ${this.data.identifier}${this.data.codeInit?.length ? ` = ${this.data.codeInit}` : ""};`
        return overwrite?.(this, r, options, currentIndent) ?? r
      }
      case SyntaxBlockKind.Record: {
        const body = []
        for (const child of this.children) {
          body.push(child.codegen(codegenOpts, nextIndent))
        }
        const r = codeBlock(`record ${this.data.identifier}`, body, currentIndent, options) + ";"
        return overwrite?.(this, r, options, currentIndent) ?? r
        // return `record ${this.data.identifier} {${body.join(options.breakChar)}};`
      }
      case SyntaxBlockKind.SingleTypedVariableGroup: {
        const {
          enums,
          varKind
        } = this.data
        const {
          type,
          typeParams,
        } = this.children[0].data

        const typeExpr = `${typeToString(type, typeParams)}${type === IdentifierType.Enum ? ` {${enums.join(", ")}}` : ""}`
        const body = []
        for (const child of this.children) {
          body.push(child.codegen(codegenOpts, nextIndent))
        }
        
        let r = ""
        switch (varKind) {
          case IdentifierKind.GlobalConst: r = `${indentPrefix}const ${typeExpr} ${body.join(", ")};`; break
          case IdentifierKind.LocalVariable:
          case IdentifierKind.GlobalVariable:
          case IdentifierKind.RecordField:
            r = `${indentPrefix}${typeExpr} ${body.join(", ")};`
            break
        }

        return overwrite?.(this, r, options, currentIndent) ?? r
      }

      case SyntaxBlockKind.FnParamGroup: {
        const body = []
        for (const child of this.children) {
          body.push(child.codegen(codegenOpts, nextIndent))
        }
        const r = '(' + body.join(", ") + ')'
        return overwrite?.(this, r, options, currentIndent) ?? r
      }

      case SyntaxBlockKind.Program: {
        const parts = []
        for (const child of this.children) {
          parts.push(child.codegen(codegenOpts, currentIndent)) // program is a pseudo block
        }
        const r = parts.join(options.breakChar)
        return overwrite?.(this, r, options, currentIndent) ?? r
      }
    }
  }
}