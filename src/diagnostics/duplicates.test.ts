import { describe, it, expect } from 'vitest';
import { parseText } from '../parser/JsonParser';
import { findDuplicateValues } from './DuplicateValues';
import { runSanityCheck } from './SanityCheck';

describe('duplicate values', () => {
  it('finds deep-equal duplicates in the same array', () => {
    const { root } = parseText('{"tags": ["a", "b", "a", "a"]}');
    const groups = findDuplicateValues(root);
    expect(groups.length).toBe(1);
    expect(groups[0].preview).toContain('a');
    expect(groups[0].occurrences.length).toBe(3);
    expect(groups[0].containerPath).toBe('$.tags');
  });

  it('finds duplicate objects regardless of key order', () => {
    const { root } = parseText('{"items": [{"a":1,"b":2},{"b":2,"a":1},{"a":1}]}');
    const groups = findDuplicateValues(root);
    expect(groups.length).toBe(1);
    expect(groups[0].occurrences.length).toBe(2);
  });

  it('ignores trivial scalars by default', () => {
    const { root } = parseText('{"flags": [true, true, false]}');
    expect(findDuplicateValues(root).length).toBe(0);
    expect(findDuplicateValues(root, { ignoreTrivialScalars: false }).length).toBe(1);
  });

  it('does not cross array boundaries', () => {
    const { root } = parseText('{"a": [1, 2], "b": [1, 2]}');
    // 1 and 2 appear once per array — no group within a single array.
    expect(findDuplicateValues(root).length).toBe(0);
  });

  it('returns empty for no root', () => {
    expect(findDuplicateValues(undefined).length).toBe(0);
  });
});

describe('sanity check', () => {
  it('passes clean JSON', () => {
    const text = '{"a": 1, "b": [1, 2]}';
    const { root, errors } = parseText(text);
    const report = runSanityCheck(text, root, errors);
    expect(report.valid).toBe(true);
    expect(report.issues.length).toBe(0);
    expect(report.summary).toContain('valid JSON');
  });

  it('flags syntax errors as invalid', () => {
    const text = '{"a": }';
    const { root, errors } = parseText(text);
    const report = runSanityCheck(text, root, errors);
    expect(report.valid).toBe(false);
    expect(report.parseErrorCount).toBeGreaterThan(0);
    expect(report.issues[0].severity).toBe('error');
  });

  it('aggregates duplicate keys, duplicate entries and empty values', () => {
    const text = '{"a": 1, "a": 2, "tags": ["x", "x"], "nick": "", "age": null}';
    const { root, errors } = parseText(text);
    const report = runSanityCheck(text, root, errors);
    expect(report.valid).toBe(false); // duplicate key invalidates
    expect(report.duplicateKeyCount).toBe(1);
    expect(report.duplicateValueGroups).toBe(1);
    expect(report.emptyCount).toBeGreaterThanOrEqual(2);
    expect(report.nullCount).toBe(1);
    expect(report.emptyStringCount).toBe(1);
    expect(report.summary).toContain('duplicate key');
  });

  it('reports empty document', () => {
    const { root, errors } = parseText('');
    const report = runSanityCheck('', root, errors);
    expect(report.issues.some((i) => i.message.includes('empty'))).toBe(true);
  });
});
