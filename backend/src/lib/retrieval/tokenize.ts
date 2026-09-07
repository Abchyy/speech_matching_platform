const CJK = /[\u3400-\u9fff]/;

export function tokenize(text: string): string[] {
  const tokens: string[] = [];
  const lowered = text.toLowerCase();
  for (const match of lowered.matchAll(/[a-z0-9_]{2,}/g)) {
    tokens.push(match[0]);
  }
  const chars = [...text].filter((char) => CJK.test(char));
  for (let index = 0; index < chars.length; index += 1) {
    const unigram = chars[index];
    if (unigram) tokens.push(unigram);
    const next = chars[index + 1];
    if (next) tokens.push(`${unigram}${next}`);
  }
  return tokens;
}

export function termFrequency(tokens: string[]): Map<string, number> {
  const tf = new Map<string, number>();
  for (const token of tokens) {
    tf.set(token, (tf.get(token) ?? 0) + 1);
  }
  return tf;
}
