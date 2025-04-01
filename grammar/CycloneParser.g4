/*
This grammar specification referenced the original grammar specification in the Cyclone compiler source code, which is written in ANTLR3.

This grammar definition has rewritten the original definition to ANTLR4 format with modifications for adapting the semantic analyzer.

Original author: Hao Wu
*/

parser grammar CycloneParser;
options { tokenVocab = CycloneLexer; }

identifier:
  IDENT
  ;

compOptions: 
  OPTION optionName EQUAL literal SEMI;

optionName:
  DEBUG
  | LOG
  | OUTPUT
  | TRACE
  | PRECISION
  | TIMEOUT
  | DETECT
  | BVDISPLAY
  ;

statementList: statement*;
transList: trans*;
letOrPathAssignExpr: letExpr | pathAssignStatement;
globalDefinitions: (globalVariableGroup) | (globalConstantGroup) | (record) | (functionDeclaration);

program:
  (compOptions)*
  machineDecl
  EOF;

machineDecl:
  (MACHINE | GRAPH) identifier machineScope
  ;

machineScope:
  LBRACE
  ((globalVariableGroup) | (globalConstantGroup) | (record) | (functionDeclaration))*
  (stateExpr)*
  (trans)*
  (invariantExpression)*
  (goal)?
  RBRACE
  ;

stateExpr:
  (stateModifier)* (STATE | NODE) identifier
  stateScope
  ;

stateScope:
  LBRACE
  (statement)*
  RBRACE
  ;

trans:
  (TRANS1 | TRANS2 | EDGE) ((identifier))?
  transScope
  ;

transScope:
    LBRACE identifier
    (transOp transDef)
    ((ON | LABEL) label)?
    (whereExpr SEMI)?
    RBRACE
    ;

transOp: ARROW | BI_ARROW;
transDef: identifier (COMMA identifier)*
          | STAR transExclExpr?
          | PLUS transExclExpr?
          ;
transExclExpr:
    LBRACK identifier (COMMA identifier)* RBRACK
    ;

invariantExpression:
  INVARIANT identifier
  invariantScope
  (inExpr)?
  ;

inExpr:
  IN LPAREN identifier (COMMA identifier)* RPAREN
  ;

invariantScope:
  LBRACE (statement) RBRACE
  ;

goal:
  GOAL 
  LBRACE 
  (
    (letExpr)
    | (pathAssignStatement)
    | (assertExpr)
  )*
  checkExpr
  RBRACE
  ;

checkExpr:
  (CHECK | ENUMERATE) forExpr (viaExpr)? (withExpr)? (stopExpr)?
  ;

//checkMainExpr:
//  (CHECK | ENUMERATE) forExpr (viaExpr)?
//  ;

forExpr:
  (FOR | EACH | UPTO) intLiteral (COMMA intLiteral)*
  ;

stopExpr:
  (REACH | STOP) LPAREN identifier (COMMA identifier)* RPAREN
  ;

viaExpr:
  (VIA | CONDITION) LPAREN pathExprList RPAREN
  ;

pathExprList: pathExpr (COMMA pathExpr)*;

withExpr:
  WITH LPAREN (identifier (COMMA identifier)*) RPAREN
  ;

letExpr:
  LET identifier (pathCondAssignExpr)? SEMI
  ;

pathAssignStatement:
  identifier pathCondAssignExpr SEMI
  ;

pathCondAssignExpr:
  EQUAL pathCondition
  ;

pathExpr:
  pathCondition
  ;

pathCondition:
  orPathCondition
  ;

orPathCondition:
  andPathCondition (OR andPathCondition)*
  ;

andPathCondition:
  xorPathCondition (AND xorPathCondition)*
  ;

xorPathCondition:
  unaryPathCondition (HAT unaryPathCondition)*
  ;

unaryPathCondition:
  NOT unaryPathCondition
  | primaryCondition
  | parPathCondition
  ;

primaryCondition:
  stateIncExpr
  | pathPrimaryExpr
  | boolLiteral
  ;

parPathCondition:
  LPAREN pathCondition RPAREN
  ;

// ident reference
// see: https://classicwuhao.github.io/cyclone_tutorial/expr/place-left-op.html
stateIncExpr:
  (
    SHIFT_LEFT (intLiteral)?
    | SHIFT_RIGHT (intLiteral)?
  )?
  identifier (HAT LBRACE intLiteral (COLON intLiteral)? RBRACE)?
  | (
    (SHIFT_LEFT (intLiteral)? | SHIFT_RIGHT (intLiteral)?)?
    LPAREN identifier
    (HAT LBRACE intLiteral (COLON intLiteral)? RBRACE)?
    RPAREN
  )
  ;

// nodeI -> nodeJ
pathPrimaryExpr:
  (
    (
      identifier 
      | pathOp (LBRACK identifier (COMMA identifier)* RBRACK)?
    )

    (
      ARROW
      (identifier | pathOp (LBRACK identifier (COMMA identifier)* RBRACK)?)
    )+
  )
  | (
    (SHIFT_LEFT (intLiteral)? | SHIFT_RIGHT (intLiteral)?)?
    LPAREN
    (identifier | pathOp (LBRACK identifier (COMMA identifier)* RBRACK)?)
    (ARROW (identifier | pathOp (LBRACK identifier (COMMA identifier)* RBRACK)?))+
    RPAREN
    ((HAT LBRACE intLiteral) (COLON intLiteral)? RBRACE)?
  )
  ;

pathOp: P_OP_ONE;

label:
  STRINGLITERAL
  ;

stateModifier:
  START
  | FINAL
  | ABSTRACT
  | NORMAL
  ;

literal:
  intLiteral
  | realLiteral
  | boolLiteral
  | stringLiteral
  | charLiteral
  | enumLiteral
  | bvLiteral
  ;

intLiteral: INTLITERAL;
realLiteral: REALLITERAL;
boolLiteral: BOOLLITERAL;
stringLiteral: STRINGLITERAL;
charLiteral: CHARLITERAL;
bvLiteral: BVLITERAL;

// consider drop(1) (the #) when register?
enumLiteral:
  ENUMLITERAL
  ;

// decl
record:
  RECORD identifier
  recordScope
  SEMI
  ;

recordScope:
  LBRACE
  recordVariableDeclGroup
  RBRACE
  ;

recordVariableDeclGroup:
  (recordVariableDecl)+
  ;

recordVariableDecl:
  type variableDeclarator SEMI
  ;

// registration
globalConstantGroup:
  CONST type globalConstantDecl
  (COMMA globalConstantDecl)*
  SEMI
  ;

globalConstantDecl:
  identifier EQUAL variableInitializer
  ;

// listen
globalVariableGroup:
  type variableDeclarator
  (COMMA variableDeclarator)*
  SEMI
  ;

// listen
localVariableGroup:
  type variableDeclarator
  (COMMA variableDeclarator)*
  SEMI
  ;

modifier:
  GLOBAL
  | NATIVE
  ;

type:
  primitiveType
  | enumType
  | bvType
  ;

primitiveBvType:
  primitiveType | bvType;

bvType:
  BV LBRACK (INTLITERAL | IDENT) RBRACK
  ;

primitiveType:
  INT
  | BOOL
  | REAL
  | STRING
  ;

// register
enumType:
  ENUM LBRACE enumDecl
  (COMMA enumDecl)* RBRACE
  ;

enumDecl:
  identifier
  ;

// skip current block, push parent block (global / localVariableGroup)
// enter: peek = globalVarDecl | localVariableGroup | recordDecl
variableDeclarator:
  identifier 
  (EQUAL variableInitializer)?
  (whereExpr)?
  ;

whereExpr:
  WHERE expression;

variableInitializer:
  expression
  ;

// reference
assertExpr:
  (annotationExpr)?
  ASSERT
  assertMainExpr
  (inExpr)?
  SEMI
  ;

assertMainExpr:
  (ALWAYS | SOME)? expression
  ;

statement:
  expression SEMI
  ;

expression:
  conditionalImpliesExpression ((EQUAL | ASSIGN_PLUS_EQ | ASSIGN_MINUS_EQ | ASSIGN_TIMES_EQ | ASSIGN_DIV_EQ | ASSIGN_SHIFT_LEFT | ASSIGN_SHIFT_RIGHT) expression)?
  ;

conditionalImpliesExpression:
  conditionalOrExpression (IMPLIES conditionalOrExpression)*
  ;

conditionalOrExpression:
  conditionalAndExpression (OR conditionalAndExpression)*
  ;

conditionalAndExpression:
  conditionalXorExpression (AND conditionalXorExpression)*
  ;

conditionalXorExpression:
  bitwiseOrExpression (HAT bitwiseOrExpression)*
  ;

bitwiseOrExpression:
  bitwiseAndExpression (BAR bitwiseAndExpression)*
  ;

bitwiseAndExpression:
  equalityExpression (BIT_AND equalityExpression)*
  ;

equalityExpression:
  relationalExpression ((DOUBLE_EQUAL | NOT_EQUAL) relationalExpression)*
  ;

relationalExpression:
  bitShiftExpression (( LESS_EQUAL | GREATER_EQUAL | LESS | GREATER) bitShiftExpression)*
  ;

bitShiftExpression:
  additiveExpression ((SHIFT_LEFT | SHIFT_RIGHT) additiveExpression)*
  ;

additiveExpression:
  multiplicativeExpression ((PLUS | MINUS) multiplicativeExpression)*
  ;

multiplicativeExpression:
  powExpression ((STAR | SLASH | MOD) powExpression)*
  ;

powExpression:
  unaryExpression (TIMES_TIMES unaryExpression)*
  ;

unaryExpression:
  PLUS unaryExpression
  | MINUS unaryExpression
  | unaryExpressionNotPlusMinus
  ;

unaryExpressionNotPlusMinus:
  NOT unaryExpression
  | BIT_NEGATION unaryExpression
  | primary (MINUS_MINUS | PLUS_PLUS)?
  ;

// bool, bool (at least 2 expression, all bool)
oneExpr:
  ONE LPAREN expression (COMMA expression)+ RPAREN
  ;

freshExpr:
  FRESH LPAREN identifier RPAREN;

initialExpr:
  INITIAL LPAREN dotIdentifierExpr RPAREN;

// tbd
prevExpr:
  PREV LPAREN identifier RPAREN;

functionDeclaration:
  FUNCTION (identifier) COLON primitiveBvType
  functionBodyScope
  ;

functionBodyScope:
  functionParamsDecl
  LBRACE
  (localVariableGroup )*
  (statement)+
  RBRACE
  ;

functionParamsDecl:
  LPAREN
  functionParam?
  (COMMA functionParam )*
  RPAREN
  ;

functionParam:
  identifier COLON primitiveBvType
  ;

returnExpr:
  RETURN expression
  ;

primary:
  parExpression
  | dotIdentifierExpr
  | literal // maybe this is not needed??
  // | prevExpr // PREV LPAREN identifier RPAREN // ???
  | initialExpr // INITIAL LPAREN dotIdentifierExpr RPAREN // same type as fresh
  | freshExpr // FRESH LPAREN identifier RPAREN // = copy(a) -> a
  | oneExpr
  | returnExpr
  | funCall
  ;

// to catch the dot expression: DotExprBlock -> enterDot (setFlag(DotExprBlock)) -> enterIdentifier(checkFlag(DotExprBlock))
dotIdentifierExpr:
  identifier (DOT identifier)?
  ;

parExpression:
  LPAREN expression RPAREN
  ;

funCall:
  identifier LPAREN expression (COMMA expression)* RPAREN
  ;

iteStatement:
  IF parExpression statement (ELSE statement)?
  ;

// register
annotationExpr:
  AT_SIGN LABEL COLON identifier;