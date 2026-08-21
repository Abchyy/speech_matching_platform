/** 连续 4 字及以上的 Canonical 子串视为原文片段；更短的共用字不按摘录处理。 */
export const MIN_CANONICAL_FRAGMENT_CHARS = 4;

const STRIP_GAP = "\u001E";
const CJK = /[\u3400-\u9fff]/;
const LEADING_JOINERS = /^(以及|并且|而且|或者|或是|并|和|与|及|或|且)/;
const TRAILING_JOINERS = /(以及|并且|而且|或者|或是|并|和|与|及|或|且)$/;
const TRAILING_LIGHT_PUNCT = /[，、：,;]$/;
const LEADING_LIGHT_PUNCT = /^[，、：,;]/;
const HEADING_START = /^[一二三四五六七八九十]+、/;
const HEADING_END = /[一二三四五六七八九十]+、$/;
const PREP_END = /(在|对|就|从|以)$/;
const LOC_START = /^(层面|方面|中|上|下|时|过程中)/;
const SEMANTIC_HOLE_RE =
  /(?:将|把|以)(?:与|和|及)(?:融合|结合|统一|对接|联动|贯通)|(?<![现所])在的[\u3400-\u9fff]*?(?:时代)?背景|(?:对|就|从)的[\u3400-\u9fff]+(?:下|中|里|上)/;

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

function normalizeHorizontalWhitespace(text: string): string {
  return text.replace(/[^\S\n]+/g, " ").replace(/ *\n */g, "\n").trim();
}

function repairJunction(left: string, right: string): string {
  let leading = left.replace(/[^\S\n]+$/g, "");
  let trailing = right.replace(/^[^\S\n]+/g, "");

  if (!trailing) {
    return leading.replace(/[，、：,;]+$/g, "");
  }
  if (!leading) {
    return trailing.replace(/^[，、：,;]+/g, "").replace(LEADING_JOINERS, "");
  }

  if (TRAILING_LIGHT_PUNCT.test(leading) && LEADING_JOINERS.test(trailing) && !HEADING_END.test(leading)) {
    leading = leading.replace(/[，、,]$/g, "");
  }
  if (HEADING_END.test(leading) && LEADING_JOINERS.test(trailing)) {
    trailing = trailing.replace(LEADING_JOINERS, "");
  }
  if (TRAILING_JOINERS.test(leading) && LEADING_LIGHT_PUNCT.test(trailing)) {
    leading = leading.replace(TRAILING_JOINERS, "");
  }
  if (TRAILING_LIGHT_PUNCT.test(leading) && LEADING_LIGHT_PUNCT.test(trailing)) {
    trailing = trailing.replace(/^[，、,;]+/, "");
  }
  if (/[。！？]$/.test(leading) && /^[。！？]/.test(trailing)) {
    trailing = trailing.replace(/^[。！？]+/, "");
  }
  if (PREP_END.test(leading) && LOC_START.test(trailing)) {
    leading = leading.replace(PREP_END, "");
    trailing = trailing.replace(LOC_START, "");
    leading = leading.replace(/[，、：,;]+$/g, "");
    trailing = trailing.replace(/^[，、：,;]+/g, "");
  }
  if (HEADING_START.test(trailing)) {
    leading = leading.replace(/[，、：,;]+$/g, "");
    return `${leading.replace(/\n+$/, "")}\n${trailing}`;
  }

  const leftLast = leading.slice(-1);
  const rightFirst = trailing[0] ?? "";
  if (CJK.test(leftLast) && CJK.test(rightFirst)) {
    return leading + trailing;
  }
  if (TRAILING_LIGHT_PUNCT.test(leading) || LEADING_LIGHT_PUNCT.test(trailing) || LEADING_JOINERS.test(trailing)) {
    return leading + trailing;
  }
  if (leftLast === "\n" || rightFirst === "\n") {
    return `${leading.replace(/\n+$/, "\n")}${trailing.replace(/^\n+/, "")}`;
  }
  return `${leading} ${trailing}`.replace(/ {2,}/g, " ");
}

function cleanupReadableText(text: string): string {
  return text
    .replace(/[^\S\n]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/ +([，。；、：])/g, "$1")
    .replace(/([，。；、：]) +/g, "$1")
    .replace(/、+/g, "、")
    .replace(/，+/g, "，")
    .replace(/。+/g, "。")
    .replace(/([^一二三四五六七八九十])、(?=以及|并且|而且|或者|或是|并|和|与|及|或|且)/g, "$1")
    .replace(/[一二三四五六七八九十]+、(?=[一二三四五六七八九十]+、)/g, "")
    .replace(/^[一二三四五六七八九十]+、\s*$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/^[，、：;]+/, "")
    .trim();
}

export function hasSemanticHole(text: string): boolean {
  return SEMANTIC_HOLE_RE.test(text);
}

function dropBrokenSentences(text: string): string {
  if (!text) {
    return text;
  }
  const kept = text.split("\n").map((line) => {
    if (!hasSemanticHole(line)) {
      return line;
    }
    const sentences = line.match(/[^。！？!?]+[。！？!?]?/g) ?? [line];
    return sentences.filter((sentence) => !hasSemanticHole(sentence)).join("");
  });
  return cleanupReadableText(kept.join("\n"));
}

export function repairStrippedText(text: string): string {
  const parts = text.split(STRIP_GAP);
  let merged = parts[0] ?? "";
  for (let index = 1; index < parts.length; index += 1) {
    merged = repairJunction(merged, parts[index] ?? "");
  }
  return dropBrokenSentences(cleanupReadableText(merged));
}

/** 剥离后非引用文本不应留下挖空空格、顿号连词残缺或连续标点。 */
export function hasStripArtifacts(text: string): boolean {
  if (!text) {
    return false;
  }
  if (/ {2,}/.test(text)) {
    return true;
  }
  if (/[\u3400-\u9fff] [\u3400-\u9fff]/.test(text)) {
    return true;
  }
  if (/[，。；、：]\s+[，。；、：]/.test(text)) {
    return true;
  }
  if (/[、，]\s*(以及|并且|而且|或者|或是|并|和|与|及|或|且)/.test(text)) {
    return true;
  }
  if (/[、，：]{2,}/.test(text)) {
    return true;
  }
  if (/^[、，：]|[、，：]$/.test(text)) {
    return true;
  }
  if (hasSemanticHole(text)) {
    return true;
  }
  return false;
}

export function stripCanonicalFragments(text: string, canonical: string): string {
  let cleaned = normalizeHorizontalWhitespace(text);
  for (let attempt = 0; attempt < 16; attempt += 1) {
    if (!containsCanonicalFragment(cleaned, canonical)) {
      return repairStrippedText(cleaned);
    }
    const fragment = cleaned.includes(canonical)
      ? canonical
      : longestCanonicalFragment(cleaned, canonical);
    cleaned = repairStrippedText(cleaned.split(fragment).join(STRIP_GAP));
  }
  return repairStrippedText(cleaned);
}

export function stripAgainstCanonicalTexts(text: string, canonicalTexts: string[]): string {
  let cleaned = normalizeHorizontalWhitespace(text);
  for (let attempt = 0; attempt < 16; attempt += 1) {
    let stripped = false;
    for (const canonical of canonicalTexts) {
      if (containsCanonicalFragment(cleaned, canonical)) {
        cleaned = stripCanonicalFragments(cleaned, canonical);
        stripped = true;
      }
    }
    cleaned = repairStrippedText(cleaned);
    const stillLeaking = canonicalTexts.some((canonical) => containsCanonicalFragment(cleaned, canonical));
    if (!stripped && !stillLeaking) {
      break;
    }
    if (!stillLeaking) {
      break;
    }
  }
  return cleaned;
}
