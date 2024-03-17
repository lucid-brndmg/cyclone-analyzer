export const isAnonymousEdge = ({operators, toStates}) =>
  operators.has("<->")
  || operators.has("+")
  || operators.has("*")
  || toStates.length > 1

export const isClosureEdge = operators => operators.has("*") || operators.has("+")

export const removeEdgeDuplication = edges => [...new Set(edges.map(({source, target}) => `${source}:${target}`))].map(it => {
  const [source, target] = it.split(":")
  return {source, target}
})

export const edgeIndex = (fromState, operators, targetStatesSet, excludedStatesSet) => `${fromState ?? ""}|${[...targetStatesSet].sort().join(",")}|${[...operators].sort().join(",")}|${[...excludedStatesSet].sort().join(",")}`

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

export const edgeTargets = ({operators, toStates, fromState, excludedStates}, allStates) => {
  const targets = new Set(toStates)
  withEdgeStates({operators, toStates, fromState, excludedStates}, allStates, (_, to) => targets.add(to))

  return targets
}

export const expandAnonymousEdge = ({operators, toStates, fromState, excludedStates}, allStates) => {
  if (!isAnonymousEdge({operators, toStates})) {
    return []
  }

  const edges = []
  withEdgeStates({operators, toStates, fromState, excludedStates}, allStates, (source, target) => edges.push(({source, target})))

  return removeEdgeDuplication(edges)
}

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