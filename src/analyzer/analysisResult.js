export default class AnalysisResult {
  parseResult
  lexerErrors = []
  parserErrors = []
  semanticErrors = []
  input = ""

  constructor(input) {
    this.input = input
  }

  hasSyntaxError() {
    return !this.parseResult || this.parseResult.syntaxErrorsCount > 0
  }

  hasSemanticError() {
    return this.semanticErrors.length > 0
  }

  hasError() {
    return this.hasSyntaxError()
      || this.hasSemanticError()
  }
}