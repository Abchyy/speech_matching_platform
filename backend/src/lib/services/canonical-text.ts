/** 连续 4 字及以上的 Canonical 子串视为原文片段；更短的共用字不按摘录处理。 */
export const MIN_CANONICAL_FRAGMENT_CHARS = 4;

function longestCanonicalFragment(haystack: string, canonical: string): string {
  let best = "";
  let previous = Array.from({ length: canonical.length + 1 }, () => 0);

  for (let i = 0; i < haystack.length; i += 1) {
    const current = Array.from({ length: canonical.length + 1 }, () => 0);
    for (let j = 0; j < canonical.length; j += 1) {
      if (haystack[i] !== canonical[j]) {
        continue;
      }
      const size = (previous[j] ?? 0) + 1;
      current[j + 1] = size;
      if (size > best.length) {
        best = haystack.slice(i - size + 1, i + 1);
      }
    }
    previous = current;
  }

  return best;
}

export function containsCanonicalFragment(
  text: string,
  canonical: string,
  minLength = MIN_CANONICAL_FRAGMENT_CHARS,
): boolean {
  if (!text || !canonical) {
    return false;
  }
  if (text.includes(canonical)) {
    return true;
  }
  return longestCanonicalFragment(text, canonical).length >= minLength;
}

export function isBlankCanonicalSafeText(text: string): boolean {
  return text.replace(/[\s，。；、：,.!！？?\-—（）()「」“”'"]/g, "").length === 0;
}

export function stripCanonicalFragments(text: string, canonical: string): string {
  let cleaned = text.trim().replace(/\s+/g, " ");
  while (containsCanonicalFragment(cleaned, canonical)) {
    const fragment = cleaned.includes(canonical)
      ? canonical
      : longestCanonicalFragment(cleaned, canonical);
    cleaned = cleaned.split(fragment).join(" ").replace(/\s+/g, " ").trim();
  }
  return cleaned;
}

export function stripAgainstCanonicalTexts(text: string, canonicalTexts: string[]): string {
  let cleaned = text.trim().replace(/\s+/g, " ");
  let changed = true;
  while (changed) {
    changed = false;
    for (const canonical of canonicalTexts) {
      if (containsCanonicalFragment(cleaned, canonical)) {
        cleaned = stripCanonicalFragments(cleaned, canonical);
        changed = true;
      }
    }
  }
  return cleaned;
}
