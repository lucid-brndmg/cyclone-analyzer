const removeParens = (trimmedExpr, parens = [
  ["(", ")"],
  ["{", "}"],
  ["<", ">"],
  ["[", "]"]
]) => {
  if (parens.some(([l, r]) => trimmedExpr.startsWith(l) && trimmedExpr.endsWith(r))) {
    const cut = trimmedExpr.slice(1, -1).trim()
    if (cut.length > 0) {
      return removeParens(cut, parens)
    }
  }

  return trimmedExpr
}

// Converts a hex string into binary format and get the binary representation's length
// Made for extract the size of a bit vector literal
export const hexLiteralBinaryLength = hexLiteralString => {
  const bin = (parseInt(hexLiteralString, 16).toString(2))
  return bin.length
}