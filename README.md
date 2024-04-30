# Cyclone Analyzer

Cyclone analyzer is a static analyzer for [Cyclone Specification Language](https://classicwuhao.github.io/cyclone_tutorial/tutorial-content.html). This library powers the [cyclone online editor](https://github.com/lucid-brndmg/cyclone-online-editor) project.

The analyzer covers most of Cyclone's language features. This package also contains the language specification, an IR builder, some utility functions, a parser and a lexer based on ANTLR4 for Cyclone. This analyzer currently checks for 40+ kinds of semantic errors in a Cyclone spec, and would be helpful as a linter for Cyclone code editors. 

**Limitations:** This analyzer performs a static analysis for each Cyclone specification. The semantic errors detected by this analyzer are not comprehensive: Certain errors can not be discovered by this analyzer. If this analyzer report no error on a certain specification, it doesn't mean the specification actually has no problem at all.

*This project is a part of my final year project (CS440[A]) at Maynooth University.*

## TODO

- This document is unfinished and will be updated in the future.

## Usage

### Installation

Use npm or yarn to install:

```shell
npm install cyclone-analyzer
```

Import this library using `import` or `require`:

```javascript
// ESM
import cycloneAnalyzer from "cyclone-analyzer"

// CJS
const cycloneAnalyzer = require("cyclone-analyzer")
```

### Analyze a Cyclone Specification

Find errors in any Cyclone specification by simply using `analyzeCycloneSpec`. 

```javascript
import {analyzer} from "cyclone-analyzer"

const cycloneSpec = `
graph G {
  int i = 1;
  
  start normal node S0 {
    i ++;
  }
  
  final normal node S1 {
    i --;
  }
  
  edge {S0 -> S1}
  
  goal {
    assert i == 1 in (S1);
    check for 1
  }
}
`

const result = analyzer.analyzeCycloneSpec(cycloneSpec)

if (result.hasSyntaxError()) {
  console.log("This spec has syntax error:", result.parserErrors)
} else if (result.hasSemanticError()) {
  console.log("Semantic errors detected:", result.semanticErrors)
} else {
  console.log("This spec seems ok")
}
```

### Parsing

Use `utils.antlr.parseCycloneSyntax` to parse a Cyclone specification via ANTLR4:

```javascript
import cycloneAnalyzer from "cyclone-analyzer"
const {parseCycloneSyntax} = cycloneAnalyzer.utils.antlr

const spec = `
graph G {
  int i = 1 // syntax error: a semicolon is required here
}
`

const parsed = parseCycloneSyntax({input: spec})

if (parsed.syntaxErrorsCount > 0) {
  console.log("This spec has syntax error")
}
```

### Syntax Block Builder

There is an IR builder `blockBuilder.SyntaxBlockBuilder` for building a tree-structured context for a Cyclone spec after semantic analysis:

```javascript
import {analyzer, blockBuilder} from "cyclone-analyzer"

const cycloneSpec = `
graph G {
  start final node A {}
  edge {A -> A}
  goal { check for 1 }
}
`

const irBuilder = new blockBuilder.SyntaxBlockBuilder()
const analysisResult = analyzer.analyzeCycloneSpec(cycloneSpec, {
  analyzerExtensions: [irBuilder] // the builder is an extension of the analyzer
})

// the syntax block of the input Cyclone spec, as a tree
const program = irBuilder.getProgramBlock()

console.log(program)
```

### Analyzer Extensions

The semantic analyzer defined series of events and can be listened with `analyzer.on` method. In this way, extensions can be written by listening to analyzer events. Extensions can be objects or class instances that has an `attach` method:

```javascript
import {analyzer} from "cyclone-analyzer"

// defining an extension as class
class MyExtension {
  // the required attach method
  attach(analyzer) {
    // this.analyzer = analyzer
    analyzer.on("errors", (ctx, errors) => console.log("semantic errors discovered:", errors))
    analyzer.on("block:enter", (ctx, payload) => console.log("entering a semantic context block"))
    analyzer.on("block:exit", (ctx, payload) => console.log("exiting a semantic context block"))
    analyzer.on("identifier:register", (ctx, {text}) => console.log("registering identifier: ", text))
    analyzer.on("identifier:reference", (ctx, {references}) => console.log("referencing identifiers: ", references))
  }
}

const cycloneSpec = `
graph G {
  start final node A {}
  edge {A -> A}
  goal { check for 1 }
}
`

const ext = new MyExtension()
const analysisResult = analyzer.analyzeCycloneSpec(cycloneSpec, {
  analyzerExtensions: [ext] // attach the extension
})
```

## Modules

This package contains the following modules:

| Module         | Description                                                          | Status   |
|----------------|----------------------------------------------------------------------|----------|
| `analyzer`     | The semantic analyzer for Cyclone                                    | Stable   |
| `blockBuilder` | An IR builder based on the semantic analyzer                         | Unstable |
| `generated`    | The generated lexer and parser based on ANTLR4                       | Stable   |
| `language`     | The language's definitions in enums & specifications                 | Stable   |
| `library`      | Some libraries that has nothing to do with the language itself       | Stable   |
| `utils`        | Helper modules for analyzer and block builder to handle the language | Stable   |



### Analyzer
TODO

### Block Builder
TODO

### Generated Lexer & Parser
TODO

### Language Definitions & Specifications
TODO

### Library
TODO

### Utilities
TODO

## License

Published under the [BSD-2 license](https://www.tldrlegal.com/license/bsd-2-clause-license-freebsd)