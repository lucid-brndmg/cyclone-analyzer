import {CategorizedCountTable, CategorizedStackTable, CountTable, StackedTable} from "../lib/storage.js";
import {IdentifierType, SemanticContextType} from "../language/definitions.js";

export const scopeMetadata = () => ({
  // local count table, will be subbed when exit scope
  identifierCounts: new CountTable(),
  recordCounts: new CategorizedCountTable(),
  // fixedCoords
})

export const declareMetadata = () => ({
  fieldType: IdentifierType.Hole,
  identifier: null,
  // members: []
})

export const singleTypedDeclGroupMetadata = () => ({
  fieldType: IdentifierType.Hole,
  enums: []
})

/*
* ---
* Metadata structures for specific semantic context types
* ---
* */

const functionScopeMetadata = () => ({
  isReturned: false,
})

const dotIdentifierExprMetadata = () => ({
  parent: null
})

const functionDeclarationMetadata = () => ({
  // signatures: {
  //   input: [], // [[]]
  //   output: IdentifierType.Unknown
  // }

  signatures: [{
    input: [],
    output: IdentifierType.Hole
  }]
})

const functionCallMetadata = () => ({
  fnName: null,
  gotParams: 0, // if gotParams != signature.length then pop(gotParams); setError() else ()
  gotReference: 0
})

const stateDeclMetadata = () => ({
  hasChildren: false,
  attributes: null
})

const transDeclMetadata = () => ({
  keyword: "",
  label: null,
  labelKeyword: null,
  whereExpr: null,
  fromState: null,
  toStates: [], // new Set(),
  operators: new Set(),
  excludedStates: [], // new Set(),

  involvedStates: null,
  // exclusionFlag: false
})

const goalScopeMetadata = () => ({
  invariants: [],
  states: [],
  expr: "",
  finalPosition: null,
  // stopKeyword: "stop"
})

const letDeclMetadata = () => ({
  // hasBody: false,
  body: null,
})

const machineDeclMetadata = () => ({
  keyword: "machine",
  keywordPosition: null,
  startNodeIdentifier: null,
  goalDefined: false,
  enumFields: new Set(),
  stateSet: new Set(),
  transitionSet: new Set(),
  actionTable: new CategorizedStackTable(),
  identifierStack: new StackedTable(),
  recordFieldStack: new CategorizedStackTable()
})

const compilerOptionMetadata = () => ({
  name: null,
  value: null
})

const whereExprMetadata = () => ({
  expr: ""
})

const inExprMetadata = () => ({
  // expr: "",
  identifiers: [],
})

export const semanticContextMetadataTable = {
  [SemanticContextType.FnBodyScope]: functionScopeMetadata,
  [SemanticContextType.DotExpr]: dotIdentifierExprMetadata,
  [SemanticContextType.FnDecl]: functionDeclarationMetadata,
  // [SemanticContextType.FnParamsDecl]: functionParamsMetadata,
  // [SemanticContextType.EnumDecl]: enumDeclarationMetadata,
  [SemanticContextType.StateDecl]: stateDeclMetadata,
  [SemanticContextType.TransDecl]: transDeclMetadata,
  [SemanticContextType.GoalScope]: goalScopeMetadata,
  [SemanticContextType.LetDecl]: letDeclMetadata,
  [SemanticContextType.FnCall]: functionCallMetadata,
  [SemanticContextType.MachineDecl]: machineDeclMetadata,
  [SemanticContextType.CompilerOption]: compilerOptionMetadata,
  [SemanticContextType.WhereExpr]: whereExprMetadata,
  [SemanticContextType.InExpr]: inExprMetadata
}