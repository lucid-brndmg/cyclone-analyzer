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
    for (let s of nonExcl) {
      f(fromState, s)
      if (isBi) {
        f(s, fromState)
      }
    }
  } else {
    for (let s of toStates) {
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
  for (let edge of edgeMetadataList) {
    if (isAnonymousEdge(edge)) {
      edges.push(...expandAnonymousEdge(edge, allStates))
    } else {
      total += 1
    }
  }

  return removeEdgeDuplication(edges).length + total
}

export default {
  withEdgeStates,
  edgeTargets,
  isAnonymousEdge,
  isClosureEdge,
  removeEdgeDuplication,
  edgeIndex,
  expandAnonymousEdge,
  edgeLengths
}