/*
* Language specifications of Cyclone that helps the semantic analyzer
* */

import {
  ActionKind,
  IdentifierKind,
  IdentifierType,
  SemanticContextType,
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

export const scopeSupportsShadowing = (() => {
  const result = new Map()

  for (let scope of scopedContextType) {
    // all kinds && all scopes supports shadowing
    result.set(scope, new Set(Object.values(IdentifierKind)))
  }

  return result
})()

export const typeTokenToType = {
  "int": IdentifierType.Int,
  "bool": IdentifierType.Bool,
  "real": IdentifierType.Real,
  "string": IdentifierType.String,
  "enum": IdentifierType.Enum
}

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

const compareNumberBinOpSignature = [
  {input: [IdentifierType.Int, IdentifierType.Int], output: IdentifierType.Bool},
  {input: [IdentifierType.Int, IdentifierType.Real], output: IdentifierType.Bool},
  {input: [IdentifierType.Real, IdentifierType.Real], output: IdentifierType.Bool},
  {input: [IdentifierType.Real, IdentifierType.Int], output: IdentifierType.Bool},
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
]

const assignNumberBinOpSignature = [
  {input: [IdentifierType.Int, IdentifierType.Int], output: IdentifierType.Hole},
  {input: [IdentifierType.Int, IdentifierType.Real], output: IdentifierType.Hole},
  {input: [IdentifierType.Real, IdentifierType.Real], output: IdentifierType.Hole},
  {input: [IdentifierType.Real, IdentifierType.Int], output: IdentifierType.Hole},
]

const boolUnaryOpSignature = [
  {input: [IdentifierType.Bool], output: IdentifierType.Bool},
]

const numberUnaryOpSignature = [
  {input: [IdentifierType.Int], output: IdentifierType.Int},
  {input: [IdentifierType.Real], output: IdentifierType.Real},
]

const numberUnaryHoleOpSignature = [
  {input: [IdentifierType.Int], output: IdentifierType.Hole},
  {input: [IdentifierType.Real], output: IdentifierType.Hole},
]

const infixOperators = [
  // numbers
  {action: '+', signatures: numberBinOpSignature},
  {action: '-', signatures: numberBinOpSignature},
  {action: '*', signatures: numberBinOpSignature},
  {action: '/', signatures: numberBinOpSignature},
  {action: '**', signatures: numberBinOpSignature},
  {action: '%', signatures: numberBinOpSignature},

  // num compare
  {action: '<', signatures: compareNumberBinOpSignature},
  {action: '>', signatures: compareNumberBinOpSignature},
  {action: '<=', signatures: compareNumberBinOpSignature},
  {action: '>=', signatures: compareNumberBinOpSignature},

  // val compare
  {action: '==', signatures: compareValueBinOpSignature},
  {action: '!=', signatures: compareValueBinOpSignature},

  // bool
  {action: '^', signatures: boolBinOpSignature},
  {action: '&&', signatures: boolBinOpSignature},
  {action: '||', signatures: boolBinOpSignature},
  {action: '=>', signatures: boolBinOpSignature},

  // assign
  {action: '=', signatures: assignValueBinOpSignature},
  {action: '+=', signatures: assignNumberBinOpSignature},
  {action: '-=', signatures: assignNumberBinOpSignature},
  {action: '*=', signatures: assignNumberBinOpSignature},
  {action: '/=', signatures: assignNumberBinOpSignature},
]

const prefixOperators = [
  {action: '!', signatures: boolUnaryOpSignature},
  {action: '+', signatures: numberUnaryOpSignature},
  {action: '-', signatures: numberUnaryOpSignature}
]

const suffixOperators = [
  {action: '--', signatures: numberUnaryHoleOpSignature},
  {action: '++', signatures: numberUnaryHoleOpSignature}
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
  ["output", {values: [`"trace"`, `"dot"`]}],
  ["timeout", {regex: /^\d*$/, description: "integer values"}],
  ["precision", {regex: /^\d*$/, description: "integer values"}]
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

// export const syntaxBlockOrdering = {
//   [SyntaxBlockKind.Program]: [
//     [SyntaxBlockKind.CompilerOption],
//     [SyntaxBlockKind.Machine]
//   ],
//   [SyntaxBlockKind.Machine]: [
//     [SyntaxBlockKind.Func, SyntaxBlockKind.Record, SyntaxBlockKind.SingleTypedVariableGroup],
//     [SyntaxBlockKind.State],
//     [SyntaxBlockKind.Transition],
//     [SyntaxBlockKind.Invariant],
//
//     [SyntaxBlockKind.Goal]
//   ],
//
//   [SyntaxBlockKind.Goal]: [
//     [SyntaxBlockKind.PathVariable, SyntaxBlockKind.PathStatement, SyntaxBlockKind.Assertion],
//     [SyntaxBlockKind.GoalFinal]
//   ],
//
//   [SyntaxBlockKind.Func]: [
//     [SyntaxBlockKind.FnParamGroup],
//     [SyntaxBlockKind.SingleTypedVariableGroup],
//     [SyntaxBlockKind.Statement]
//   ],
// }

export default {
  scopedContextType,
  declarationContextType,
  singleTypedDeclarationGroupContextType,
  declarationContextTypeToIdentifierKind,
  declarationGroupContextTypeToIdentifierKind,
  identifierKindToType,
  identifierNoPushTypeStackBlocks,
  scopeSupportsShadowing,
  typeTokenToType,
  builtinActions,
  optionAcceptableValues,
  syntaxBlockIdPrefix
}