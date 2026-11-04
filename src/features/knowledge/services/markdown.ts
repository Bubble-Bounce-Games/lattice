export type FormatAction = 'bold' | 'italic' | 'bullet' | 'ordered' | 'link';
export function formatSelection(value: string, start: number, end: number, action: FormatAction) {
  const selection = value.slice(start, end);
  let replacement = '',
    cursorStart = start,
    cursorEnd = end;
  if (action === 'bullet' || action === 'ordered') {
    const lineStart = value.lastIndexOf('\n', start - 1) + 1;
    const lineEnd = value.indexOf('\n', end);
    const rangeEnd = lineEnd < 0 ? value.length : lineEnd;
    replacement = value
      .slice(lineStart, rangeEnd)
      .split('\n')
      .map(
        (line, index) => `${action === 'bullet' ? '- ' : `${index + 1}. `}${line || 'List item'}`,
      )
      .join('\n');
    return {
      value: value.slice(0, lineStart) + replacement + value.slice(rangeEnd),
      start: lineStart,
      end: lineStart + replacement.length,
    };
  }
  if (action === 'link') {
    replacement = `[${selection || 'link text'}](https://)`;
    cursorStart = start + replacement.indexOf('https://');
    cursorEnd = cursorStart + 8;
  } else {
    const marker = action === 'bold' ? '**' : '*';
    const text = selection || (action === 'bold' ? 'bold text' : 'italic text');
    replacement = marker + text + marker;
    cursorStart = start + marker.length;
    cursorEnd = cursorStart + text.length;
  }
  return {
    value: value.slice(0, start) + replacement + value.slice(end),
    start: cursorStart,
    end: cursorEnd,
  };
}
export function summaryPreview(value: string) {
  return value
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[*_#`>]/g, '')
    .replace(/^\s*[-+]\s/gm, '')
    .replace(/\s+/g, ' ')
    .trim();
}
