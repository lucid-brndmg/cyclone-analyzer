import {IdentifierType} from "../language/definitions.js";
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
        if (size && !isNaN(size)) {
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
  if (bvLiteralString.endsWith("b") || bvLiteralString.endsWith("B")) {
    return bvLiteralString.slice(0, -1).length
  }
  if (bvLiteralString.startsWith("0x") || bvLiteralString.startsWith("0X")) {
    return hexLiteralBinaryLength(bvLiteralString)
  }

  return NaN
}

export default {
  checkSignature,
  typeToString,
  typeFromString,
  bitVectorLiteralSize
}