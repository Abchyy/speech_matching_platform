import {
  CorpusIngestionError,
  createCanonicalDocument,
  type CanonicalDocument,
} from "./canonical-document";

export type ParsedCanonicalMarkdown = {
  document: CanonicalDocument;
  retrievalKeywords: string[];
};

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

function parseScalar(raw: string): string | boolean | null {
  const value = raw.trim();
  if (value === "" || value === "null" || value === "~") {
    return null;
  }
  if (value === "true") return true;
  if (value === "false") return false;
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

function parseFrontmatter(block: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const lines = block.split(/\r?\n/);
  let index = 0;

  while (index < lines.length) {
    const line = lines[index] ?? "";
    if (!line.trim() || line.trimStart().startsWith("#")) {
      index += 1;
      continue;
    }

    const match = line.match(/^([A-Za-z0-9_]+)\s*:\s*(.*)$/);
    if (!match) {
      throw new CorpusIngestionError(`无法解析 Canonical Markdown frontmatter: ${line}`);
    }

    const key = match[1]!;
    const rest = match[2]!;
    if (rest === "") {
      const list: string[] = [];
      let cursor = index + 1;
      while (cursor < lines.length) {
        const nested = lines[cursor] ?? "";
        const item = nested.match(/^\s+-\s+(.*)$/);
        if (!item) break;
        const parsed = parseScalar(item[1]!);
        list.push(typeof parsed === "string" ? parsed : String(parsed ?? ""));
        cursor += 1;
      }
      result[key] = list.length > 0 ? list : null;
      index = list.length > 0 ? cursor : index + 1;
      continue;
    }

    result[key] = parseScalar(rest);
    index += 1;
  }

  return result;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function asBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.length > 0);
}

function extractFullText(body: string, title: string): string {
  let text = body.replace(/^\uFEFF/, "").replace(/^\s+/, "").replace(/\s+$/, "");
  const heading = `# ${title}`;
  if (text.startsWith(heading)) {
    text = text.slice(heading.length).replace(/^\s+/, "");
  }
  if (!text) {
    throw new CorpusIngestionError("Canonical Markdown 缺少正文");
  }
  return text;
}

export function parseCanonicalMarkdown(markdown: string): ParsedCanonicalMarkdown {
  const matched = markdown.replace(/^\uFEFF/, "").match(FRONTMATTER_RE);
  if (!matched) {
    throw new CorpusIngestionError("Canonical Markdown 必须包含 YAML frontmatter");
  }

  const frontmatter = parseFrontmatter(matched[1] ?? "");
  const speechId = asString(frontmatter.speechId) ?? asString(frontmatter.id);
  const title = asString(frontmatter.title);
  const source = asString(frontmatter.source);

  if (!speechId || !title || !source) {
    throw new CorpusIngestionError("Canonical Markdown 必须包含 id/speechId、title、source");
  }

  const dateValue = frontmatter.date;
  const date = dateValue === null || dateValue === undefined ? null : asString(dateValue) ?? null;
  const retrievalKeywords = asStringList(
    frontmatter.retrieval_keywords ?? frontmatter.keywords,
  );

  const document = createCanonicalDocument({
    speechId,
    title,
    date,
    source,
    url: asString(frontmatter.url),
    fullText: extractFullText(matched[2] ?? "", title),
    sha256: asString(frontmatter.sha256),
    isDemoPlaceholder:
      asBoolean(frontmatter.isDemoPlaceholder) ?? asBoolean(frontmatter.is_demo_placeholder),
  });

  return { document, retrievalKeywords };
}
