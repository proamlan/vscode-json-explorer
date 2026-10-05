import { describe, it, expect } from 'vitest';
import * as jsonc from 'jsonc-parser';
import { parseText } from '../parser/JsonParser';
import { findMissingKeys, isLikelyTypo } from './MissingKeys';
import { describeParseError } from './ParseErrorMessages';
import { nextIssueIndex } from '../commands/issues';
import { runSanityCheck } from './SanityCheck';

describe('missing keys', () => {
  it('flags a key absent from one sibling', () => {
    const { root } = parseText('{"users": [{"name": "a", "email": "a@x"}, {"name": "b"}, {"name": "c", "email": "c@x"}]}');
    const missing = findMissingKeys(root);
    expect(missing.length).toBe(1);
    expect(missing[0].key).toBe('email');
    expect(missing[0].path).toBe('$.users[1]');
    expect(missing[0].presentIn).toBe(2);
  });

  it('hints at typos', () => {
    const { root } = parseText('{"users": [{"email": "a@x"}, {"email": "b@x"}, {"emial": "c@x"}]}');
    const missing = findMissingKeys(root);
    expect(missing.length).toBe(1);
    expect(missing[0].typoOf).toBe('emial');
  });

  it('ignores single-occurrence keys (intentional variation)', () => {
    const { root } = parseText('{"users": [{"name": "a"}, {"name": "b"}, {"name": "c", "nick": "x"}]}');
    expect(findMissingKeys(root).length).toBe(0);
  });

  it('returns empty for non-array objects and empty root', () => {
    expect(findMissingKeys(undefined).length).toBe(0);
    const { root } = parseText('{"a": 1}');
    expect(findMissingKeys(root).length).toBe(0);
  });

  it('isLikelyTypo bounds edit distance', () => {
    expect(isLikelyTypo('emial', 'email')).toBe(true);
    expect(isLikelyTypo('email', 'email')).toBe(false);
    expect(isLikelyTypo('a', 'ab')).toBe(false);
    expect(isLikelyTypo('completely-different', 'email')).toBe(false);
  });
});

describe('friendly parse errors', () => {
  it('maps codes to actionable messages', () => {
    expect(describeParseError(jsonc.ParseErrorCode.CommaExpected).message).toMatch(/comma/i);
    expect(describeParseError(jsonc.ParseErrorCode.ColonExpected).hint).toContain(':');
    expect(describeParseError(jsonc.ParseErrorCode.CloseBraceExpected).message).toMatch(/unclosed/i);
    expect(describeParseError(jsonc.ParseErrorCode.UnexpectedEndOfString).message).toMatch(/string/i);
  });
});

describe('next/prev navigation', () => {
  it('moves forward with wrap', () => {
    expect(nextIssueIndex([10, 20, 30], 5, 1)).toBe(0);
    expect(nextIssueIndex([10, 20, 30], 10, 1)).toBe(1);
    expect(nextIssueIndex([10, 20, 30], 30, 1)).toBe(0);
  });
  it('moves backward with wrap', () => {
    expect(nextIssueIndex([10, 20, 30], 35, -1)).toBe(2);
    expect(nextIssueIndex([10, 20, 30], 30, -1)).toBe(1);
    expect(nextIssueIndex([10, 20, 30], 5, -1)).toBe(2);
  });
  it('returns -1 when empty', () => {
    expect(nextIssueIndex([], 0, 1)).toBe(-1);
  });
});

describe('sanity with missing keys', () => {
  it('reports missing keys as warnings without invalidating', () => {
    const text = '{"users": [{"name": "a", "email": "a@x"}, {"name": "b"}, {"name": "c", "email": "c@x"}]}';
    const { root, errors } = parseText(text);
    const report = runSanityCheck(text, root, errors);
    expect(report.missingKeyCount).toBe(1);
    expect(report.valid).toBe(true); // missing keys warn, don't invalidate
    expect(report.summary).toContain('missing key');
    // errors sort before warnings
    expect(report.issues[0].severity).toBe('warning');
  });

  it('sorts syntax errors before warnings', () => {
    const text = '{"a": 1, "a": 2, "oops" }';
    const { root, errors } = parseText(text);
    const report = runSanityCheck(text, root, errors);
    expect(report.parseErrorCount).toBeGreaterThan(0);
    expect(report.issues[0].severity).toBe('error');
    expect(report.issues[0].message).toMatch(/line \d+, col \d+/);
  });
});
