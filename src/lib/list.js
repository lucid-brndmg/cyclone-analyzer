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

export const findLast = (xs, f) => {
  for (let i = xs.length - 1; i >= 0; i--) {
    const e = xs[i]
    if (f(e, i, xs)) {
      return e
    }
  }

  return undefined
}

export default {
  popMulti,
  popMultiStore,
  findLast
}