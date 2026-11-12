import { parseColors } from '../dialogs/colorCodes';

export function coloredTitle(text: string, showColors = true) {
  return showColors && /\|(?:c[\da-f]{8}|r|n)/i.test(text) ? parseColors(text).map(run => run.text).join('') : text;
}

/** Rendering only: clipboard, formulas and editors keep the original string. */
export function ColoredText({ text, showColors = true }: { text: string; showColors?: boolean }) {
  if (!showColors || !/\|(?:c[\da-f]{8}|r|n)/i.test(text)) return <span>{text}</span>;
  return <span>{parseColors(text).map((run, index) => <span key={index} style={run.color ? { color: `#${run.color.slice(2)}` } : undefined}>{run.text}</span>)}</span>;
}
