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

  constructor(id, kind, parentId, data, position, index) {
    this.id = id
    this.kind = kind
    this.parentId = parentId
    this.data = data ?? {}
    this.index = index ?? -1
    this.position = position
    this.parentIndex = -1

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
  codegen(codegenOpts) {
    if (this.codegenOverride != null) {
      return this.codegenOverride
    }
    const options = {
      indentUnit: 4,
      indentChar: ' ',
      ...codegenOpts
    }
    switch (this.kind) {
      case SyntaxBlockKind.CompilerOption: {
        return `option-${this.data.name}=${this.data.value};`
      }
      case SyntaxBlockKind.Machine: {
        const body = []

        for (const child of this.children) {
          body.push(options.indentChar.repeat(options.indentUnit) + child.codegen(codegenOpts))
        }

        return `${this.data.keyword} ${this.data.identifier} {${body.join("\n")}}`
      }
      case SyntaxBlockKind.State: {
        const body = []
        for (const child of this.children) {
          body.push(options.indentChar.repeat(options.indentUnit) + child.codegen(codegenOpts))
        }

        const modifiers = this.data.attributes.filter(a => ["abstract", "normal", "start", "final"].includes(a))

        const keyword = this.data.attributes.includes("state") ? "state" : "node"

        return `${modifiers.join(" ")} ${keyword} ${this.data.identifier} {${body.join("\n")}}`
      }

      case SyntaxBlockKind.Transition: {
        const {
          keyword,
          identifier
        } = this.data

        return `${keyword}${identifier ? " " + identifier : ""} {${codegenTransitionBody(this.data)}}`
      }

      case SyntaxBlockKind.Statement:
      case SyntaxBlockKind.PathStatement: {
        return this.data.code
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

        if (invariants.length) {
          parts.push(`with (${invariants.join(", ")})`)
        }

        if (states.length) {
          parts.push(`${stopKeyword ?? "reach"} (${states.join(", ")})`)
        }

        // const withExpr = invariants.length
        //   ? ` `
        //   : ""
        // const stopExpr = states.length
        //   ? ` ${stopKeyword ?? "reach"} (${states.join(", ")})`
        //   : ""
        return parts.join(" ")
      }

      case SyntaxBlockKind.Assertion: {
        const inExpr = this.data.inIdentifiers?.length
          ? `in (${this.data.inIdentifiers.join(", ")})`
          : ""
        return `assert ${this.data.code} ${inExpr};`
      }

      case SyntaxBlockKind.Variable: {
        const {kind, type, identifier, codeWhere, codeInit} = this.data
        switch (kind) {
          case IdentifierKind.FnParam: return `${identifier}:${typeToString(type)}`
          case IdentifierKind.RecordField:
          case IdentifierKind.GlobalConst:
          case IdentifierKind.GlobalVariable:
          case IdentifierKind.LocalVariable: return `${identifier}${codeInit?.length ? ` = ${codeInit}` : ""}${codeWhere ? ` where ${codeWhere}` : ""}`
        }
        return ""
      }
      case SyntaxBlockKind.Func: {
        const {
          returnType,
          identifier,
        } = this.data
        const body = []
        let paramsExpr
        for (const child of this.children) {
          switch (child.kind) {
            case SyntaxBlockKind.FnParamGroup:
              paramsExpr = child.codegen(codegenOpts)
              break
            case SyntaxBlockKind.Statement:
            case SyntaxBlockKind.SingleTypedVariableGroup:
              body.push(options.indentChar.repeat(options.indentUnit) + child.codegen(codegenOpts))
              break
          }
        }
        return `function ${identifier}: ${typeToString(returnType)} ${paramsExpr} {${body.join("\n")}}`
      }
      case SyntaxBlockKind.Goal: {
        const body = []
        for (const child of this.children) {
          body.push(options.indentChar.repeat(options.indentUnit) + child.codegen(codegenOpts))
        }
        return `goal {${body.join("\n")}}`
      }
      case SyntaxBlockKind.Invariant: {
        const body = []
        for (const child of this.children) {
          body.push(options.indentChar.repeat(options.indentUnit) + child.codegen(codegenOpts))
        }
        const inExpr = this.data.inIdentifiers?.length
          ? ` in (${this.data.inIdentifiers.join(", ")})`
          : ""
        return `invariant ${this.data.identifier} {${body.join("\n")}}${inExpr}`
      }
      case SyntaxBlockKind.PathVariable: {
        return `let ${this.data.identifier}${this.data.codeInit?.length ? ` = ${this.data.codeInit}` : ""};`
      }
      case SyntaxBlockKind.Record: {
        const body = []
        for (const child of this.children) {
          body.push(options.indentChar.repeat(options.indentUnit) + child.codegen(codegenOpts))
        }
        return `record ${this.data.identifier} {${body.join("\n")}};`
      }
      case SyntaxBlockKind.SingleTypedVariableGroup: {
        const {
          enums,
          varKind
        } = this.data
        const {
          type
        } = this.children[0].data

        const typeExpr = `${typeToString(type)}${type === IdentifierType.Enum ? ` {${enums.join(", ")}}` : ""}`
        const body = []
        for (const child of this.children) {
          body.push(child.codegen(codegenOpts))
        }

        switch (varKind) {
          case IdentifierKind.GlobalConst: return `const ${typeExpr} ${body.join(", ")};`
          case IdentifierKind.LocalVariable:
          case IdentifierKind.GlobalVariable:
          case IdentifierKind.RecordField:
            return `${typeExpr} ${body.join(", ")};`
        }

        return ""
      }

      case SyntaxBlockKind.FnParamGroup: {
        const body = []
        for (const child of this.children) {
          body.push(child.codegen(codegenOpts))
        }
        return '(' + body.join(", ") + ')'
      }

      case SyntaxBlockKind.Program: {
        const parts = []
        for (const child of this.children) {
          parts.push(child.codegen(codegenOpts))
        }
        return parts.join("\n")
      }
    }
  }
}