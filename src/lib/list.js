export const popMulti = (xs, length) => {
  let i = 0
  while (i < length) {
    xs.pop()
    i ++
  }
}

export const popMultiStore = (xs, length) => {
  let i = 0
  let ys = []
  while (i < length) {
    ys.push(xs.pop())
    i ++
  }

  return ys
}

export default {
  popMulti,
  popMultiStore
}