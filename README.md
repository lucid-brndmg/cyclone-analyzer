# Cyclone Analyzer

Cyclone analyzer is a semantic analyzer & type checker of the [Cyclone Specification Language](https://classicwuhao.github.io/cyclone_tutorial/tutorial-content.html). 

The analyzer covers most of Cyclone's language features. This package also contains the language specification, an IR builder, some utility functions, a parser and a lexer based on ANTLR4 for Cyclone. This package is a dependency of the [cyclone online editor](https://github.com/lucid-brndmg/cyclone-online-editor) project.

*This project is a part of my final year project (CS440[A]) at Maynooth University.*

## TODO

- Use Flow to do type checking for some modules. (This project has no intention to rewrite in typescript for now)
- This document is unfinished and will be updated in the future.

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