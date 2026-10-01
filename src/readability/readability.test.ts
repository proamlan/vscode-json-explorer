import { describe, it, expect } from 'vitest';
import { parseText } from '../parser/JsonParser';
import { formatCount, describeCount } from '../utils/debounce';
import { collectLensTargets, lensTitle } from './JsonLensProvider';
import { collectClosingLabels, labelFor } from './ClosingLabels';
import { resolvePath } from '../parser/JsonPosition';
import { jsonPathStringToPath } from '../parser/JsonPosition';

const DOC = `{
  "users": [
    {
      "name": "Amlan",
      "email": "a@example.com",
      "address": {
        "city": "BLR",
        "pin": 560001
      }
    },
    {
      "name": "Sam",
      "email": "s@example.com",
      "address": {
        "city": "HYD",
        "pin": 500001
      }
    }
  ],
  "meta": { "count": 2 }
}`;

describe('formatCount / describeCount', () => {
  it('formats thousands', () => {
    expect(formatCount(0)).toBe('0');
    expect(formatCount(999)).toBe('999');
    expect(formatCount(1000)).toBe('1,000');
    expect(formatCount(1248000)).toBe('1,248,000');
  });
  it('uses singular/plural', () => {
    expect(describeCount(1, 'item', 'items')).toBe('1 item');
    expect(describeCount(2, 'item', 'items')).toBe('2 items');
    expect(describeCount(1248, 'property', 'properties')).toBe('1,248 properties');
  });
});

describe('lens targets', () => {
  it('targets multi-line containers with counts', () => {
    const { root } = parseText(DOC);
    const targets = collectLensTargets(root, DOC);
    expect(targets.length).toBeGreaterThan(0);
    // single-line containers are skipped
    expect(targets.every((t) => t.endLine > t.startLine)).toBe(true);
    const titles = targets.map(lensTitle);
    expect(titles).toContain('2 items'); // users array
    expect(titles).toContain('3 properties'); // user objects
  });
  it('skips single-line documents', () => {
    const { root } = parseText('{"a": 1}');
    expect(collectLensTargets(root, '{"a": 1}')).toEqual([]);
  });
  it('is capped', () => {
    const { root } = parseText(DOC);
    expect(collectLensTargets(root, DOC, { maxLenses: 1 }).length).toBe(1);
  });
});

describe('closing labels', () => {
  it('labels long blocks with their key', () => {
    const { root } = parseText(DOC);
    const labels = collectClosingLabels(root, DOC, { minLines: 3 });
    const byLabel = new Map(labels.map((l) => [l.label, l]));
    expect(byLabel.has('users')).toBe(true);
    expect(byLabel.has('address')).toBe(true);
    // root itself is never labelled
    expect(labels.every((l) => l.label !== '')).toBe(true);
  });
  it('labels array items as key[index]', () => {
    const { root } = parseText(DOC);
    const users = resolvePath(root, jsonPathStringToPath('$.users[0]'))!;
    expect(labelFor(users)).toBe('users[0]');
    const address = resolvePath(root, jsonPathStringToPath('$.users[1].address'))!;
    expect(labelFor(address)).toBe('address');
  });
  it('skips short blocks', () => {
    const { root } = parseText(DOC);
    expect(collectClosingLabels(root, DOC, { minLines: 1000 })).toEqual([]);
  });
});
