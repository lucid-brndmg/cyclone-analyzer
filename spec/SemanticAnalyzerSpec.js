import fs from "node:fs"
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {listenerWalk, parseCycloneSyntax} from "../src/utils/antlr.js";
import SemanticParserListener from "../src/analyzer/semanticParserListener.js";
import SemanticAnalyzer from "../src/analyzer/semanticAnalyzer.js";
import YAML from "yaml"

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dirResource = path.join(__dirname, "./resource")
const dirCycloneSrc = path.join(dirResource, "cyclone")

const readDirFileContent = (p) => fs
  .readdirSync(p)
  .map(file => fs.readFileSync(path.join(p, file), "utf8"))

describe('SemanticAnalyzer', () => {
  it('should report syntax error', () => {
    const pathSyntaxError = path.join(dirCycloneSrc, "syntacticallyError")
    const codes = readDirFileContent(pathSyntaxError)
    for (let src of codes) {
      const {syntaxErrorsCount} = parseCycloneSyntax({input: src, entry: "program"})
      expect(syntaxErrorsCount).toBeGreaterThan(0)
    }
  });

  it("should be semantically correct", () => {
    const pathCorrectSrc = path.join(dirCycloneSrc, "semanticallyCorrect")
    const codes = readDirFileContent(pathCorrectSrc)
    for (let src of codes) {
      const {syntaxErrorsCount, tree} = parseCycloneSyntax({input: src, entry: "program"})
      expect(syntaxErrorsCount).toEqual(0)


      const errors = []
      const analyzer = new SemanticAnalyzer()
      analyzer.on("errors", es => {
        console.error("ERRORS INSIDE CORRECT CODE", es)
        errors.push(...es)
      })

      const listener = new SemanticParserListener(analyzer)
      listenerWalk(listener, tree)
      expect(errors.length).toEqual(0)
    }
  })
});