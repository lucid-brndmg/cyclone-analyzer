import fs from "node:fs"
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {listenerWalk, parseCycloneSyntax} from "../src/utils/antlr.js";
import SemanticParserListener from "../src/analyzer/semanticParserListener.js";
import SemanticAnalyzer from "../src/analyzer/semanticAnalyzer.js";
import YAML from "yaml"
import {SemanticErrorType} from "../src/language/definitions.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dirResource = path.join(__dirname, "./resource")
const dirCycloneSrc = path.join(dirResource, "cyclone")

const readDirFileContent = (p, ext = []) => {
  const dir = fs.readdirSync(p)
  const files = ext.length ? dir.filter(f => ext.some(e => f.endsWith(e))) : dir
  return files.map(file => fs.readFileSync(path.join(p, file), "utf8"))
}

const readDirFileContentWithFilename = (p, ext = []) => {
  const dir = fs
    .readdirSync(p)
  const files = ext.length ? dir.filter(f => ext.some(e => f.endsWith(e))) : dir
  return files.map(file => ({filename: file, content: fs.readFileSync(path.join(p, file), "utf8")}))
}

const semanticErrorLocator = name => SemanticErrorType[name]

describe('SemanticAnalyzer', () => {
  it('should report syntax error', () => {
    const pathSyntaxError = path.join(dirCycloneSrc, "syntacticallyError")
    const codes = readDirFileContent(pathSyntaxError, [".cyclone"])
    let i = 0
    for (let src of codes) {
      const {syntaxErrorsCount} = parseCycloneSyntax({input: src, entry: "program"})
      expect(syntaxErrorsCount).toBeGreaterThan(0)
      i++
    }

    console.log("syntactically error files passed", i)
  });

  it("should be semantically correct", () => {
    const pathCorrectSrc = path.join(dirCycloneSrc, "semanticallyCorrect")
    const codes = readDirFileContentWithFilename(pathCorrectSrc, [".cyclone"])
    let i = 0
    for (let {content, filename} of codes) {
      console.log("checking ", filename)
      const {syntaxErrorsCount, tree} = parseCycloneSyntax({input: content, entry: "program"})
      expect(syntaxErrorsCount).toEqual(0)

      const errors = []
      const analyzer = new SemanticAnalyzer()
      analyzer.on("errors", (ctx, es) => {
        console.error("ERRORS INSIDE CORRECT CODE", es)
        const filtered = es.filter(({type}) => ![SemanticErrorType.IdentifierNeverUsed, SemanticErrorType.NodeUnconnected].includes(type))
        if (filtered.length) {
          errors.push(...filtered)
        }
      })

      const listener = new SemanticParserListener(analyzer)
      listenerWalk(listener, tree)
      expect(errors.length).toEqual(0)
      i++
    }

    console.log("semantically correct files passed", i)
  })

  it('should be semantically incorrect', () => {
    const pathIncorrectSrc = path.join(dirCycloneSrc, "semanticallyError")
    const specs = readDirFileContentWithFilename(pathIncorrectSrc, [".yaml", ".yml"])
    let totalCases = 0, totalCounter = 0
    for (let {content, filename} of specs) {
      console.log("entering file", filename)

      const {
        expectedErrors, notExpectedErrors,
        cases, casesCounter
      } = YAML.parse(content)

      if (
        !cases.length
        || (!expectedErrors?.length && !notExpectedErrors?.length)
        || (expectedErrors && expectedErrors.some(name => SemanticErrorType[name] == null))
        || (notExpectedErrors && notExpectedErrors.some(name => SemanticErrorType[name] == null))
      ) {
        fail("invalid spec file")
      }

      for (let i = 0; i < cases.length; i ++) {
        const code = cases[i]
        const {syntaxErrorsCount, tree} = parseCycloneSyntax({input: code, entry: "program"})
        if (syntaxErrorsCount) {
          console.log("syntax error in case", i - 1, code)
        }
        expect(syntaxErrorsCount).toEqual(0)

        const errors = []
        const analyzer = new SemanticAnalyzer()
        analyzer.on("errors", (ctx, es) => errors.push(...es))

        const listener = new SemanticParserListener(analyzer)
        listenerWalk(listener, tree)

        if (expectedErrors) {
          const containsErrors = errors.some(({type}) => expectedErrors.map(semanticErrorLocator).includes(type))
          if (!containsErrors) {
            console.log("case failed", {
              expected: expectedErrors,
              index: i,
              filename,
              actual: JSON.stringify(errors, null, 2),
              code
            })
          }
          expect(containsErrors).toBe(true)
        }

        if (notExpectedErrors) {
          const notContains = errors.every(({type}) => !notExpectedErrors.map(semanticErrorLocator).includes(type))
          if (!notContains) {
            console.log("case failed", {
              notExpected: notExpectedErrors,
              index: i,
              filename,
              actual: JSON.stringify(errors, null, 2),
              code
            })
          }
          expect(notContains).toBe(true)
        }

        totalCases ++
      }

      if (casesCounter) {
        for (let i = 0; i < casesCounter.length; i ++) {
          const code = casesCounter[i]
          const {syntaxErrorsCount, tree} = parseCycloneSyntax({input: code, entry: "program"})
          if (syntaxErrorsCount) {
            console.log("syntax error in counter case", i - 1)
          }
          expect(syntaxErrorsCount).toEqual(0)

          const errors = []
          const analyzer = new SemanticAnalyzer()
          analyzer.on("errors", (ctx, es) => errors.push(...es))

          const listener = new SemanticParserListener(analyzer)
          listenerWalk(listener, tree)

          const contains = errors.some(({type}) => expectedErrors.map(semanticErrorLocator).includes(type))

          if (contains) {
            console.log("counter case failed", {
              notExpected: expectedErrors,
              index: i,
              filename,
              actual: JSON.stringify(errors, null, 2),
              code
            })
          }

          expect(contains).toBe(false)
          totalCounter ++
        }
      }

      console.log("passed", filename)
    }

    console.log("semantically incorrect files passed", {
      totalCases,
      totalCounter
    })
  });
});