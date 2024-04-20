export const firstOfSet = s => {
  for (let e of s) {
    return e
  }

  return undefined
}

export const elementEq = (s1, s2) => {
  if (s1.size !== s2.size) {
    return false
  }

  for (let e of s1) {
    if (!s2.has(e)) {
      return false
    }
  }
  for (let e of s2) {
    if (!s1.has(e)) {
      return false
    }
  }

  return true
}