import {
  firstSymbol, firstSymbolObject,
  getBlockPositionPair,
  listenerWalk,
  parseCycloneSyntax
} from "../utils/antlr.js";
import CycloneParserListener from "../generated/antlr/CycloneParserListener.js";
import antlr4 from "antlr4";

/*
* A specific parser listener that used for replacing identifiers in the program
* */
class IdentifierReplacer extends CycloneParserListener {
  rewriter
  replacements
  isDotMode = false

  constructor(tokenStream, replacements) {
    super();
    this.rewriter = new antlr4.TokenStreamRewriter(tokenStream)
    this.replacements = replacements
  }

  isInRange(ctx) {
    if (!this.replacements.rangePair) {
      return true
    }
    const {startPosition, stopPosition} = getBlockPositionPair(ctx)
    if (this.replacements.rangePair.startPosition) {
      const {line, column} = this.replacements.rangePair.startPosition
      if (startPosition.line < line || (startPosition.line === line && column < startPosition.column)) {
        return false
      }
    }

    if (this.replacements.isStrictRange && this.replacements.rangePair.stopPosition) {
      const {line, column} = this.replacements.rangePair.stopPosition
      if (stopPosition.line > line || (stopPosition.line === line && column > stopPosition.column)) {
        return false
      }
    }

    return true
  }

  enterEnumLiteral(ctx) {
    if (!this.replacements.enumLiteralsMap || !this.isInRange(ctx)) {
      return
    }
    const text = ctx.start.text
    if (this.replacements.enumLiteralsMap.has(text)) {
      this.rewriter.replace(ctx.start, ctx.stop, this.replacements.enumLiteralsMap.get(text))
    }
  }

  enterIdentifier(ctx) {
    if (this.isDotMode || !this.replacements.commonIdentifiersMap || !this.isInRange(ctx)) {
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
      if (!this.replacements.dotIdentifiersMap || !this.isInRange(ctx)) {
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

export const replaceIdentifiers = (
  code,
  parsingEntry,
  {
    commonIdentifiersMap = null,
    enumLiteralsMap = null,
    dotIdentifiersMap = null,
    rangePair = null,
    isStrictRange = false,
  }) => {
  const {tokenStream, tree} = parseCycloneSyntax({
    input: code,
    entry: parsingEntry
  })

  const replacer = new IdentifierReplacer(tokenStream, {
    commonIdentifiersMap,
    enumLiteralsMap,
    dotIdentifiersMap,
    rangePair,
    isStrictRange
  })

  listenerWalk(replacer, tree)

  return replacer.getText()
}

class OperatorReplacer extends CycloneParserListener {
  rewriter;
  replacementMap;
  replacerFn

  getText() {
    return this.rewriter.getText()
  }

  constructor(tokenStream, replacementMap, replacerFn) {
    super();
    this.rewriter = new antlr4.TokenStreamRewriter(tokenStream)
    this.replacementMap = replacementMap
    this.replacerFn = replacerFn
  }

  replaceSymbol(sym, ctx, index) {
    const text = sym?.text
    if (this.replacementMap) {
      if (text && this.replacementMap.has(text)) {
        // console.log("symbol", text, sym.start, sym.stop)
        this.rewriter.replace(sym, sym, this.replacementMap.get(text))
      }
    } else {
      if (text) {
        const resp = this.replacerFn(sym, ctx, index)
        if (resp != null) {
          this.rewriter.replace(sym, sym, resp)
        }
      }
    }

  }

  replaceFirst(ctx) {
    const sym = firstSymbolObject(ctx)
    this.replaceSymbol(sym, ctx, 0)
  }

  replaceRecursive(ctx) {
    let symIdx = 0
    for (let child of ctx.children) {
      if (child.symbol) {
        this.replaceSymbol(child.symbol, ctx, symIdx)
        symIdx ++
      } else if (child.children) {
        this.replaceRecursive(child)
      }
    }
  }

  enterTransOp(ctx) {
    this.replaceFirst(ctx)
  }

  enterPathCondition(ctx) {
    this.replaceRecursive(ctx)
  }

  enterExpression(ctx) {
    this.replaceRecursive(ctx)
  }

}

export const replaceOperators = (
  code,
  parsingEntry,
  replacementMap,
  replacementFn
) => {
  const {tokenStream, tree} = parseCycloneSyntax({
    input: code,
    entry: parsingEntry
  })
  const replacer = new OperatorReplacer(tokenStream, replacementMap, replacementFn)

  listenerWalk(replacer, tree)

  return replacer.getText()
}

export default {
  replaceIdentifiers,
  replaceOperators
}