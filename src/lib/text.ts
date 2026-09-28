/** Sentence case for identifiers shown as labels: `awaiting_human` -> `Awaiting human`. */
export function sentenceCase(text: string): string {
  const spaced = text.replace(/[_-]+/g, " ").trim();
  return spaced ? spaced[0].toUpperCase() + spaced.slice(1) : spaced;
}
