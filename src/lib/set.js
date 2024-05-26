export const firstOfSet = s => {
  for (const e of s) {
    return e
  }

  return undefined
}

export const elementEq = (s1, s2) => {
  if (s1.size !== s2.size) {
    return false
  }

  for (const e of s1) {
    if (!s2.has(e)) {
      return false
    }
  }
  for (const e of s2) {
    if (!s1.has(e)) {
      return false
    }
  }

  return true
}

export default {
  firstOfSet,
  elementEq
}