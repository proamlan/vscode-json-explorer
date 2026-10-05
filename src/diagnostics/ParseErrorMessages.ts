import * as jsonc from 'jsonc-parser';

/** Human-friendly syntax error descriptions with fix hints. Pure and unit-tested. */
export function describeParseError(code: jsonc.ParseErrorCode): { message: string; hint: string } {
  switch (code) {
    case jsonc.ParseErrorCode.PropertyNameExpected:
      return { message: 'Missing property name', hint: 'keys must be "quoted" strings' };
    case jsonc.ParseErrorCode.ValueExpected:
      return { message: 'Missing value', hint: 'expected a string, number, object, array, true / false / null' };
    case jsonc.ParseErrorCode.ColonExpected:
      return { message: 'Missing colon', hint: 'expected ":" after the property name' };
    case jsonc.ParseErrorCode.CommaExpected:
      return { message: 'Missing comma', hint: 'separate properties / items with ","' };
    case jsonc.ParseErrorCode.CloseBraceExpected:
      return { message: 'Unclosed object', hint: 'missing "}" to close "{"' };
    case jsonc.ParseErrorCode.CloseBracketExpected:
      return { message: 'Unclosed array', hint: 'missing "]" to close "["' };
    case jsonc.ParseErrorCode.EndOfFileExpected:
      return { message: 'Unexpected content after JSON ends', hint: 'only one top-level value is allowed' };
    case jsonc.ParseErrorCode.UnexpectedEndOfString:
      return { message: 'Unterminated string', hint: 'missing closing quote' };
    case jsonc.ParseErrorCode.UnexpectedEndOfNumber:
      return { message: 'Truncated number', hint: 'check digits / exponent' };
    case jsonc.ParseErrorCode.InvalidNumberFormat:
      return { message: 'Invalid number', hint: 'expected JSON number format, e.g. 12 or -3.5e2' };
    case jsonc.ParseErrorCode.InvalidUnicode:
      return { message: 'Invalid unicode escape', hint: 'expected \\u followed by 4 hex digits' };
    case jsonc.ParseErrorCode.InvalidEscapeCharacter:
      return { message: 'Invalid escape', hint: 'valid escapes are \\" \\\\ \\/ \\b \\f \\n \\r \\t \\u' };
    case jsonc.ParseErrorCode.InvalidCommentToken:
    case jsonc.ParseErrorCode.UnexpectedEndOfComment:
      return { message: 'Bad comment', hint: 'use // or /* … */ in .jsonc only — plain .json forbids comments' };
    case jsonc.ParseErrorCode.InvalidSymbol:
    case jsonc.ParseErrorCode.InvalidCharacter:
    default:
      return { message: 'Invalid character', hint: 'check quotes, commas and brackets around here' };
  }
}

/** Sort helper shared by status bar + next/prev navigation: document order, errors first. */
export function sortDiagnosticsLikeSanity<T extends { offset?: number; length?: number; severity: string }>(
  issues: T[],
): T[] {
  const rank = (s: string): number => (s === 'error' ? 0 : s === 'warning' ? 1 : 2);
  return [...issues].sort((a, b) => rank(a.severity) - rank(b.severity) || (a.offset ?? 0) - (b.offset ?? 0));
}
