import { describe, it, expect } from 'vitest';
import { parseText } from '../parser/JsonParser';
import { badgeText } from '../readability/CountBadges';
import {
  collectEmptyValues,
  emptyKindOf,
  emptyLabel,
  planPrune,
} from './empty';
import { findKeyOccurrences, findRenameConflicts, keyAtOffset } from './rename';

const DOC = `{
  "name": "Amlan",
  "nick": "",
  "age": null,
  "tags": [],
  "address": {},
  "users": [
    { "name": "Sam", "email": null },
    { "name": "Jo", "email": "j@x.com" }
  ]
}`;

function applyPlan(text: string, plan: Array<{ start: number; end: number }>): string {
  let out = text;
  for (const r of plan) out = out.slice(0, r.start) + out.slice(r.end);
  return out;
}

describe('badgeText', () => {
  it('formats badges', () => {
    expect(badgeText('object', 1)).toBe('1 property');
    expect(badgeText('object', 8)).toBe('8 properties');
    expect(badgeText('array', 1248)).toBe('1,248 items');
  });
});

describe('empty values', () => {
  it('collects null, empty string, empty array, empty object', () => {
    const { root } = parseText(DOC);
    const kinds = collectEmptyValues(root).map((e) => e.kind);
    expect(kinds).toContain('null');
    expect(kinds).toContain('empty-string');
    expect(kinds).toContain('empty-array');
    expect(kinds).toContain('empty-object');
    // age, nick, tags, address + nested email null
    expect(collectEmptyValues(root).length).toBe(5);
  });
  it('labels paths', () => {
    const { root } = parseText(DOC);
    const labels = collectEmptyValues(root).map(emptyLabel);
    expect(labels.some((l) => l.includes('$.nick'))).toBe(true);
    expect(labels.some((l) => l.includes('$.users[0].email'))).toBe(true);
  });
  it('emptyKindOf classifies nodes', () => {
    const { root } = parseText('{"a": "", "b": "x", "c": [], "d": [1], "e": {}, "f": {}, "g": null}');
    const kinds = new Map<string, string>();
    const visit = (n: Parameters<typeof emptyKindOf>[0]): void => {
      if (n.type === 'property' && n.children?.[0]) {
        kinds.set(String(n.children[0].value), emptyKindOf(n.children[1]) ?? 'non-empty');
      }
      for (const c of n.children ?? []) visit(c);
    };
    visit(root!);
    expect(kinds.get('a')).toBe('empty-string');
    expect(kinds.get('b')).toBe('non-empty');
    expect(kinds.get('c')).toBe('empty-array');
    expect(kinds.get('d')).toBe('non-empty');
    expect(kinds.get('e')).toBe('empty-object');
    expect(kinds.get('g')).toBe('null');
  });
  it('prune plan removes empties and stays valid JSON', () => {
    const { root } = parseText(DOC);
    const empties = collectEmptyValues(root).filter((e) => e.node !== root);
    const result = applyPlan(DOC, planPrune(DOC, empties));
    const parsed = JSON.parse(result);
    expect(parsed.nick).toBeUndefined();
    expect(parsed.age).toBeUndefined();
    expect(parsed.tags).toBeUndefined();
    expect(parsed.address).toBeUndefined();
    expect(parsed.users[0].email).toBeUndefined();
    expect(parsed.name).toBe('Amlan');
    expect(parsed.users[1].email).toBe('j@x.com');
  });
});

describe('rename key', () => {
  it('finds occurrences document-wide', () => {
    const { root } = parseText(DOC);
    const occ = findKeyOccurrences(root, undefined, 'name');
    expect(occ.length).toBe(3); // root + two users
    expect(occ[0].path).toBe('$.name');
  });
  it('scopes to a subtree', () => {
    const { root } = parseText(DOC);
    const users = root!.children!.find(
      (p) => p.type === 'property' && String(p.children?.[0].value) === 'users',
    )!.children![1];
    expect(findKeyOccurrences(root, users, 'name').length).toBe(2);
    expect(findKeyOccurrences(root, users, 'nick').length).toBe(0);
  });
  it('detects conflicts', () => {
    const { root } = parseText('{"a": 1, "b": 2}');
    expect(findRenameConflicts(root, undefined, 'a', 'b').length).toBe(1);
    expect(findRenameConflicts(root, undefined, 'a', 'c').length).toBe(0);
    expect(findRenameConflicts(root, undefined, 'a', 'a').length).toBe(0);
  });
  it('finds key at cursor offset', () => {
    const text = '{"name": "Amlan"}';
    const { root } = parseText(text);
    expect(keyAtOffset(root, text.indexOf('name'))?.key).toBe('name');
    expect(keyAtOffset(root, text.indexOf('Amlan'))?.key).toBe('name');
  });
});
