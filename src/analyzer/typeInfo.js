import {IdentifierKind, IdentifierType, SemanticContextType} from "../language/definitions.js";

export default class TypeInfo {
  type
  typeParams
  isActionCall
  identifier
  isLiteral
  identifierKind
  metadata
  isSignature

  constructor(
    type,
    typeParams = null,
    isActionCall = false,
    identifier = null,
    identifierKind = null,
    isLiteral = false,
    isSignature = false,
    metadata = null
  ) {
    this.type = type
    this.isActionCall = isActionCall
    this.identifier = identifier
    this.isLiteral = isLiteral
    this.identifierKind = identifierKind
    this.metadata = metadata
    this.typeParams = typeParams
    this.isSignature = isSignature
  }

  static hole(metadata = null) {
    // TODO: global public instance?
    return new TypeInfo(IdentifierType.Hole, null, false, null, null, false, false, metadata)
  }

  static literal(type, typeParams = null, metadata = null) {
    return new TypeInfo(type, typeParams, false, null, null, true, false, metadata)
  }

  static identifier(type, typeParams, identifier, kind, metadata = null) {
    return new TypeInfo(type, typeParams, false, identifier, kind, false, false, metadata)
  }

  static action(type, typeParams = null) {
    return new TypeInfo(type, typeParams, true)
  }

  static signature(type, typeParams = null) {
    return new TypeInfo(type, typeParams, false, null, null, false, true)
  }

  isImmutable() {
    return this.isActionCall
      || this.isLiteral
      || this.identifierKind === IdentifierKind.GlobalConst
  }
}