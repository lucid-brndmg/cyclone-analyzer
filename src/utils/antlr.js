import {posPair} from "../lib/position.js";
import antlr4, {ParseTreeWalker} from "antlr4";
import CycloneLexer from "../generated/antlr/CycloneLexer.js";
import CycloneParser from "../generated/antlr/CycloneParser.js";

export const getBlockPositionPair = ctx => {
  const text = ctx.start.text || ctx.stop.text
  const textLength= !text || text === "<EOF>" ? 1 : text.length
  const startLine = ctx.start.line
  const stopLine = ctx.stop.line
  const startCol = ctx.start.column
  const stopCol = ctx.stop.column

  return posPair(
    startLine, startCol,
    stopLine, stopCol + (stopLine === startLine && stopCol === startCol ? textLength : 0) // + textLength
  )
}

export const getSymbolPosition = (symbol, length) => {
  const line = symbol.line
  const col = symbol.column
  return posPair(
    line, col,
    line, col + (length || symbol.text.length)
  )
}

export const getIdentifiersInList = ctx => ctx.children?.filter(c => c instanceof CycloneParser.IdentifierContext)?.map(it => it.start.text) ?? []

export const getParentExpression = ctx => ctx.parentCtx.start.getInputStream().getText(ctx.parentCtx.start.start, ctx.parentCtx.stop.stop)

export const getExpression = ctx => ctx.start.getInputStream().getText(ctx.start.start, ctx.stop.stop)

export const firstSymbol = ctx => {
  if (!ctx.children) {
    return null
  }

  for (let child of ctx.children) {
    const symbol = child.symbol
    if (symbol) {
      return symbol.text
    }
  }

  return null
}

export const listenerWalk = (listener, parseTree) => {
  ParseTreeWalker.DEFAULT.walk(listener, parseTree)
}

export class ErrorListener extends antlr4.error.ErrorListener {}

export const parseCycloneSyntax = ({input, lexerErrorListener, parserErrorListener}) => {
  const stream = new antlr4.InputStream(input)
  const lexer = new CycloneLexer(stream)
  lexer.removeErrorListeners()
  if (lexerErrorListener) {
    lexer.addErrorListener(lexerErrorListener)
  }

  const tokens = new antlr4.CommonTokenStream(lexer)
  const parser = new CycloneParser(tokens)
  parser.removeErrorListeners()
  if (parserErrorListener) {
    parser.addErrorListener(parserErrorListener)
  }

  const tree = parser.program()

  return {
    tree,
    syntaxErrorsCount: parser.syntaxErrorsCount,
  }
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
  parseCycloneSyntax
}