import {IdentifierKind, IdentifierType, SyntaxBlockKind} from "../language/definitions.js";
import {typeToString} from "../utils/type.js";

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

  if (labelKeyword) {
    parts.push(`${labelKeyword} "${label}"`)
  }

  // TODO: replace new line or multiple spaces to single space?
  if (codeWhere) {
    parts.push(`where ${codeWhere.trim()};`)
  }

  return parts.join(" ")
}

export default class SyntaxBlock {
  id
  data
  kind
  parentId
  position
  errors
  childErrors
  references
  children
  index
  parentIndex

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

  markData(data) {
    this.data = {...this.data, ...data}
  }

  markErrors(...errors) {
    this.errors.push(...errors)
  }

  markChildErrors(...childErrors) {
    this.childErrors.push(...childErrors)
  }

  addReference(ref) {
    this.references.add(ref)
  }

  isBefore(block) {
    return this.index < block.index
  }

  codegen(codegenOpts) {
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

        for (let child of this.children) {
          body.push(options.indentChar.repeat(options.indentUnit) + child.codegen(codegenOpts))
        }

        return `${this.data.keyword} ${this.data.identifier} {${body.join("\n")}}`
      }
      case SyntaxBlockKind.State: {
        const body = []
        for (let child of this.children) {
          body.push(options.indentChar.repeat(options.indentUnit) + child.codegen(codegenOpts))
        }
        return `${this.data.attributes.join(" ")} ${this.data.identifier} {${body.join("\n")}}`
      }

      case SyntaxBlockKind.Transition: {
        const {
          keyword,
          identifier
        } = this.data

        return `${keyword}${identifier ? " " + identifier : ""} {${codegenTransitionBody(this.data)}}`
      }

      case SyntaxBlockKind.GoalFinal:
      case SyntaxBlockKind.Statement:
      case SyntaxBlockKind.PathStatement:
      case SyntaxBlockKind.Assertion: {
        return this.data.code
      }

      case SyntaxBlockKind.Variable: {
        const {kind, type, identifier, codeWhere, codeInit} = this.data
        switch (kind) {
          case IdentifierKind.FnParam: return `${identifier}:${typeToString(type)}`
          case IdentifierKind.RecordField:
          case IdentifierKind.GlobalConst:
          case IdentifierKind.GlobalVariable:
          case IdentifierKind.LocalVariable: return `${identifier}${codeInit ? ` = ${codeInit}` : ""}${codeWhere ? ` where ${codeWhere}` : ""}`
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
        for (let child of this.children) {
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
        return `function ${identifier}: ${typeToString(returnType)} (${paramsExpr}) {${body.join("\n")}}`
      }
      case SyntaxBlockKind.Goal: {
        const body = []
        for (let child of this.children) {
          body.push(options.indentChar.repeat(options.indentUnit) + child.codegen(codegenOpts))
        }
        return `goal {${body.join("\n")}}`
      }
      case SyntaxBlockKind.Invariant: {
        const body = []
        for (let child of this.children) {
          body.push(options.indentChar.repeat(options.indentUnit) + child.codegen(codegenOpts))
        }
        return `invariant ${this.data.identifier} {${body.join("\n")}}`
      }
      case SyntaxBlockKind.PathVariable: {
        return `let ${this.data.identifier}${this.data.codeInit ?? ""};`
      }
      case SyntaxBlockKind.Record: {
        const body = []
        for (let child of this.children) {
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
        for (let child of this.children) {
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
        for (let child of this.children) {
          body.push(child.codegen(codegenOpts))
        }
        return body.join(", ")
      }

      case SyntaxBlockKind.Program: {
        const parts = []
        for (let child of this.children) {
          parts.push(child.codegen(codegenOpts))
        }
        return parts.join("\n")
      }
    }
  }

  // TODO: insert child, swap child index
}