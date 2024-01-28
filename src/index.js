import {default as Utils} from "./utils/index.js"
import {default as Lib} from "./lib/index.js"
import {default as Language} from "./language/index.js"
import {default as Generated} from "./generated/index.js"
import {default as BlockBuilder} from "./blockBuilder/index.js"
import {default as Analyzer} from "./analyzer/index.js"

export const utils = Utils
export const lib = Lib
export const language = Language
export const generated = Generated
export const blockBuilder = BlockBuilder
export const analyzer = Analyzer

export default {
  utils, lib, language, generated, blockBuilder, analyzer
}