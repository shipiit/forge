/** Indent a multi-line block for a YAML literal scalar. */
export function block(text: string, indent: string): string {
  return text
    .replace(/\r/g, '')
    .split('\n')
    .map((l) => `${indent}${l}`)
    .join('\n');
}
