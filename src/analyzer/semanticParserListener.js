import {ActionKind, IdentifierType, SemanticContextType} from "../language/definitions.js";
import CycloneParserListener from "../generated/antlr/CycloneParserListener.js";
import {
  getSymbolPosition,
  getBlockPositionPair,
  getIdentifiersInList,
  firstSymbol,
  getExpression, existsSymbol, getIdentifierTokensInList, getPositionedIdentifiersInList
} from "../utils/antlr.js";
import CycloneParser from "../generated/antlr/CycloneParser.js";


/*
* The parse listener that uses the semantic analyzer to check for each block
* This listener does these things:
* 1. Mark / Un-mark semantic context
* 2. Get certain keywords / literals from ANTLR parser context
* 3. Call corresponding method of semantic analyzer to check specific block
* */
export default class SemanticParserListener extends CycloneParserListener {
  analyzer

  constructor(semanticAnalyzer) {
    super();
    this.analyzer = semanticAnalyzer
  }

  // static walk(semanticAnalyzer, parseTree) {
  //   ParseTreeWalker.DEFAULT.walk(new SemanticParserListener(semanticAnalyzer), parseTree)
  // }

  #handleBinaryOp(ctx) {
    for (let child of ctx.children) {
      const symbol = child.symbol
      if (symbol) {
        const op = symbol.text
        // console.log("exit bin op", op)
        this.analyzer.deduceActionCall(ActionKind.InfixOperator, op, 2, getSymbolPosition(symbol, op.length))
      }
    }
  }

  #handleUnaryOp(ctx) {
    // console.log("possible unary", ctx)

    if (ctx.children.length !== 2) {
      return
    }

    const isSuffix = ctx.children[1].hasOwnProperty("symbol")
    const symbol = ctx.children[isSuffix ? 1 : 0]?.symbol
    const op = symbol?.text
    if (op) {
      // console.log("exit unary op", op)
      this.analyzer.deduceActionCall(isSuffix ? ActionKind.SuffixOperator : ActionKind.PrefixOperator, op, 1, getSymbolPosition(symbol, op.length))
    }
  }

  #pushBlock(type, ctx) {
    this.analyzer.pushBlock(type, getBlockPositionPair(ctx), ctx)
  }

  enterProgram(ctx) {
    this.#pushBlock(SemanticContextType.ProgramScope, ctx)
  }

  exitProgram(ctx) {
    this.analyzer.popBlock(ctx)
  }

  enterMachineDecl(ctx) {
    this.analyzer.handleAnalyzeOptions()
    const token = ctx.children.find(child => {
      const kwd = child?.symbol?.text
      return kwd === "machine" || kwd === "graph"
    })
    let symbolPos = null
    if (token) {
      const symbol = token.symbol
      symbolPos = getSymbolPosition(symbol)
    }
    // const pos = getBlockPositionPair(ctx)
    // PUSH BLOCK BEFORE EMIT LANG COMPONENT
    // this.analyzer.pushBlock(SemanticContextType.MachineDecl, pos)
    this.#pushBlock(SemanticContextType.MachineDecl, ctx)
    this.analyzer.handleMachineDeclEnter(token.symbol.text, symbolPos)
  }

  exitMachineDecl(ctx) {
    this.analyzer.handleMachineDeclExit()
    this.analyzer.popBlock(ctx)
  }

  enterMachineScope(ctx) {
    // console.log("enter machine scope")
    this.#pushBlock(SemanticContextType.MachineScope, ctx)
  }

  exitMachineScope(ctx) {
    // console.log("exit machine scope")

    this.analyzer.popBlock(ctx)

  }

  enterStateExpr(ctx) {
    this.#pushBlock(SemanticContextType.StateDecl, ctx)
  }

  exitStateExpr(ctx) {
    const attrs = []
    for (let child of ctx.children) {
      const s = child?.symbol?.text
      if (s === "node" || s === "state") {
        attrs.push(s)
      } else {
        const t = child.start?.text
        if (["start", "abstract", "normal", "final"].includes(t)) {
          attrs.push(t)
        }
      }
    }

    this.analyzer.handleStateDecl(attrs)
    this.analyzer.popBlock(ctx)
  }

  enterStateScope(ctx) {
    // this.analyzer.peekBlock().metadata.hasChildren = ctx.children.length > 2
    this.analyzer.handleStateScope(ctx.children.length > 2, ctx)
    this.#pushBlock(SemanticContextType.StateScope, ctx)
  }

  exitStateScope(ctx) {
    this.analyzer.popBlock(ctx)
  }

  enterStatement(ctx) {
    this.#pushBlock(SemanticContextType.Statement, ctx)
    this.analyzer.handleStatementEnter(getBlockPositionPair(ctx))
  }

  exitStatement(ctx) {
    this.analyzer.handleStatementExit(getBlockPositionPair(ctx))
    this.analyzer.popBlock(ctx)
  }

  enterTrans(ctx) {
    this.#pushBlock(SemanticContextType.TransDecl, ctx)
    const keyword = ctx.children[0]?.symbol?.text ?? "trans"
    this.analyzer.handleTransKeyword(keyword)
  }

  exitTrans(ctx) {
    this.analyzer.handleTrans()
    this.analyzer.popBlock(ctx)
  }

  enterTransScope(ctx) {
    this.#pushBlock(SemanticContextType.TransScope, ctx)
    const ident = getIdentifiersInList(ctx)[0]
    this.analyzer.handleTransScope(ident)
  }

  exitTransScope(ctx) {
    // check
    this.analyzer.popBlock(ctx)
  }

  enterTransDef(ctx) {
    const symbol = ctx.children[0]?.symbol?.text
    // from transDef we could know that
    // A transDef either starts with a symbol: * | +
    // or it starts with an identifier and has a possible list of that
    if (symbol) {
      this.analyzer.handleTransOp(symbol)
    } else {
      const idents = getPositionedIdentifiersInList(ctx)
      this.analyzer.handleTransToStates(idents)
    }
    // const idents = []
    // for (let child of ctx.children) {
    //   const symbol = child?.symbol?.text
    //   if (symbol === "+" || symbol === "*") {
    //     this.analyzer.handleTransOp(symbol)
    //     break
    //   } else if (child.constructor.name === "IdentifierContext") {
    //     idents.push(child.start.text)
    //   }
    // }
    //
    // this.analyzer.handleTransDef(idents)
  }

  enterTransOp(ctx) {
    const text = ctx.start.text
    this.analyzer.handleTransOp(text)
  }

  enterLabel(ctx) {
    this.analyzer.handleTransLabel(ctx.start.text, existsSymbol(ctx.parentCtx, "label"))
  }

  enterTransExclExpr(ctx) {
    const idents = getIdentifiersInList(ctx)// .map(it => it.start.text)
    this.analyzer.handleTransExclusion(idents)
  }

  enterWhereExpr(ctx) {
    this.#pushBlock(SemanticContextType.WhereExpr, ctx)
    const expr = getExpression(ctx)
    this.analyzer.handleWhereExpr(expr, getBlockPositionPair(ctx))
  }

  exitWhereExpr(ctx) {
    this.analyzer.deduceToType(IdentifierType.Bool)
    this.analyzer.popBlock(ctx)
  }

  enterInvariantExpression(ctx) {
    this.#pushBlock(SemanticContextType.InvariantDecl, ctx)
    // this.analyzer.pushMark(SemanticContextMark.Invariant)
  }

  exitInvariantExpression(ctx) {
    this.analyzer.popBlock(ctx)
  }

  enterInExpr(ctx) {
    // invariant | assert
    this.#pushBlock(SemanticContextType.InExpr, ctx)
    const idents = getPositionedIdentifiersInList(ctx)
    // const expr = ctx.parentCtx.start.getInputStream().getText(ctx.parentCtx.start.start, ctx.parentCtx.stop.stop)
    // this.analyzer.handleInExpr(idents?.map(it => it.start.text), expr, pos(ctx.parentCtx.start.line, ctx.parentCtx.start.column))
    this.analyzer.handleInExpr(idents)
  }

  exitInExpr(ctx) {
    this.analyzer.popBlock(ctx)
  }

  enterPathAssignStatement(ctx) {
    this.#pushBlock(SemanticContextType.PathAssignStatement, ctx)
  }

  exitPathAssignStatement(ctx) {
    this.analyzer.popBlock(ctx)
  }

  enterInvariantScope(ctx) {
    this.#pushBlock(SemanticContextType.InvariantScope, ctx)
  }

  exitInvariantScope(ctx) {
    this.analyzer.popBlock(ctx)
  }

  enterGoal(ctx) {
    // const expr = ctx.start.getInputStream().getText(ctx.start.start, ctx.stop.stop)
    this.#pushBlock(SemanticContextType.GoalScope, ctx)
  }

  exitGoal(ctx) {
    this.analyzer.handleGoal()
    this.analyzer.popBlock(ctx)
  }

  exitForExpr(ctx) {
    // no check needed
    this.analyzer.resetTypeStack()
  }

  enterStopExpr(ctx) {
    this.#pushBlock(SemanticContextType.Stop, ctx)

    const idents = getPositionedIdentifiersInList(ctx)
    // const [line, column] = [ctx.parentCtx.start.start, ctx.parentCtx.stop.stop]
    // const expr = ctx.parentCtx.start.getInputStream().getText(line, column)
    this.analyzer.handleStopExpr(idents)
  }

  exitStopExpr(ctx) {
    // check
    this.analyzer.popBlock(ctx)
  }

  enterWithExpr(ctx) {
    this.#pushBlock(SemanticContextType.With, ctx)
    const idents = getPositionedIdentifiersInList(ctx)
    this.analyzer.handleWithExpr(idents)
  }

  exitWithExpr(ctx) {
    // check
    this.analyzer.popBlock(ctx)
  }

  enterLetExpr(ctx) {
    this.#pushBlock(SemanticContextType.LetDecl, ctx)
  }

  exitLetExpr(ctx) {
    // check
    this.analyzer.handleLetExpr()
    this.analyzer.popBlock(ctx)
    // this.analyzer.deduceToType(IdentifierType.Bool, getBlockPositionPair(ctx), null, true)

  }

  enterCheckExpr(ctx) {
    this.#pushBlock(SemanticContextType.GoalFinal, ctx)
    this.analyzer.handleCheckExpr(getExpression(ctx))
  }

  enterForExpr(ctx) {
    const paths = ctx.children
      .filter(c => c instanceof CycloneParser.IntLiteralContext)
      .map(it => ({text: it.start.text, position: getBlockPositionPair(it)}))
    this.analyzer.handleCheckForExpr(paths)
  }

  // enterCheckMainExpr(ctx) {
  //   this.analyzer.handleCheckMainExpr(getExpression(ctx))
  // }

  exitCheckExpr(ctx) {
    this.analyzer.popBlock(ctx)
  }

  enterStateIncExpr(ctx) {
    this.#pushBlock(SemanticContextType.StateInc, ctx)
  }

  exitStateIncExpr(ctx) {
    // this.#deduceToType(IdentifierType.State, getBlockPositionPair(ctx), IdentifierType.Bool)
    // this.analyzer.resetTypeStack() // for int literals
    this.analyzer.pushTypeStack(IdentifierType.Bool)
    this.analyzer.popBlock(ctx)
  }

  enterPathPrimaryExpr(ctx) {
    this.#pushBlock(SemanticContextType.PathPrimary, ctx)
  }

  exitPathPrimaryExpr(ctx) {
    this.analyzer.popBlock(ctx)
    this.analyzer.pushTypeStack(IdentifierType.Bool)
  }

  enterRecord(ctx) {
    this.#pushBlock(SemanticContextType.RecordDecl, ctx)
  }

  exitRecord(ctx) {
    this.analyzer.popBlock(ctx)
  }

  enterRecordScope(ctx) {
    this.#pushBlock(SemanticContextType.RecordScope, ctx)
  }

  exitRecordScope(ctx) {
    this.analyzer.popBlock(ctx)
  }

  enterGlobalConstantGroup(ctx) {
    this.#pushBlock(SemanticContextType.GlobalConstantGroup, ctx)
  }

  exitGlobalConstantGroup(ctx) {
    this.analyzer.popBlock(ctx)
  }

  enterLocalVariableGroup(ctx) {
    this.#pushBlock(SemanticContextType.LocalVariableGroup, ctx)
  }

  exitLocalVariableGroup(ctx) {
    // this.analyzer.handleLocalVariableDeclGroup()
    this.analyzer.popBlock(ctx)
  }

  enterGlobalVariableGroup(ctx) {
    this.#pushBlock(SemanticContextType.GlobalVariableGroup, ctx)
  }

  exitGlobalVariableGroup(ctx) {
    this.analyzer.popBlock(ctx)
  }

  enterRecordVariableDecl(ctx) {
    this.#pushBlock(SemanticContextType.RecordVariableDeclGroup, ctx)
  }

  exitRecordVariableDecl(ctx) {
    this.analyzer.popBlock(ctx)
  }

  enterGlobalConstantDecl(ctx) {
    this.#pushBlock(SemanticContextType.VariableDecl, ctx)
    this.analyzer.registerTypeForVariableDecl()
  }

  exitGlobalConstantDecl(ctx) {
    // this.analyzer.deduceVariableDecl()
    this.analyzer.popBlock(ctx)
  }

  enterVariableDeclarator(ctx) {
    this.#pushBlock(SemanticContextType.VariableDecl, ctx)
    this.analyzer.registerTypeForVariableDecl()
  }

  exitVariableDeclarator(ctx) {
    // this.analyzer.deduceVariableDecl()
    this.analyzer.popBlock(ctx)
  }

  enterEnumType(ctx) {
    this.analyzer.handleTypeToken("enum", getBlockPositionPair(ctx))
  }

  enterEnumDecl(ctx) {
    this.#pushBlock(SemanticContextType.EnumDecl, ctx)
  }

  exitEnumDecl(ctx) {
    this.analyzer.popBlock(ctx)
  }

  enterExpression(ctx) {
    this.analyzer.handleExpression()
    // this.analyzer.pushBlock(SemanticContextType.Expression, getBlockPositionPair(ctx))
  }

  exitExpression(ctx) {
    this.#handleBinaryOp(ctx)
  }

  enterAssertExpr(ctx) {
    this.#pushBlock(SemanticContextType.AssertExpr, ctx)
  }

  exitAssertExpr(ctx) {
    this.analyzer.deduceToType(IdentifierType.Bool)
    this.analyzer.popBlock(ctx)
  }

  enterFunctionDeclaration(ctx) {
    this.#pushBlock(SemanticContextType.FnDecl, ctx)
  }

  exitFunctionDeclaration(ctx) {
    this.analyzer.popBlock(ctx)
  }

  enterFunctionBodyScope(ctx) {
    this.#pushBlock(SemanticContextType.FnBodyScope, ctx)
  }

  exitFunctionBodyScope(ctx) {
    this.analyzer.popBlock(ctx)
  }

  // enterReturnExpr(ctx) {
  //
  // }

  exitReturnExpr(ctx) {
    this.analyzer.handleReturn(getBlockPositionPair(ctx))
  }

  enterFunctionParamsDecl(ctx) {
    this.#pushBlock(SemanticContextType.FnParamsDecl, ctx)
  }

  exitFunctionParamsDecl(ctx) {
    this.analyzer.popBlock(ctx)
  }

  enterFunCall(ctx) {
    this.#pushBlock(SemanticContextType.FnCall, ctx)
  }

  exitFunCall(ctx) {
    this.analyzer.handleFunCall(ActionKind.Function)
    this.analyzer.popBlock(ctx)
    // this.analyzer.deduceActionCall(ActionKind.Function, block.metadata.fnName, block.metadata.gotParams, getBlockPositionPair(ctx))
  }

  enterAnnotationExpr(ctx) {
    this.#pushBlock(SemanticContextType.AnnotationDecl, ctx)
  }

  exitAnnotationExpr(ctx) {
    this.analyzer.popBlock(ctx)
  }

  enterEnumLiteral(ctx) {
    const text = ctx.start.text
    const identText = text.slice(1)
    this.analyzer.referenceEnum(identText, getBlockPositionPair(ctx))

    // this.analyzer.pushTypeStack(IdentifierType.Enum)
  }

  enterIdentifier(ctx) {
    const text = ctx.start.text
    this.analyzer.handleIdentifier(text, getBlockPositionPair(ctx), ctx)
  }

  enterDotIdentifierExpr(ctx) {
    if (firstSymbol(ctx)) {
      this.#pushBlock(SemanticContextType.DotExpr, ctx)
    }
  }

  exitDotIdentifierExpr(ctx) {
    if (firstSymbol(ctx)) {
      this.analyzer.popBlock(ctx)
    }
  }

  enterPrimitiveType(ctx) {
    const text = ctx.start.text
    this.analyzer.handleTypeToken(text, getBlockPositionPair(ctx))
  }

  enterBoolLiteral(ctx) {
    this.analyzer.pushTypeStack(IdentifierType.Bool)
  }

  enterCharLiteral(ctx) {
    this.analyzer.pushTypeStack(IdentifierType.Char)
  }

  enterIntLiteral(ctx) {
    // const blockType = this.analyzer.peekBlock().type
    //
    // if (blockType !== SemanticContextType.StateInc && blockType !== SemanticContextType.PathPrimary) {
    //   this.analyzer.pushTypeStack(IdentifierType.Int)
    // }

    this.analyzer.handleIntLiteral()
  }

  enterRealLiteral(ctx) {
    this.analyzer.pushTypeStack(IdentifierType.Real)
  }

  enterStringLiteral(ctx) {
    this.analyzer.pushTypeStack(IdentifierType.String)
  }

  exitPathCondAssignExpr(ctx) {
    // this.analyzer.deduceToType(IdentifierType.Bool, getBlockPositionPair(ctx))
    this.analyzer.handlePathCondAssign(getExpression(ctx))
  }

  exitPathExpr(ctx) {
    // only used in VIA
    this.analyzer.deduceToType(IdentifierType.Bool, getBlockPositionPair(ctx))
  }

  exitAdditiveExpression(ctx) {
    this.#handleBinaryOp(ctx)
  }

  exitMultiplicativeExpression(ctx) {
    this.#handleBinaryOp(ctx)
  }

  exitPowExpression(ctx) {
    this.#handleBinaryOp(ctx)
  }

  exitRelationalExpression(ctx) {
    this.#handleBinaryOp(ctx)
  }

  exitEqualityExpression(ctx) {
    this.#handleBinaryOp(ctx)
  }

  exitConditionalXorExpression(ctx) {
    this.#handleBinaryOp(ctx)
  }

  exitConditionalAndExpression(ctx) {
    this.#handleBinaryOp(ctx)
  }

  exitConditionalOrExpression(ctx) {
    this.#handleBinaryOp(ctx)
  }

  exitConditionalImpliesExpression(ctx) {
    this.#handleBinaryOp(ctx)
  }

  exitUnaryExpression(ctx) {
    this.#handleUnaryOp(ctx)
  }

  exitUnaryExpressionNotPlusMinus(ctx) {
    this.#handleUnaryOp(ctx)
  }

  exitUnaryPathCondition(ctx) {
    this.#handleUnaryOp(ctx)
  }

  exitXorPathCondition(ctx) {
    this.#handleBinaryOp(ctx)
  }

  exitAndPathCondition(ctx) {
    this.#handleBinaryOp(ctx)
  }

  exitOrPathCondition(ctx) {
    this.#handleBinaryOp(ctx)
  }

  exitPathCondition(ctx) {
    this.analyzer.deduceToType(IdentifierType.Bool, getBlockPositionPair(ctx), IdentifierType.Bool)
  }

  exitOneExpr(ctx) {
    this.analyzer.deduceAllToType(IdentifierType.Bool, getBlockPositionPair(ctx), IdentifierType.Bool, 2)
  }

  enterInitialExpr(ctx) {
    // this.analyzer.checkNamedExpr(
    //   "initial",
    //   getBlockPositionPair(ctx),
    //   `'initial' expression can only be used in global / state / node scope, and not in constant definition`,
    //   [SemanticContextType.StateScope, SemanticContextType.GoalScope]
    // )

    this.analyzer.handleInitialExpr(getBlockPositionPair(ctx))
  }

  enterFreshExpr(ctx) {
    this.analyzer.handleFreshExpr(getBlockPositionPair(ctx))
  }

  exitFreshExpr(ctx) {
    this.analyzer.deduceToMultiTypes([
      IdentifierType.Bool,
      IdentifierType.Real,
      IdentifierType.Int,
      IdentifierType.Enum,
      IdentifierType.String,
      IdentifierType.Char
    ], getBlockPositionPair(ctx), IdentifierType.Hole)
  }

  enterCompOptions(ctx) {
    this.#pushBlock(SemanticContextType.CompilerOption, ctx)

    const optName = ctx.children[1]?.children[0]?.symbol?.text
    if (!optName) {
      console.log("warn: unable to get option name")
      return
    }

    const lit = ctx.children[3]?.children[0]?.children[0]?.symbol?.text
    if (!lit) {
      console.log("warn: unable to get option value")
      return
    }

    // console.log("option", optName, lit)

    this.analyzer.checkOption(optName, lit)
  }

  exitCompOptions(ctx) {
    this.analyzer.resetTypeStack()
    this.analyzer.popBlock(ctx)
  }

  enterVariableInitializer(ctx) {
    this.#pushBlock(SemanticContextType.VariableInit, ctx)
  }

  exitVariableInitializer(ctx) {
    this.analyzer.deduceVariableInit()
    this.analyzer.popBlock(ctx)
  }
}