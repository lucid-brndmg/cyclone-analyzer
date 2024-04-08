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
