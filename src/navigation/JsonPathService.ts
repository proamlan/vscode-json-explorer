import { Node as JsonCNode } from 'jsonc-parser';
import {
  getNodePathSegments,
  pathToJsonPathString,
  pathToPointer,
  resolvePath,
  jsonPathStringToPath,
  pointerToPath,
  PathSegment,
} from '../parser/JsonPosition';
import { findNodeAtOffset } from '../parser/JsonParser';

export class JsonPathService {
  constructor(private getRoot: () => JsonCNode | undefined) {}

  pathAt(offset: number): PathSegment[] {
    const root = this.getRoot();
    const node = root ? findNodeAtOffset(root, offset) : undefined;
    return getNodePathSegments(node);
  }

  jsonPathAt(offset: number): string {
    return pathToJsonPathString(this.pathAt(offset));
  }

  pointerAt(offset: number): string {
    return pathToPointer(this.pathAt(offset));
  }

  resolveJsonPath(pathStr: string): JsonCNode | undefined {
    return resolvePath(this.getRoot(), jsonPathStringToPath(pathStr));
  }

  resolvePointer(pointer: string): JsonCNode | undefined {
    return resolvePath(this.getRoot(), pointerToPath(pointer));
  }
}

export { pathToJsonPathString, pathToPointer, resolvePath, jsonPathStringToPath, pointerToPath };
export type { PathSegment };
