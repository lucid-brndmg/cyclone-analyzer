import SemanticAnalyzerContext from "./semanticAnalyzerContext.js";
import SemanticAnalyzer from "./semanticAnalyzer.js";
import SemanticParserListener from "./semanticParserListener.js";
import {ErrorListener, listenerWalk, parseCycloneSyntax} from "../utils/antlr.js";
import AnalysisResult from "./analysisResult.js";

class BuiltinParsingErrorListener extends ErrorListener {
  destination
  constructor(destination) {
    super();
    this.destination = destination
  }

  syntaxError(recognizer, offendingSymbol, line, column, msg, e) {
    this.destination.push({recognizer, offendingSymbol, line, column, msg, e})
  }
}

const analyzeCycloneSpec = (specSrc, options = null) => {
  const opts = {
    analyzerExtensions: [],
    analyzerContext: null,
    ...options
  }
  const result = new AnalysisResult(specSrc)
  const parserErrorListener = new BuiltinParsingErrorListener(result.parserErrors)
  const lexerErrorListener = new BuiltinParsingErrorListener(result.lexerErrors)
  const parseResult = parseCycloneSyntax({input: specSrc, lexerErrorListener, parserErrorListener})

  result.parseResult = parseResult
  const {tree, syntaxErrorsCount} = parseResult
  if (syntaxErrorsCount) {
    return result
  }

  const analyzer = new SemanticAnalyzer(opts.analyzerContext)
  analyzer.on("errors", (ctx, es) => result.semanticErrors.push(...es))

  const semanticListener = new SemanticParserListener()
  const extensions = [semanticListener, ...(opts.analyzerExtensions ?? [])]
  for (let ext of extensions) {
    ext.attach(analyzer)
  }

  listenerWalk(semanticListener, tree)

  return result
}

export default {
  SemanticAnalyzerContext,
  SemanticAnalyzer,
  SemanticParserListener,
  analyzeCycloneSpec
}