import {IdentifierType, SemanticErrorType} from "../language/definitions.js";
import {hexLiteralBinaryLength} from "../lib/string.js";

export const checkSignature = (expected, actual) => {
  if (expected.length !== actual.length) {
    return {passed: false, hole: false}
  }

  for (let i = 0; i < expected.length; i++) {
    if (actual[i] === IdentifierType.Hole) {
      return {passed: true, hole: true}
    }

    if (expected[i] !== actual[i]) {
      return {passed: false, hole: false}
    }
  }

  return {passed: true, hole: false}
}

export const checkTypeParameters = (type, params) => {
  if (!params) {
    return
  }

  switch (type) {
    case IdentifierType.BitVector: {
      const [size] = params
      if (size < 1 || size > 2147483647) {
        return {
          type: SemanticErrorType.InvalidBitVectorSize,
        }
      }

      break
    }
  }
}

export const checkOperateTypeParams = (type, lParams, rParams) => {
  switch (type) {
    case IdentifierType.BitVector: {
      if ( lParams && rParams && !isNaN(lParams[0]) && !isNaN(rParams[0]) && lParams[0] !== rParams[0]) {
        return {
          type: SemanticErrorType.InvalidBitVectorOperation,
          params: {lhs: lParams[0], rhs: rParams[0]}
        }
      }
    }
  }

  return null
}

const typeMsgRepr = {
  [IdentifierType.Machine]: "machine",
  [IdentifierType.State]: "state",
  [IdentifierType.Trans]: "trans",
  [IdentifierType.Record]: "record",
  [IdentifierType.Enum]: "enum",
  [IdentifierType.Function]: "function",
  [IdentifierType.Invariant]: "invariant",
  [IdentifierType.Int]: "int",
  [IdentifierType.String]: "string",
  [IdentifierType.Char]: "char",
  [IdentifierType.Real]: "real",
  [IdentifierType.Bool]: "bool",
  [IdentifierType.BitVector]: "bv",
  [IdentifierType.Hole]: "unknown"
}

const msgTypeRepr = (() => {
  const o = {}
  for (const [key, value] of Object.entries(typeMsgRepr)) {
    o[value] = parseInt(key)
  }
  return o
})()

export const typeToString = (ty, tyParams = null) => {
  let params = ""
  switch (ty) {
    case IdentifierType.BitVector: {
      if (tyParams) {
        const size = tyParams[0]
        if (size != null && !isNaN(size)) {
          params = `[${size}]`
        }
      }
      break
    }
  }
  const lit = typeMsgRepr[ty] ?? "undefined"
  return lit + params
}

export const typeFromString = ty => msgTypeRepr[ty] ?? IdentifierType.Hole

export const bitVectorLiteralSize = bvLiteralString => {
  if (bvLiteralString.startsWith('0b')) {
    return bvLiteralString.slice(2).length
  }
  if (bvLiteralString.startsWith("0x") || bvLiteralString.startsWith("0X")) {
    return hexLiteralBinaryLength(bvLiteralString)
  }

  return NaN
}

export const compareTypeParams = (type, a, b) => {
  if (a == null && b == null) {
    return true
  }
  if (a == null || b == null) {
    return false
  }

  switch (type) {
    case IdentifierType.BitVector: return a[0] === b[0]
    default: return a === b
  }
  // return false
}

export default {
  checkSignature,
  typeToString,
  typeFromString,
  bitVectorLiteralSize,
  checkTypeParameters,
  checkOperateTypeParams,
  compareTypeParams
}