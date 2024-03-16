export const isAnonymous = ({operators, toStates}) =>
  operators.has("<->")
  || operators.has("+")
  || operators.has("*")
  || toStates.length > 1

export default {
  isAnonymous
}