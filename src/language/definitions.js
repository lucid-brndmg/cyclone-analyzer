/*
* Definitions of the analyzer mainly helps semantic analysis, including:
* - Semantic Error Types
* - Semantic Context Types
* - Identifier Scoping Kind
* - Identifier Data Type
* - ...
* */


// Semantic error types defined by the analyzer
export const SemanticErrorType = {
  // 10-series are for syntax errors,
  // 50-series are for remove execution errors,
  // These 2 series had been used by the online editor already

  // General Semantic Errors
  UndefinedIdentifier: 2001,
  IdentifierRedeclaration: 2002,
  RecursiveFunction: 2003,
  WhereFreeVariable: 2004,
  WhereFunctionCall: 2005,
  CompilerOptionDuplicated: 2006,
  StartNodeDuplicated: 2007,
  ReturnExprViolation: 2008,
  StatementAfterReturn: 2009,
  InvalidNamedExprScope: 2010,
  InvalidStatement: 2011,
  LetBodyUndefined: 2012,
  EnumNotAllowedInVariable: 2013,
  InvalidNodeModifier: 2014,
  WhereInlineVariable: 2015,
  InvalidCheckForPathLength: 2016,
  AnonymousEdgeIdentifier: 2017,
  AssertModifierInExpr: 2018,
  InvalidValueMutation: 2019,
  OperatingDifferentEnumSources: 2020,
  LiteralOutOfBoundary: 2021,
  CheckUnsupportedRangeMode: 2022,
  InvalidCheckForModes: 2023,
  InvalidBitVectorOperation: 2024,
  InvalidBitVectorSize: 2025,

  // Type Errors
  TypeMismatchFunction: 3001,
  TypeMismatchReturn: 3002,
  TypeMismatchCompilerOption: 3003,
  TypeMismatchVarDecl: 3004,
  TypeMismatchExpr: 3005,

  // WARNING LEVEL
  CodeInsideAbstractNode: 4001,
  NoGoalDefined: 4002,
  NoStartNodeDefined: 4003,
  DuplicatedEdge: 4004,
  EmptyEdge: 4005,
  DuplicatedEnumField: 4006,
  DuplicatedEdgeTarget: 4007,
  OptionTraceNotFound: 4008,
  DuplicatedCheckForPathLength: 4009,
  NoFinalStateOrReachSpecified: 4010,
  UnreachableCheckForPathLength: 4011,

  // INFO LEVEL
  NodeUnconnected: 6001,
  IdentifierNeverUsed: 6002
}

// Semantic Context Type that helps the analyzer positioning
export const SemanticContextType = {
  ProgramScope: 1,

  MachineDecl: 10, // decl, scope
  MachineScope: 11,
  // MachineScope: 11,

  StateDecl: 20, // decl, stateExpr
  StateScope: 21, // scope

  TransDecl: 30, // decl
  TransScope: 31, // ref, scope

  InvariantDecl: 40, // decl
  InvariantScope: 41, // ref, scope

  GoalScope: 50, // ref, scope

  Stop: 60, // ref

  With: 70, // ref

  LetDecl: 80, // decl

  StateInc: 90, // ref

  PathPrimary: 100, // ref

  RecordDecl: 110, // decl
  RecordScope: 111, // scope

  VariableDecl: 120,
  GlobalConstantGroup: 121, // decl
  GlobalVariableGroup: 122, // decl
  LocalVariableGroup: 123, // decl

  EnumDecl: 130, // decl

  // Although it is NOT A GROUP for now
  // the analyzer would treat it as a group in case for future updates, etc
  RecordVariableDeclGroup: 140, // decl

  WhereExpr: 150,

  // VariableInit: 150, // ref
  // VariableWhere: 151,

  // Expression: 150, // REF

  InExpr: 160, // ref

  // Assert: 160, // ref

  FnDecl: 170, // decl (whole function)
  FnBodyScope: 172, // scope (body part of the function)
  FnParamsDecl: 173, // decl
  FnCall: 174, // ref

  // Primary: 180, // ref

  AnnotationDecl: 190, // decl

  DotExpr: 200,

  AssertExpr: 210,

  CompilerOption: 220,

  // variants of expr
  VariableInit: 230,
  Statement: 231,

  // check for / check each / ...
  GoalFinal: 240,

  PathAssignStatement: 250 // should get identifier via regex

  // PathCondition: 210,

}

// Identifier scoping kind
export const IdentifierKind = {
  Machine: 1,
  State: 2,
  Trans: 3,
  Let: 4,
  Record: 5,
  GlobalConst: 6,
  EnumField: 7,
  GlobalVariable: 8,
  LocalVariable: 9,
  FnName: 10,
  FnParam: 11,
  Annotation: 12,

  Invariant: 13,
  RecordField: 14,

  Unknown: -1
}

// Identifier data type, following Cyclone
export const IdentifierType = {
  Machine: 1,
  State: 2,
  Trans: 3,
  Record: 4,
  Enum: 5,
  Function: 6,
  Invariant: 7,

  Int: 8,
  String: 9,
  Char: 10,
  Real: 11,
  Bool: 12,

  BitVector: 13,

  Hole: -1, // The Epsilon type, used to prevent triggering duplicated type error msg
}

// Function / Operator kind
export const ActionKind = {
  InfixOperator: 1, // a x b
  PrefixOperator: 2, // x a
  SuffixOperator: 3, // a x
  Function: 4, // x(a)
}

// Syntax block kinds for the IR
export const SyntaxBlockKind = {
  CompilerOption: 1,
  Machine: 2,
  State: 3,
  Transition: 4,
  Assertion: 5,
  Variable: 6,
  Func: 7,
  Goal: 8,
  Invariant: 9,
  Statement: 10,
  PathVariable: 11,
  PathStatement: 12,
  Record: 13,
  SingleTypedVariableGroup: 14,
  FnParamGroup: 15,
  GoalFinal: 16,

  Program: 99,
}

export default {
  SemanticErrorType,
  SemanticContextType,
  IdentifierKind,
  IdentifierType,
  ActionKind,
  SyntaxBlockKind,
}