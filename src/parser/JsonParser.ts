import * as jsonc from 'jsonc-parser';
import { Node as JsonCNode, ParseError } from 'jsonc-parser';
import { ParsedDocument } from './JsonNode';

export type ParseResult = ParsedDocument;

/** Parse JSON or JSONC text into a tolerant tree with offsets. */
export function parseText(text: string, version = 0, allowComments = true): ParseResult {
  const errors: ParseError[] = [];
  const errorsRef: ParseError[] = errors;
  const root: JsonCNode | undefined = jsonc.parseTree(text, errorsRef, {
    allowTrailingComma: true,
    disallowComments: !allowComments,
    allowEmptyContent: true,
  });
  return { root, errors, text, version };
}

export function findNodeAtOffset(root: JsonCNode | undefined, offset: number): JsonCNode | undefined {
  if (!root) return undefined;
  return jsonc.findNodeAtOffset(root, offset, true);
}

/** Narrowest named (property/array-item) ancestor chain helper: find deepest node containing offset. */
export function findDeepestNamedNode(
  root: JsonCNode | undefined,
  offset: number,
): JsonCNode | undefined {
  const n = findNodeAtOffset(root, offset);
  return n;
}

export function getNodeValue(node: JsonCNode | undefined): unknown {
  if (!node) return undefined;
  return jsonc.getNodeValue(node);
}

export function getNodePath(node: JsonCNode | undefined): jsonc.JSONPath {
  if (!node) return [];
  return jsonc.getNodePath(node);
}
