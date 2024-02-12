import {firstSymbol, listenerWalk, parseCycloneSyntax} from "../utils/antlr.js";
import CycloneParserListener from "../generated/antlr/CycloneParserListener.js";
import antlr4 from "antlr4";

class IdentifierReplacer extends CycloneParserListener {
  rewriter
  replacements
  isDotMode = false

  constructor(tokenStream, replacements) {
    super();
    this.rewriter = new antlr4.TokenStreamRewriter(tokenStream)
    this.replacements = replacements
  }

  enterEnumLiteral(ctx) {
    if (!this.replacements.enumLiteralsMap) {
      return
    }
    const text = ctx.start.text
    if (this.replacements.enumLiteralsMap.has(text)) {
      this.rewriter.replace(ctx.start, ctx.stop, this.replacements.enumLiteralsMap.get(text))
    }
  }

  enterIdentifier(ctx) {
    if (this.isDotMode || !this.replacements.commonIdentifiersMap) {
      return
    }
    const text = ctx.start.text
    if (this.replacements.commonIdentifiersMap.has(text)) {
      this.rewriter.replace(ctx.start, ctx.stop, this.replacements.commonIdentifiersMap.get(text))
    }
  }

  enterDotIdentifierExpr(ctx) {
    if (firstSymbol(ctx)) {
      // exists "."
      this.isDotMode = true
    }
  }

  exitDotIdentifierExpr(ctx) {
    if (this.isDotMode) {
      this.isDotMode = false
      if (!this.replacements.dotIdentifiersMap) {
        return
      }
      const ident = `${ctx.start.text}.${ctx.stop.text}`
      if (this.replacements.dotIdentifiersMap.has(ident)) {
        this.rewriter.replace(ctx.start, ctx.stop, this.replacements.dotIdentifiersMap.get(ident))
      }
    }
  }

  getText() {
    return this.rewriter.getText()
  }
}

export const replaceIdentifiers = (code, parsingEntry, {commonIdentifiersMap = null, enumLiteralsMap = null, dotIdentifiersMap = null}) => {
  const {tokenStream, tree} = parseCycloneSyntax({
    input: code,
    entry: parsingEntry
  })

  const replacer = new IdentifierReplacer(tokenStream, {
    commonIdentifiersMap,
    enumLiteralsMap,
    dotIdentifiersMap
  })

  listenerWalk(replacer, tree)

  return replacer.getText()
}

export default {
  replaceIdentifiers
}