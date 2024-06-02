import {posPair} from "../lib/position.js";
import antlr4, {ParseTreeWalker} from "antlr4";
import CycloneLexer from "../generated/antlr/CycloneLexer.js";
import CycloneParser from "../generated/antlr/CycloneParser.js";

export const getBlockPositionPair = ctx => {
  const text = ctx.start.text || ctx.stop.text
  const textLength= text ? text.length : 1
  const startLine = ctx.start.line
  const stopLine = ctx.stop.line
  const startCol = ctx.start.column
  const stopCol = ctx.stop.column

  return posPair(
    startLine, startCol,
    stopLine, stopCol + (stopLine === startLine && stopCol === startCol ? textLength : 0) // + textLength
  )
}

export const getSymbolPosition = (symbol, length = 0) => {
  const line = symbol.line
  const col = symbol.column
  return posPair(
    line, col,
    line, col + (length || symbol.text.length)
  )
}

export const getIdentifierTokensInList = ctx => ctx.children?.filter(c => c instanceof CycloneParser.IdentifierContext) ?? []

export const getIdentifiersInList = ctx => getIdentifierTokensInList(ctx).map(it => it.start.text)

export const getIdentTextPos = ctx => ({identifier: ctx.start.text, position: getBlockPositionPair(ctx)})

export const getPositionedIdentifiersInList = ctx => getIdentifierTokensInList(ctx).map(getIdentTextPos)

export const getParentExpression = ctx => ctx.parentCtx.start.getInputStream().getText(ctx.parentCtx.start.start, ctx.parentCtx.stop.stop)

export const getExpression = ctx => ctx.start.getInputStream().getText(ctx.start.start, ctx.stop.stop)

export const getOnlyExpression = (ctx, parserContext) => {
  const expr = ctx.children?.find(c => c instanceof parserContext)
  if (expr) {
    return getExpression(expr)
  }

  return undefined
}

export const firstSymbolObject = ctx => {
  if (!ctx.children) {
    return null
  }

  for (const child of ctx.children) {
    const sym = child.symbol
    if (sym) {
      return sym
    }
  }

  return null
}

export const firstSymbol = ctx => firstSymbolObject(ctx)?.text

export const existsSymbol = (ctx, symbol) => {
  if (!ctx.children) {
    return false
  }

  for (const child of ctx.children) {
    if (child.symbol?.text === symbol) {
      return true
    }
  }

  return false
}

export const listenerWalk = (listener, parseTree) => {
  ParseTreeWalker.DEFAULT.walk(listener, parseTree)
}

export class ErrorListener extends antlr4.error.ErrorListener {}

export const parseCycloneSyntax = ({input, lexerErrorListener, parserErrorListener, entry = "program"}) => {
  const stream = new antlr4.InputStream(input)
  const lexer = new CycloneLexer(stream)
  lexer.removeErrorListeners()
  if (lexerErrorListener) {
    lexer.addErrorListener(lexerErrorListener)
  }

  const tokenStream = new antlr4.CommonTokenStream(lexer)
  const parser = new CycloneParser(tokenStream)
  parser.removeErrorListeners()
  if (parserErrorListener) {
    parser.addErrorListener(parserErrorListener)
  }

  const tree = parser[entry]()

  return {
    lexer,
    parser,
    tokenStream,
    tree,
    syntaxErrorsCount: parser.syntaxErrorsCount,
  }
}

export const deepestContext = (ctx, stopInstance = null) => (stopInstance == null || !(ctx instanceof stopInstance)) && ctx.children?.length === 1
  ? deepestContext(ctx.children[0], stopInstance)
  : ctx

export const tryGetSpecifiedContext = (ctx, targetClass = null) => {
  if (ctx instanceof CycloneParser.ParExpressionContext || ctx instanceof CycloneParser.ParPathConditionContext) {
    return tryGetSpecifiedContext(ctx.children[1])
  }
  if (targetClass == null || ctx instanceof targetClass) {
    return ctx
  }
  if (ctx.children?.length === 1) {
    return tryGetSpecifiedContext(ctx.children[0])
  }
  return null
}

export default {
  getBlockPositionPair,
  getSymbolPosition,
  getIdentifiersInList,
  getParentExpression,
  getExpression,
  firstSymbol,
  listenerWalk,
  ErrorListener,
  parseCycloneSyntax,
  firstSymbolObject,
  deepestContext,
  tryGetSpecifiedContext,
  getIdentTextPos
}