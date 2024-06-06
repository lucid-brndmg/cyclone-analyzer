/*
This grammar specification referenced the original grammar specification in the Cyclone compiler source code, which is written in ANTLR3.

This grammar definition has rewritten the original definition to ANTLR4 format with modifications for adapting the semantic analyzer.

Original author: Hao Wu
*/

lexer grammar CycloneLexer;

// Use paraphrases for nice error messages
ARROW 		 : '->';
BI_ARROW     : '<->';
AT_SIGN    	 :  '@';
BAR 		 : '|'; // BITWISE_OR
COLON 		 : ':';
COLON_COLON	 : '::';
COLON_EQUAL	 : ':=';
COMMA 		 : ',';
DOT 		 : '.';
DOTDOT 		 : '..';
EQUAL 		 : '=';
GREATER 	 : '>';
GREATER_EQUAL : '>=';
HASH 		 : '#';
LBRACE 		 : '{';
LBRACK 		 : '[';
LESS 		 : '<';
LESS_EQUAL 	 : '<=';
LPAREN 		 : '(';
MINUS 		 : '-';
NOT_EQUAL 	 : '!=';
RBRACE 		 : '}';
RBRACK 		 : ']';
RPAREN		 : ')';
SEMI		 : ';';
SLASH 		 : '/';
STAR 		 : '*';
PLUS         : '+';
XOR          : 'xor'; // NEVER USED
IMPLIES      : '=>';
NOT          : '!';
HAT          : '^';
P_OP_ONE     : '_';
BIT_AND      : '&';
BIT_NEGATION : '~';

PLUS_PLUS: '++';
MINUS_MINUS: '--';
TIMES_TIMES: '**';
MOD: '%';
OR: '||';
AND: '&&';
ASSIGN_PLUS_EQ: '+=';
ASSIGN_MINUS_EQ: '-=';
ASSIGN_TIMES_EQ: '*=';
ASSIGN_DIV_EQ: '/=';
ASSIGN_SHIFT_LEFT: '<<=';
ASSIGN_SHIFT_RIGHT: '>>=';

SHIFT_LEFT: '<<';
SHIFT_RIGHT: '>>';
DOUBLE_EQUAL: '==';

GLOBAL: 'global';
NATIVE: 'native';

DEBUG: 'debug';
LOG: 'log';
OUTPUT: 'output';
TRACE: 'trace';
PRECISION: 'precision';
TIMEOUT: 'timeout';
DETECT: 'detect';
BVDISPLAY: 'bvdisplay';

//keywords
STATE		 : 'state';
NODE         : 'node';
MACHINE		 : 'machine';
GRAPH        : 'graph';
TRANS1		 : 'transition';
TRANS2       : 'trans';
EDGE         : 'edge';
RECORD       : 'record';
CONST        : 'const';
ON		     : 'on';
LABEL        : 'label';
INVARIANT    : 'invariant';
INT          : 'int';
BOOL         : 'bool';
REAL         : 'real';
CHAR         : 'char';
STRING       : 'string';
ENUM         : 'enum';
WHERE        : 'where';
START        : 'start';
FINAL        : 'final';
ABSTRACT     : 'abstract';
NORMAL       : 'normal';
PREV         : 'prev';
GOAL         : 'goal';
CHECK        : 'check';
FOR          : 'for';
STOP         : 'stop';
AT           : 'at';
VIA          : 'via';
CONDITION    : 'condition';
REACH        : 'reach';
WITH         : 'with';
ENUMERATE    : 'enumerate';
LET          : 'let';
EACH         : 'each';
ASSERT       : 'assert';
INITIAL      : 'initial';
IN           : 'in';
FRESH        : 'fresh';
OPTION       : 'option-';
ALWAYS       : 'always';
SOME         : 'some';
ONE          : 'one';
UPTO         : 'upto';
FUNCTION     : 'function';
RETURN       : 'return';
IF           : 'if';
ELSE         : 'else';
BV           : 'bv';

INTLITERAL:
    ('0'..'9')+ 
    ;

BVLITERAL:
    ('0x' [0-9a-fA-F]+ )
    | ([01]+[bB])
    ;

REALLITERAL:
   DIGIT+ '.' DIGIT+ 
;

CHARLITERAL
    :   '\'' 
        (   EscapeSequence 
        |   ~( '\'' | '\\' | '\r' | '\n' )
        ) 
        '\''
    ;

STRINGLITERAL
    :   '"' 
        (   EscapeSequence
        |   ~( '\\' | '"' | '\r' | '\n' )        
        )* 
        '"' 
    ;

BOOLLITERAL
    : 'true'
    | 'false'
;

ENUMLITERAL
    : HASH IDENT
;

IDENT:
        IdentifierStart IdentifierPart*
    ;

ML_COMMENT:       '/*' .*? '*/'    -> channel(HIDDEN); // skip, channel(HIDDEN);
SL_COMMENT:       '//' ~[\r\n]*    -> channel(HIDDEN); // skip, channel(HIDDEN);
WS:
  (  ' '
    | '\t'
    | '\f'
    | NEWLINE)
  -> channel(HIDDEN);

fragment DIGIT: ('0'..'9');

fragment EscapeSequence
    :   '\\' (
                 'b' 
             |   't' 
             |   'n' 
             |   'f' 
             |   'r' 
             |   '"' 
             |   '\'' 
             |   '\\' 
             |       
                 ('0'..'3') ('0'..'7') ('0'..'7')
             |       
                 ('0'..'7') ('0'..'7') 
             |       
                 ('0'..'7')
             )          
;

fragment IdentifierStart
    :   ('a'..'z' | 'A'..'Z' | '_');
                       
fragment IdentifierPart
    : ('a'..'z' | 'A'..'Z' | '_' | '0'..'9');

fragment NEWLINE	:	
    '\r\n' | '\r' | '\n';