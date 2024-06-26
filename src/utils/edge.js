/*
* The module that performs edge analysis
* used by the semantic analyzer
* */



// is the edge anonymous
export const isAnonymousEdge = ({operators, toStates}) =>
  operators.has("<->")
  || operators.has("+")
  || operators.has("*")
  || toStates.length > 1

// is the edge a closure edge: +, *
export const isClosureEdge = operators => operators.has("*") || operators.has("+")

// remove duplicated edge relations detected
export const removeEdgeDuplication = edges => [...new Set(edges.map(({source, target}) => `${source}:${target}`))].map(it => {
  const [source, target] = it.split(":")
  return {source, target}
})

// the index of edge that helps checking edge duplications
export const edgeIndex = (fromState, operators, targetStatesSet, excludedStatesSet) => `${fromState ?? ""}|${[...targetStatesSet].sort().join(",")}|${[...operators].sort().join(",")}|${[...excludedStatesSet].sort().join(",")}`

// iterate edge relations
// function f would iterate through edge's relations
export const withEdgeStates = ({operators, toStates, fromState, excludedStates}, allStates, f) => {
  const isBi = operators.has("<->")
  const isPlus = operators.has("+")
  if (operators.has("*") || isPlus) {
    const exclSet = new Set(excludedStates)
    if (isPlus) {
      exclSet.add(fromState)
    }
    const nonExcl = allStates.filter(state => !exclSet.has(state))
    for (const s of nonExcl) {
      f(fromState, s)
      if (isBi) {
        f(s, fromState)
      }
    }
  } else {
    for (const s of toStates) {
      f(fromState, s)
      if (isBi) {
        f(s, fromState)
      }
    }
  }
}

// get every target node of edge
export const edgeTargets = ({operators, toStates, fromState, excludedStates}, allStates) => {
  const targets = new Set(toStates)
  withEdgeStates({operators, toStates, fromState, excludedStates}, allStates, (_, to) => targets.add(to))

  return targets
}

export const edgeTargetsFromExpanded = relations => {
  const targets = new Set()
  for (const {target} of relations) {
    targets.add(target)
  }

  return targets
}

// get the node relations of anonymous edge
export const expandAnonymousEdge = ({operators, toStates, fromState, excludedStates}, allStates) => {
  if (!isAnonymousEdge({operators, toStates})) {
    return []
  }

  const edges = []
  withEdgeStates({operators, toStates, fromState, excludedStates}, allStates, (source, target) => edges.push(({source, target})))

  return removeEdgeDuplication(edges)
}

// the length of the nodes an edge targeted
export const edgeLengths = (edgeMetadataList, allStates) => {
  const edges = []
  let total = 0
  for (const edge of edgeMetadataList) {
    if (isAnonymousEdge(edge)) {
      edges.push(...expandAnonymousEdge(edge, allStates))
    } else {
      total += 1
    }
  }

  return removeEdgeDuplication(edges).length + total
}

export const expandEdge = ({operators, toStates, fromState, excludedStates}, allStates) => {
  if (isAnonymousEdge({operators, toStates})) {
    return expandAnonymousEdge({operators, toStates, fromState, excludedStates}, allStates)
  }
  const target = toStates[0]
  return [{source: fromState, target}]
}

const visit = (relationTable, source, terminals, p) => {
  p.count ++
  const isTerminal = terminals.has(source)
  if (isTerminal) {
    p.term = true
  }
  const rel = relationTable.get(source)
  if (!rel) {
    return
  }
  const {checked, targets} = rel
  if (checked) {
    // acc.forEach(s => s.isCyclic = true)
    p.isCyclic = true
    return
  }
  rel.checked = true
  for (const node of targets) {
    visit(relationTable, node, terminals, p)
  }
}

const visitStart = (relationTable, source, terminals) => {
  const rel = relationTable.get(source)
  if (!rel) {
    return 0
  }
  rel.checked = true
  const {targets} = rel
  const ls = []
  for (const child of targets) {
    const s = {isCyclic: false, count: 0, term: false}
    visit(relationTable, child, terminals, s)
    if (s.isCyclic) {
      return Infinity
    }
    if (s.term) {
      ls.push(s.count)
    }
  }
  return Math.max(0, ...ls)
}

export const possibleMaxPathLength = (startNodeId, validNodeIdsSet, edges, terminalNodeIdsSet) => {
  // filter out the edge relations where contains undefined nodes
  const validEdges = edges.filter(({source, target}) => validNodeIdsSet.has(source) && validNodeIdsSet.has(target))

  if (!validEdges.length) {
    return Infinity
  }

  const relationTable = new Map()
  for (const {source, target} of validEdges) {
    // if (source === target) {
    //   return NaN // the graph is cyclic
    // }

    if (relationTable.has(source)) {
      relationTable.get(source).targets.add(target)
    } else {
      relationTable.set(source, {
        checked: false,
        targets: new Set([target])
      })
    }
  }

  return visitStart(relationTable, startNodeId, terminalNodeIdsSet)
}

export default {
  withEdgeStates,
  edgeTargets,
  isAnonymousEdge,
  isClosureEdge,
  removeEdgeDuplication,
  edgeIndex,
  expandAnonymousEdge,
  edgeLengths,
  expandEdge,
  possibleMaxPathLength
}