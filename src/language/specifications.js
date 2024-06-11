/*
* Language specifications of Cyclone that helps the semantic analyzer
* */

import {
  ActionKind,
  IdentifierKind,
  IdentifierType,
  SemanticContextType, SemanticErrorType,
  SyntaxBlockKind
} from "./definitions.js";

export const scopedContextType = new Set([
  SemanticContextType.ProgramScope,
  SemanticContextType.MachineScope,
  SemanticContextType.StateScope,
  SemanticContextType.TransScope,
  SemanticContextType.InvariantScope,
  SemanticContextType.GoalScope,
  SemanticContextType.RecordScope,
  SemanticContextType.FnBodyScope,
])

export const declarationContextType = new Set([
  SemanticContextType.MachineDecl,
  SemanticContextType.StateDecl,
  SemanticContextType.TransDecl,
  SemanticContextType.InvariantDecl,
  SemanticContextType.LetDecl,
  SemanticContextType.RecordDecl,
  // SemanticContextType.GlobalConstantGroup,
  SemanticContextType.EnumDecl,
  SemanticContextType.VariableDecl,
  // SemanticContextType.GlobalVariableGroup,
  // SemanticContextType.LocalVariableGroup,
  // SemanticContextType.RecordVariableDeclGroup,
  SemanticContextType.FnDecl,
  SemanticContextType.FnParamsDecl,
  SemanticContextType.AnnotationDecl
])

export const singleTypedDeclarationGroupContextType = new Set([
  // SemanticContextType.EnumGroup,
  SemanticContextType.GlobalConstantGroup,
  SemanticContextType.GlobalVariableGroup,
  SemanticContextType.LocalVariableGroup,
  SemanticContextType.RecordVariableDeclGroup,
])

// export const singleTypedDeclarationContextType = new Set([
//   SemanticContextType.RecordVariableDeclGroup,
// ])

export const declarationContextTypeToIdentifierKind = {
  [SemanticContextType.MachineDecl]: IdentifierKind.Machine,
  [SemanticContextType.StateDecl]: IdentifierKind.State,
  [SemanticContextType.TransDecl]: IdentifierKind.Trans,
  [SemanticContextType.InvariantDecl]: IdentifierKind.Invariant,
  [SemanticContextType.LetDecl]: IdentifierKind.Let,
  [SemanticContextType.RecordDecl]: IdentifierKind.Record,
  [SemanticContextType.EnumDecl]: IdentifierKind.EnumField,
  // [SemanticContextType.GlobalVariableGroup]: IdentifierKind.GlobalVariable,
  // [SemanticContextType.LocalVariableGroup]: IdentifierKind.LocalVariable,
  // [SemanticContextType.GlobalConstantGroup]: IdentifierKind.GlobalConst,
  [SemanticContextType.FnDecl]: IdentifierKind.FnName,
  [SemanticContextType.FnParamsDecl]: IdentifierKind.FnParam,
  [SemanticContextType.AnnotationDecl]: IdentifierKind.Annotation
}

export const declarationGroupContextTypeToIdentifierKind = {
  // [SemanticContextType.EnumGroup]: IdentifierKind.EnumField,
  [SemanticContextType.GlobalConstantGroup]: IdentifierKind.GlobalConst,
  [SemanticContextType.LocalVariableGroup]: IdentifierKind.LocalVariable,
  [SemanticContextType.RecordVariableDeclGroup]: IdentifierKind.RecordField,
  [SemanticContextType.GlobalVariableGroup]: IdentifierKind.GlobalVariable,
}

export const identifierKindToType = {
  [IdentifierKind.Machine]: IdentifierType.Machine,
  [IdentifierKind.State]: IdentifierType.State,
  [IdentifierKind.Trans]: IdentifierType.Trans,
  [IdentifierKind.Invariant]: IdentifierType.Invariant,
  [IdentifierKind.EnumField]: IdentifierType.Enum,
  [IdentifierKind.FnName]: IdentifierType.Function,
  [IdentifierKind.Record]: IdentifierType.Record,
  [IdentifierKind.Let]: IdentifierType.Bool
}

export const identifierNoPushTypeStackBlocks = new Set([
  SemanticContextType.TransScope,
  SemanticContextType.InExpr,
  SemanticContextType.Stop,
  SemanticContextType.With,
  SemanticContextType.StateInc,
  SemanticContextType.PathPrimary,
  SemanticContextType.GoalScope,
  // SemanticContextType.FnCall
])

// export const scopeRequiredIdentifierKind = new Map([
//   [SemanticContextType.TransScope, [IdentifierKind.State]]
// ])

// TODO: annotation
export const typeTokenToType = {
  "int": IdentifierType.Int,
  "bool": IdentifierType.Bool,
  "real": IdentifierType.Real,
  "string": IdentifierType.String,
  "enum": IdentifierType.Enum,
  "bv": IdentifierType.BitVector,
}

const numberBitBinOpSignature = [
  {input: [IdentifierType.Int, IdentifierType.Int], output: IdentifierType.Int},
  {input: [IdentifierType.Int, IdentifierType.Real], output: IdentifierType.Real},
  {input: [IdentifierType.Real, IdentifierType.Real], output: IdentifierType.Real},
  {input: [IdentifierType.Real, IdentifierType.Int], output: IdentifierType.Real},
  {input: [IdentifierType.BitVector, IdentifierType.BitVector], output: IdentifierType.BitVector}
]

const numberBinOpSignature = [
  {input: [IdentifierType.Int, IdentifierType.Int], output: IdentifierType.Int},
  {input: [IdentifierType.Int, IdentifierType.Real], output: IdentifierType.Real},
  {input: [IdentifierType.Real, IdentifierType.Real], output: IdentifierType.Real},
  {input: [IdentifierType.Real, IdentifierType.Int], output: IdentifierType.Real},
]

const boolBinOpSignature = [
  {input: [IdentifierType.Bool, IdentifierType.Bool], output: IdentifierType.Bool},
  // {input: [IdentifierType.State, IdentifierType.State], output: IdentifierType.Bool}
]

const compareNumberBitBinOpSignature = [
  {input: [IdentifierType.Int, IdentifierType.Int], output: IdentifierType.Bool},
  {input: [IdentifierType.Int, IdentifierType.Real], output: IdentifierType.Bool},
  {input: [IdentifierType.Real, IdentifierType.Real], output: IdentifierType.Bool},
  {input: [IdentifierType.Real, IdentifierType.Int], output: IdentifierType.Bool},
  {input: [IdentifierType.BitVector, IdentifierType.BitVector], output: IdentifierType.Bool}
]

const compareValueBinOpSignature = [
  {input: [IdentifierType.Bool, IdentifierType.Bool], output: IdentifierType.Bool},
  {input: [IdentifierType.Int, IdentifierType.Int], output: IdentifierType.Bool},
  {input: [IdentifierType.Real, IdentifierType.Real], output: IdentifierType.Bool},
  {input: [IdentifierType.Int, IdentifierType.Real], output: IdentifierType.Bool},
  {input: [IdentifierType.Real, IdentifierType.Int], output: IdentifierType.Bool},
  {input: [IdentifierType.Enum, IdentifierType.Enum], output: IdentifierType.Bool},
  {input: [IdentifierType.String, IdentifierType.String], output: IdentifierType.Bool},
  {input: [IdentifierType.Char, IdentifierType.Char], output: IdentifierType.Bool},
  {input: [IdentifierType.BitVector, IdentifierType.BitVector], output: IdentifierType.Bool}
]

const assignValueBinOpSignature = [
  {input: [IdentifierType.Bool, IdentifierType.Bool], output: IdentifierType.Hole},
  {input: [IdentifierType.Int, IdentifierType.Int], output: IdentifierType.Hole},
  {input: [IdentifierType.Real, IdentifierType.Real], output: IdentifierType.Hole},
  // {input: [IdentifierType.Int, IdentifierType.Real], output: IdentifierType.Hole},
  {input: [IdentifierType.Real, IdentifierType.Int], output: IdentifierType.Hole},
  {input: [IdentifierType.Enum, IdentifierType.Enum], output: IdentifierType.Hole},
  {input: [IdentifierType.String, IdentifierType.String], output: IdentifierType.Hole},
  {input: [IdentifierType.Char, IdentifierType.Char], output: IdentifierType.Hole},
  {input: [IdentifierType.BitVector, IdentifierType.BitVector], output: IdentifierType.Hole}
]

const assignNumberBitBinOpSignature = [
  {input: [IdentifierType.Int, IdentifierType.Int], output: IdentifierType.Hole},
  {input: [IdentifierType.Int, IdentifierType.Real], output: IdentifierType.Hole},
  {input: [IdentifierType.Real, IdentifierType.Real], output: IdentifierType.Hole},
  {input: [IdentifierType.Real, IdentifierType.Int], output: IdentifierType.Hole},
  {input: [IdentifierType.BitVector, IdentifierType.BitVector], output: IdentifierType.Hole}
]

// const assignNumberBinOpSignature = [
//   {input: [IdentifierType.Int, IdentifierType.Int], output: IdentifierType.Hole},
//   {input: [IdentifierType.Int, IdentifierType.Real], output: IdentifierType.Hole},
//   {input: [IdentifierType.Real, IdentifierType.Real], output: IdentifierType.Hole},
//   {input: [IdentifierType.Real, IdentifierType.Int], output: IdentifierType.Hole},
// ]

const assignBitBinOpSignature = [
  {input: [IdentifierType.BitVector, IdentifierType.BitVector], output: IdentifierType.Hole}
]

const boolUnaryOpSignature = [
  {input: [IdentifierType.Bool], output: IdentifierType.Bool},
]

const numberUnaryOpSignature = [
  {input: [IdentifierType.Int], output: IdentifierType.Int},
  {input: [IdentifierType.Real], output: IdentifierType.Real},
]

const numberBitUnaryOpSignature = [
  {input: [IdentifierType.Int], output: IdentifierType.Int},
  {input: [IdentifierType.Real], output: IdentifierType.Real},
  {input: [IdentifierType.BitVector], output: IdentifierType.BitVector}
]

const numberUnaryHoleOpSignature = [
  {input: [IdentifierType.Int], output: IdentifierType.Hole},
  {input: [IdentifierType.Real], output: IdentifierType.Hole},
]

const bitUnaryOpSignature = [
  {input: [IdentifierType.BitVector], output: IdentifierType.BitVector}
]

const bitBinOpSignature = [
  {input: [IdentifierType.BitVector, IdentifierType.BitVector], output: IdentifierType.BitVector}
]

const infixOperators = [
  // numbers
  {action: '+', signatures: numberBitBinOpSignature},
  {action: '-', signatures: numberBitBinOpSignature},
  {action: '*', signatures: numberBitBinOpSignature},
  {action: '%', signatures: numberBitBinOpSignature},
  {action: '/', signatures: numberBitBinOpSignature},
  {action: '**', signatures: numberBinOpSignature},

  // num compare
  {action: '<', signatures: compareNumberBitBinOpSignature},
  {action: '>', signatures: compareNumberBitBinOpSignature},
  {action: '<=', signatures: compareNumberBitBinOpSignature},
  {action: '>=', signatures: compareNumberBitBinOpSignature},

  // val compare
  {action: '==', signatures: compareValueBinOpSignature},
  {action: '!=', signatures: compareValueBinOpSignature},

  // bool
  {action: '^', signatures: boolBinOpSignature},
  {action: '&&', signatures: boolBinOpSignature},
  {action: '||', signatures: boolBinOpSignature},
  {action: '=>', signatures: boolBinOpSignature},

  // bitwise
  {action: "&", signatures: bitBinOpSignature},
  {action: "|", signatures: bitBinOpSignature},
  {action: "<<", signatures: bitBinOpSignature},
  {action: ">>", signatures: bitBinOpSignature},

  // assign
  {action: '=', signatures: assignValueBinOpSignature, mutation: [0]},
  {action: '+=', signatures: assignNumberBitBinOpSignature, mutation: [0]},
  {action: '-=', signatures: assignNumberBitBinOpSignature, mutation: [0]},
  {action: '*=', signatures: assignNumberBitBinOpSignature, mutation: [0]},
  {action: '/=', signatures: assignNumberBitBinOpSignature, mutation: [0]},

  {action: '<<=', signatures: assignBitBinOpSignature, mutation: [0]},
  {action: '>>=', signatures: assignBitBinOpSignature, mutation: [0]},
]

const prefixOperators = [
  {action: '!', signatures: boolUnaryOpSignature},
  {action: '+', signatures: numberBitUnaryOpSignature},
  {action: '-', signatures: numberUnaryOpSignature},
  {action: '~', signatures: bitUnaryOpSignature}
]

const suffixOperators = [
  {action: '--', signatures: numberUnaryHoleOpSignature, mutation: [0]},
  {action: '++', signatures: numberUnaryHoleOpSignature, mutation: [0]}
]

export const builtinActions = (() => {
  return [
    [ActionKind.InfixOperator, infixOperators.map((act) => [act.action, {...act, kind: ActionKind.InfixOperator}])],
    [ActionKind.PrefixOperator, prefixOperators.map((act) => [act.action, {...act, kind: ActionKind.PrefixOperator}])],
    [ActionKind.SuffixOperator, suffixOperators.map((act) => [act.action, {...act, kind: ActionKind.SuffixOperator}])]
  ]
})()

const optBoolValues = ["true", "false"]
export const optionAcceptableValues = new Map([
  ["log", {values: optBoolValues}],
  ["trace", {values: optBoolValues}],
  ["debug", {values: optBoolValues}],
  ["detect", {values: optBoolValues}],
  ["output", {values: [`"trace"`, `"dot"`, `"html"`]}],
  ["timeout", {regex: /^\d*$/, description: "integer values"}],
  ["precision", {regex: /^\d*$/, description: "integer values"}],
  ["bvdisplay", {regex: /^'[0-9a-zA-Z]'$/, description: "character literal"}]
])

export const syntaxBlockIdPrefix = {
  [SyntaxBlockKind.CompilerOption]: "copt",
  [SyntaxBlockKind.Machine]: "graph",
  [SyntaxBlockKind.State]: "state",
  [SyntaxBlockKind.Transition]: "trans",
  [SyntaxBlockKind.Assertion]: "assert",
  [SyntaxBlockKind.Variable]: "var",
  [SyntaxBlockKind.Func]: "fn",
  [SyntaxBlockKind.Goal]: "goal",
  [SyntaxBlockKind.Invariant]: "inv",
  [SyntaxBlockKind.Statement]: "stmt",
  [SyntaxBlockKind.PathVariable]: "pvar",
  [SyntaxBlockKind.PathStatement]: "pstmt",
  [SyntaxBlockKind.Record]: "rec",
  [SyntaxBlockKind.SingleTypedVariableGroup]: "stvargrp",
  [SyntaxBlockKind.FnParamGroup]: "fnvargrp",
  [SyntaxBlockKind.GoalFinal]: "goalfin",
  [SyntaxBlockKind.Program]: "program",
}

export const invalidNodeModifierCombo = [
  ["abstract", "normal"],
]

export const literalBounds = {
  [IdentifierType.Int]: [BigInt(-2147483647), BigInt(2147483647)]
}

export const identifierKindShouldHasReference = new Set([
  // IdentifierKind.Let,
  // IdentifierKind.EnumField,
  IdentifierKind.FnParam,
  IdentifierKind.State,
  IdentifierKind.RecordField,
  IdentifierKind.Record,
  IdentifierKind.LocalVariable,
  IdentifierKind.GlobalVariable,
  IdentifierKind.GlobalConst,
])

export const variableTypes = [
  IdentifierType.Bool,
  IdentifierType.Real,
  IdentifierType.Int,
  IdentifierType.Enum,
  IdentifierType.String,
  IdentifierType.Char,
  IdentifierType.BitVector
]

export const parametrizationTypes = new Set([
  IdentifierType.BitVector
])

export default {
  scopedContextType,
  declarationContextType,
  singleTypedDeclarationGroupContextType,
  declarationContextTypeToIdentifierKind,
  declarationGroupContextTypeToIdentifierKind,
  identifierKindToType,
  identifierNoPushTypeStackBlocks,
  typeTokenToType,
  builtinActions,
  optionAcceptableValues,
  syntaxBlockIdPrefix,
  literalBounds,
  identifierKindShouldHasReference,
  variableTypes,
  parametrizationTypes
}