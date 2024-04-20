import {IdentifierKind, IdentifierType, SemanticContextType} from "../language/definitions.js";

export default class TypeInfo {
  type
  isActionCall
  identifier
  isLiteral
  identifierKind
  metadata

  constructor(
    type,
    isActionCall = false,
    identifier = null,
    identifierKind = null,
    isLiteral = false,
    metadata = null
  ) {
    this.type = type
    this.isActionCall = isActionCall
    this.identifier = identifier
    this.isLiteral = isLiteral
    this.identifierKind = identifierKind
    this.metadata = metadata
  }

  static hole(metadata = null) {
    // TODO: global public instance?
    return new TypeInfo(IdentifierType.Hole, false, null, null, false, metadata)
  }

  static literal(type, metadata = null) {
    return new TypeInfo(type, false, null, null, true, metadata)
  }

  static identifier(type, identifier, kind, metadata = null) {
    return new TypeInfo(type, false, identifier, kind, false, metadata)
  }

  isImmutable() {
    return this.isActionCall
      || this.isLiteral
      || this.identifierKind === IdentifierKind.GlobalConst
  }
}