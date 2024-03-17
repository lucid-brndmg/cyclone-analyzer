import {analyzer, utils} from "../src/index.js";
import {SemanticContextType} from "../src/language/definitions.js";
import {listenerWalk} from "../src/utils/antlr.js";
import {edgeLengths} from "../src/utils/edge.js";

const code = `
graph G { 
    node S1 {} 
    node S2 {}
    
    transition {S1 <-> +}

    goal {
        check for 1
    }
}
`

const parsed = utils.antlr.parseCycloneSyntax({input: code})
if (parsed.syntaxErrorsCount > 0) {
  console.log("syntax error")
  process.exit(0)
}
const sem = new analyzer.SemanticAnalyzer()
const listener = new analyzer.SemanticParserListener(sem)
const edgeMetadataList = []
let machine

sem.on("block:enter", ctx => {
  const block = ctx.peekBlock()
  if (block.type === SemanticContextType.TransDecl) {
    edgeMetadataList.push(block.metadata)
  } else if (block.type === SemanticContextType.MachineDecl && !machine) {
    machine = block
  }
})

sem.on("errors", (ctx, es) => console.log("! semantic errors", es))

listenerWalk(listener, parsed.tree)

const allStates = [...machine.metadata.stateSet]

console.log("+ total nodes:", allStates.length)
console.log("+ total edges:", edgeLengths(edgeMetadataList, allStates))