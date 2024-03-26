import CycloneParserListener from "../generated/antlr/CycloneParserListener.js";
import {firstSymbol, getExpression} from "../utils/antlr.js";
import CycloneParser from "../generated/antlr/CycloneParser.js";

/*
* a specific parser listener for handling check expressions
* */
export default class CheckExprListener extends CycloneParserListener {
  result

  constructor() {
    super();
    this.result = {}
  }

  enterCheckExpr(ctx) {
    this.result.checkKeyword = firstSymbol(ctx)
  }

  enterForExpr(ctx) {
    this.result.forKeyword = firstSymbol(ctx)
    this.result.forValues = ctx.children
      .filter(c => c instanceof CycloneParser.IntLiteralContext)
      .map(it => it.start.text)
  }

  enterViaExpr(ctx) {
    this.result.viaKeyword = firstSymbol(ctx)
    this.result.viaExpr = getExpression(ctx.children.filter(c => c instanceof CycloneParser.PathExprContext)[0])
  }

  enterWithExpr(ctx) {
    this.result.withEnabled = true
  }

  enterStopExpr(ctx) {
    this.result.stopKeyword = firstSymbol(ctx)
  }
}