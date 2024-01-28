import CycloneLexer from "./antlr/CycloneLexer.js";
import CycloneParser from "./antlr/CycloneParser.js";
import CycloneParserListener from "./antlr/CycloneParserListener.js";

export default {
  antlr: {
    CycloneLexer,
    CycloneParser,
    CycloneParserListener
  }
}