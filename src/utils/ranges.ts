export function offsetToPosition(text: string, offset: number): { line: number; character: number } {
  let line = 0;
  let character = 0;
  const end = Math.max(0, Math.min(offset, text.length));
  for (let i = 0; i < end; i++) {
    if (text[i] === '\n') {
      line += 1;
      character = 0;
    } else {
      character += 1;
    }
  }
  return { line, character };
}

export function positionToOffset(text: string, line: number, character: number): number {
  const lines = text.split('\n');
  let offset = 0;
  for (let i = 0; i < line && i < lines.length; i++) offset += lines[i].length + 1;
  return offset + Math.min(character, (lines[line] ?? '').length);
}
