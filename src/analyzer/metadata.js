/*
* Various semantic context metadata structures for different types
*
* */

import {CategorizedCountTable, CategorizedStackTable, CountTable, StackedTable} from "../lib/storage.js";
import {IdentifierType, SemanticContextType} from "../language/definitions.js";

// metadata for "scope" semantic contexts
export const scopeMetadata = () => ({
  // local count table, will be subbed when exit scope
  identifierCounts: new CountTable(),
  recordCounts: new CategorizedCountTable(),
  // fixedCoords
})

// metadata for "declaration" semantic contexts
export const declareMetadata = () => ({
  fieldType: IdentifierType.Hole,
  identifier: null,
  // members: []
})

// metadata for "grouped" semantic contexts with a single type. Example: global variable / const
export const singleTypedDeclGroupMetadata = () => ({
  fieldType: IdentifierType.Hole,
  fieldTypeParams: [],
  enums: [],
  identifiers: [],
  parent: null
})

/*
* ---
* Metadata structures for specific semantic context types
* ---
* */

// metadata for function body
const functionScopeMetadata = () => ({
  isReturned: false, // is the function marked returned (previously read a return statement)
})

// metadata for DOT expression: a.b
const dotIdentifierExprMetadata = () => ({
  parent: null // id info of parent, the record
})

// metadata for function declaration
const functionDeclarationMetadata = () => ({
  // signatures: {
  //   input: [], // [[]]
  //   output: IdentifierType.Unknown
  // }

  // function signatures
  signatures: [{
    input: [], // parameter types
    output: IdentifierType.Hole, // return type
    inputParams: [], // [[x]]
    outputParams: [] // [x]
  }]
})

// metadata for function application
const functionCallMetadata = () => ({
  fnName: null, // name of function
  gotParams: 0, // if gotParams != signature.length then pop(gotParams); setError() else ()
  gotReference: 0 // use of id counting
})

// metadata for state / node declaration
const stateDeclMetadata = () => ({
  hasChildren: false, // if the node has statement, used for checking statement in abstract node
  attributes: null, // state attributes, as an array, read from parser directly
  edgeSource: 0, edgeTargets: 0, edgeExclusions: 0,
  position: null
})


// metadata for edge / transition
const transDeclMetadata = () => ({
  keyword: "", // edge keyword: edge / trans / transition
  label: null, // edge label
  labelKeyword: null, // edge label keyword: label / on
  whereExpr: null, // edge when expression
  fromState: null, // edge source state
  toStates: [], // edge target states, if specified clearly (not closure mode)
  operators: new Set(), // edge operators, including +, *, ->, <->
  excludedStates: [], // edge exclusion, if closure

  involvedStates: null, // calculated target states
  involvedRelations: [],
  isAnonymous: false,
})

// metadata for goal block
const goalScopeMetadata = () => ({
  invariants: [], // invariants mentioned by check expr
  states: [], // states mentioned by check expr
  expr: "", // the check expr, as string
  finalPosition: null, // position of check expr
  validCheckPathLengths: null,
  checkKeyword: null
})

// metadata for path variable declaration
const letDeclMetadata = () => ({
  // hasBody: false,
  body: null, // the body code of path variable
})

// metadata for machine / graph
const machineDeclMetadata = () => ({
  keyword: "machine", // the keyword: machine / graph
  keywordPosition: null, // the position of the keyword
  startNodeIdentifier: null, // the identifier that marked as start node, used for testing if the graph got a start node
  finalNodeIdentifiers: [],
  goalDefined: false, // is goal block defined in the graph
  enumFields: new Map(), // enum fields
  // stateSet: new Set(), // all defined states
  stateMap: new Map(),
  stateList: null, // Non-duplicated list
  transitionIndexSet: new Set(), // all defined edges
  transitionDefinitions: [],
  actionTable: new CategorizedStackTable(), // the table of declared functions
  identifierStack: new StackedTable(), // the table of identifier information, use a stack as value to store scope data
  recordFieldStack: new CategorizedStackTable(), // the table of record field information
  referenceCounts: new Map()
})

// metadata for compiler options
const compilerOptionMetadata = () => ({
  name: null,
  value: null,
  position: null
})

// metadata for where expression
const whereExprMetadata = () => ({
  expr: ""
})

// metadata for in expression
const inExprMetadata = () => ({
  // expr: "",
  identifiers: [],
})

const assertExprMetadata = () => ({
  inExpr: false
})

const statementMetadata = () => ({
  isReturn: false,
  exprStack: []
})

// make a table that corresponds to semantic context type to help the analyzer assign them
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
  [SemanticContextType.InExpr]: inExprMetadata,
  [SemanticContextType.AssertExpr]: assertExprMetadata,
  [SemanticContextType.Statement]: statementMetadata
}