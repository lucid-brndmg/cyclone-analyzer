import {IdentifierType} from "../language/definitions.js";

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
  // [IdentifierType.Unknown]: "unknown_type", // void ???
  [IdentifierType.Hole]: "unknown"
}

const msgTypeRepr = (() => {
  const o = {}
  for (let [key, value] of Object.entries(typeMsgRepr)) {
    o[value] = parseInt(key)
  }
  return o
})()

export const typeToString = ty => typeMsgRepr[ty] ?? "undefined"

export const typeFromString = ty => msgTypeRepr[ty] ?? IdentifierType.Hole

export default {
  checkSignature,
  typeToString,
  typeFromString
}