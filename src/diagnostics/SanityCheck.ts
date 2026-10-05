import { Node as JsonCNode, ParseError } from 'jsonc-parser';
import { findDuplicates } from './DuplicateKeyDetector';
import { findDuplicateValues } from './DuplicateValues';
import { findMissingKeys } from './MissingKeys';
import { describeParseError, sortDiagnosticsLikeSanity } from './ParseErrorMessages';
import { collectEmptyValues } from '../commands/empty';

export type SanitySeverity = 'error' | 'warning' | 'info';

export interface SanityIssue {
  severity: SanitySeverity;
  message: string;
  path?: string;
  offset?: number;
  length?: number;
}

export interface SanityReport {
  /** True when no parse errors and no duplicate keys. */
  valid: boolean;
  parseErrorCount: number;
  duplicateKeyCount: number;
  duplicateValueGroups: number;
  duplicateValueOccurrences: number;
  missingKeyCount: number;
  emptyCount: number;
  nullCount: number;
  emptyStringCount: number;
  emptyArrayCount: number;
  emptyObjectCount: number;
  issues: SanityIssue[];
  summary: string;
}

function countTrailingCommas(text: string): number {
  const m = text.match(/,(\s*[}\]])/g);
  return m ? m.length : 0;
}

function maxDepthOf(root: JsonCNode | undefined): number {
  if (!root) return 0;
  let max = 0;
  const visit = (node: JsonCNode, depth: number): void => {
    max = Math.max(max, depth);
    for (const c of node.children ?? []) visit(c, depth + 1);
  };
  visit(root, 0);
  return max;
}

/**
 * Basic JSON sanity check: parse errors, duplicate keys, duplicate
 * array entries, empty/null values, trailing commas, empty document,
 * excessive depth. Pure — no vscode dependency so it is unit-testable.
 */
export function runSanityCheck(
  text: string,
  root: JsonCNode | undefined,
  errors: ParseError[],
): SanityReport {
  const issues: SanityIssue[] = [];

  const lineCol = (offset: number): string => {
    const upto = text.slice(0, Math.max(0, Math.min(offset, text.length)));
    const line = (upto.match(/\n/g) ?? []).length + 1;
    const col = offset - (upto.lastIndexOf('\n') + 1) + 1;
    return `line ${line}, col ${col}`;
  };

  for (const e of errors) {
    const { message, hint } = describeParseError(e.error);
    issues.push({
      severity: 'error',
      message: `${message} (${lineCol(e.offset)}): ${hint}`,
      offset: e.offset,
      length: Math.max(1, e.length),
    });
  }

  if (!root && text.trim().length === 0) {
    issues.push({ severity: 'info', message: 'Document is empty.' });
  }

  const dups = findDuplicates(root);
  for (const d of dups) {
    issues.push({
      severity: 'warning',
      message: `Duplicate key "${d.key}" (keeps first)`,
      offset: d.dupOffset,
      length: Math.max(1, d.dupLength),
    });
  }

  const dupValues = findDuplicateValues(root);
  for (const g of dupValues) {
    const first = g.occurrences[0];
    issues.push({
      severity: 'warning',
      message: `Duplicate entry ${g.preview} ×${g.occurrences.length} in ${g.containerPath}`,
      path: first?.path,
      offset: first?.offset,
      length: Math.max(1, first?.length ?? 1),
    });
  }

  const missing = findMissingKeys(root);
  for (const m of missing) {
    issues.push({
      severity: 'warning',
      message: m.typoOf
        ? `Possibly missing "${m.key}" in ${m.path} (${m.presentIn}/${m.siblingCount} of ${m.containerPath} have it) — found "${m.typoOf}", typo?`
        : `Missing "${m.key}" in ${m.path} (${m.presentIn}/${m.siblingCount} of ${m.containerPath} have it)`,
      path: m.path,
      offset: m.offset,
      length: 1,
    });
  }

  const empties = collectEmptyValues(root).filter((e) => e.node !== root);
  let nullCount = 0;
  let emptyStringCount = 0;
  let emptyArrayCount = 0;
  let emptyObjectCount = 0;
  for (const e of empties) {
    if (e.kind === 'null') nullCount += 1;
    else if (e.kind === 'empty-string') emptyStringCount += 1;
    else if (e.kind === 'empty-array') emptyArrayCount += 1;
    else emptyObjectCount += 1;
  }
  if (empties.length > 0) {
    issues.push({
      severity: 'info',
      message:
        `${empties.length} empty/null value(s): ` +
        `${nullCount} null, ${emptyStringCount} empty string, ` +
        `${emptyArrayCount} empty array, ${emptyObjectCount} empty object`,
    });
  }

  const trailing = errors.length === 0 ? 0 : countTrailingCommas(text);
  if (trailing > 0) {
    issues.push({
      severity: 'info',
      message: `${trailing} trailing comma(s) — safe fix available via "JSON: Fix JSON".`,
    });
  }

  const depth = maxDepthOf(root);
  if (depth > 20) {
    issues.push({
      severity: 'info',
      message: `Deep nesting (depth ${depth}) — explorer pagination still applies.`,
    });
  }

  const valid = errors.length === 0 && dups.length === 0;
  const sorted = sortDiagnosticsLikeSanity(
    issues.map((i) => ({ ...i, severity: i.severity })),
  );
  const summary = formatSanitySummary({
    valid,
    parseErrorCount: errors.length,
    duplicateKeyCount: dups.length,
    duplicateValueGroups: dupValues.length,
    missingKeyCount: missing.length,
    emptyCount: empties.length,
  });

  return {
    valid,
    parseErrorCount: errors.length,
    duplicateKeyCount: dups.length,
    duplicateValueGroups: dupValues.length,
    duplicateValueOccurrences: dupValues.reduce((n, g) => n + g.occurrences.length, 0),
    missingKeyCount: missing.length,
    emptyCount: empties.length,
    nullCount,
    emptyStringCount,
    emptyArrayCount,
    emptyObjectCount,
    issues: sorted,
    summary,
  };
}

function formatSanitySummary(r: {
  valid: boolean;
  parseErrorCount: number;
  duplicateKeyCount: number;
  duplicateValueGroups: number;
  missingKeyCount: number;
  emptyCount: number;
}): string {
  const parts: string[] = [];
  parts.push(r.parseErrorCount === 0 ? 'valid JSON' : `${r.parseErrorCount} syntax error(s)`);
  if (r.duplicateKeyCount > 0) parts.push(`${r.duplicateKeyCount} duplicate key(s)`);
  if (r.duplicateValueGroups > 0) parts.push(`${r.duplicateValueGroups} duplicate entr(y/ies)`);
  if (r.missingKeyCount > 0) parts.push(`${r.missingKeyCount} missing key(s)`);
  if (r.emptyCount > 0) parts.push(`${r.emptyCount} empty/null value(s)`);
  const prefix = r.valid ? '✓ ' : '✗ ';
  return prefix + parts.join(' • ');
}
