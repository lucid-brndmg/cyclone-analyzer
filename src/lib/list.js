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

export const elementReplacer = (original, newValue) => elem =>
  elem === original
    ? newValue
    : original

export const firstCombo = (xs, combos) => {
  const s = new Set(xs)
  for (let i = 0; i < combos.length; i++) {
    const combo = combos[i]
    if (combo.length && combo.every(c => s.has(c))) {
      return i
    }
  }

  return -1
}

export const findDuplications = xs => {
  const dup = new Set()
  const s = new Set()
  for (let x of xs) {
    if (s.has(x)) {
      dup.add(x)
    } else {
      s.add(x)
    }
  }

  return dup
}

export default {
  popMulti,
  popMultiStore,
  findLast,
  elementReplacer,
  firstCombo,
  findDuplications
}