const eUndefinedIdentifier = e => {
  // int a = b + 1; ... = f(b); no variable/constant b is found.
  // int a = R.b + 1; object 'R' is not defined.
  // enum: enum '#Red' is not defined
  // Function 'f' cannot be found.
  // cannot find NODE 'S' in current spec
  // no invariant: 'A' in current spec
  // rec field: R.b is not defined
  // goal: b = a; PATH VARIABLE b is not defined
  // let b = a; no node or path variable a is defined
}

const eIdentifierRedeclaration = e => {
  // 'a' is already defined as a variable
  // 'a' is already defined as a constant
  // 'R' is already defined as an object
  // Spec has already contained a NODE: 'S'
  // Spec has already contained a transition: 'T'
  // LET: PATH VAR p is already defined
  // Spec has already contained an invariant: 'i'
  // R.a: Entry 'R''s ' variable 'a' is already defined
}


export const getErrorMessage = e => {

}