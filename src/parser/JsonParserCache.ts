import { ParsedDocument } from './JsonNode';
import { parseText } from './JsonParser';

/**
 * Debounced, versioned cache of parsed documents keyed by document URI string.
 * Parsing is synchronous but caching avoids reparsing on every keystroke-driven
 * query; callers pass the current text + version and get a cached result when
 * the version matches. Stale async work checks the version before applying.
 */
export class JsonParserCache {
  private cache = new Map<string, ParsedDocument>();
  private pending = new Map<string, number>();

  get(key: string, text: string, version: number, allowComments: boolean): ParsedDocument {
    const hit = this.cache.get(key);
    if (hit && hit.version === version && hit.text === text) return hit;
    const parsed = parseText(text, version, allowComments);
    this.cache.set(key, parsed);
    return parsed;
  }

  getCached(key: string): ParsedDocument | undefined {
    return this.cache.get(key);
  }

  invalidate(key: string): void {
    this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  /** Track a scheduled async token so stale work can be cancelled. */
  markPending(key: string, token: number): void {
    this.pending.set(key, token);
  }

  isStale(key: string, token: number): boolean {
    return this.pending.get(key) !== token;
  }
}

let tokenCounter = 0;
export function nextToken(): number {
  tokenCounter += 1;
  return tokenCounter;
}
