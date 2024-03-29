import {listenerWalk, parseCycloneSyntax} from "../src/utils/antlr.js";
import {analyzer} from "../src/index.js";

const rounds = 100
const tries = 10

const code = `
/*
 * Route planning for an agent.
 * An agent must pick up a package and deliver to the destination by avoiding obstacles on its way.
 *
 */
graph PlanningExample{

    abstract start node S0{}
    abstract node S1{}
    abstract node S2{}
    abstract node S3{}
    abstract node S4{}
    abstract node S5{}
    abstract node S6{}
    abstract node S7{} //obstacle
    abstract node S8{}
    abstract node S9{}
    abstract node S10{}
    abstract node S11{} //obstacle
    abstract node S12{} //obstacle
    abstract node S13{} //package
    abstract node S14{}
    abstract node S15{}
    abstract node S16{}
    abstract node S17{}
    abstract node S18{} //obstacle
    abstract node S19{}
    abstract node S20{}
    abstract node S21{}
    abstract node S22{}
    abstract node S23{} //obstacle
    abstract node S24{} //destination

    edge { S0 -> S1 }
    edge { S0 -> S5 }
    edge { S1 -> S2 }
    edge { S1 -> S6 }
    edge { S2 -> S3 }
    edge { S2 -> S7 }
    edge { S3 -> S4 }
    edge { S3 -> S8 }
    edge { S4 -> S9 }

    edge { S5 -> S6 }
    edge { S5 -> S10 }
    edge { S6 -> S7 }
    edge { S6 -> S11 }
    edge { S7 -> S8 }
    edge { S7 -> S12 }
    edge { S8 -> S9 }
    edge { S8 -> S13 }
    edge { S9 -> S14 }

    edge { S10 -> S11 }
    edge { S10 -> S15 }
    edge { S11 -> S12 }
    edge { S11 -> S16 }
    edge { S12 -> S13 }
    edge { S12 -> S17 }
    edge { S13 -> S14 }
    edge { S13 -> S18 }
    edge { S14 -> S19 }

    edge { S15 -> S16 }
    edge { S15 -> S20 }
    edge { S16 -> S17 }
    edge { S16 -> S21 }
    edge { S17 -> S18 }
    edge { S17 -> S22 }
    edge { S18 -> S19 }
    edge { S18 -> S23 }
    edge { S19 -> S24 }

    edge { S20 -> S21 }
    edge { S21 -> S22 }
    edge { S22 -> S23 }
    edge { S23 -> S24 }


    goal{
        /*
         * Find a path for an agent to move from S0 to S24.
         * Condition: avoid obstacles and reach destination.
         */
        check for 8 condition (
                (!S7 && !S11 && !S12),
                (!S18 && !S23),
                (_->S13->_)
                )
        reach (S24)
    }



}
`

const parseTimes = []

for (let i = 0; i < tries; i++) {
  const t = Date.now()

  for (let j = 0; j < rounds; j++) {
    parseCycloneSyntax({input: code})
  }

  parseTimes.push(Date.now() - t)
}

const {tree} = parseCycloneSyntax({input: code})
const semanticTimes = []

for (let i = 0; i < tries; i++) {
  const t = Date.now()

  for (let j = 0; j < rounds; j++) {
    listenerWalk(new analyzer.SemanticParserListener(new analyzer.SemanticAnalyzer()), tree)
  }

  semanticTimes.push(Date.now() - t)
}

const avg = xs => xs.reduce((acc, x) => acc + x, 0) / xs.length

console.log("+ syntax analysis", "avg", avg(parseTimes), parseTimes)
console.log("+ semantic analysis", "avg", avg(semanticTimes), semanticTimes)