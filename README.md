# Cyclone Analyzer

Cyclone analyzer is a static analyzer for [Cyclone Specification Language](https://classicwuhao.github.io/cyclone_tutorial/tutorial-content.html). This library powers the [cyclone online editor](https://github.com/lucid-brndmg/cyclone-online-editor) project.

The analyzer covers most of Cyclone's language features. This package also contains the language specification, an IR builder, some utility functions, a parser and a lexer based on ANTLR4 for Cyclone. This analyzer currently checks for 40+ kinds of semantic errors in a Cyclone spec, and would be helpful as a linter for Cyclone code editors. 

**Limitations:** This analyzer performs a static analysis for each Cyclone specification. The semantic errors detected by this analyzer are not comprehensive: Certain errors can not be discovered by this analyzer. If this analyzer report no error on a certain specification, it doesn't mean the specification actually has no problem at all.

*This project is a part of my final year project (CS440[A]) at Maynooth University.*

## TODO

- Use Flow to do type checking for some modules. (This project has no intention to rewrite in typescript for now)
- This document is unfinished and will be updated in the future.

## Usage

Installation:

```shell
npm install cyclone-analyzer
```

Analyze a Cyclone specification:

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