/**
 * RSS/Atom collector (Phase 8). Fetches one configured feed and parses
 * it into RawNewsItem[].
 *
 * Parsing is a small, self-contained regex-based field extractor, not
 * `HTMLRewriter` — HTMLRewriter is an HTML tokenizer, and real-world
 * Atom/YouTube feeds use namespaced, sometimes self-closing tags
 * (`<media:thumbnail url="..."/>`, `<yt:videoId>`) that HTML's fixed
 * void-element list does not treat as self-closing, which can silently
 * swallow sibling content. RSS/Atom's tag structure is regular and
 * well-known enough that a small, deterministic regex extractor is both
 * simpler to reason about and simpler to unit test (a plain XML string
 * fixture in, an exact RawNewsItem[] out — no streaming Response needed).
 *
 * No AI anywhere in this file — structural extraction only.
 */
import { canonicalizeUrl, CollectorFetchResult, RawNewsItem, SourceConfig } from "./base";

export type FetchImpl = typeof fetch;

function stripCdata(text: string): string {
  const m = text.match(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/);
  return m?.[1] ?? text;
}

function decodeXmlEntities(text: string): string {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function cleanFieldText(raw: string): string {
  return decodeXmlEntities(stripCdata(raw.trim())).replace(/\s+/g, " ").trim();
}

function extractBlocks(xml: string, tagName: string): string[] {
  const re = new RegExp(`<${tagName}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tagName}>`, "gi");
  const blocks: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = re.exec(xml)) !== null) {
    blocks.push(match[1]!);
  }
  return blocks;
}

function extractTagText(block: string, tagName: string): string | null {
  const re = new RegExp(`<${tagName}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tagName}>`, "i");
  const match = block.match(re);
  if (!match) return null;
  const text = cleanFieldText(match[1]!);
  return text || null;
}

function extractSelfClosingAttr(block: string, tagName: string, attrName: string): string | null {
  const re = new RegExp(`<${tagName}\\s+[^>]*\\b${attrName}=["']([^"']*)["']`, "i");
  const match = block.match(re);
  return match ? decodeXmlEntities(match[1]!) : null;
}

function extractAtomLink(block: string): string | null {
  // Prefer rel="alternate", fall back to the first <link href="...">.
  const linkTags = block.match(/<link\b[^>]*\/?>/gi) ?? [];
  let fallback: string | null = null;
  for (const tag of linkTags) {
    const href = tag.match(/href=["']([^"']*)["']/i)?.[1];
    if (!href) continue;
    if (!fallback) fallback = href;
    if (/rel=["']alternate["']/i.test(tag)) return decodeXmlEntities(href);
  }
  return fallback ? decodeXmlEntities(fallback) : null;
}

function extractAuthor(block: string): string | null {
  const nameMatch = block.match(/<author(?:\s[^>]*)?>[\s\S]*?<name>([\s\S]*?)<\/name>[\s\S]*?<\/author>/i);
  if (nameMatch) return cleanFieldText(nameMatch[1]!) || null;
  const authorBlock = extractTagText(block, "author");
  if (authorBlock) return authorBlock; // RSS <author>name@example.com (Name)</author> or plain text
  const creator = extractTagText(block, "dc:creator");
  return creator;
}

function extractThumbnail(block: string): string | null {
  return (
    extractSelfClosingAttr(block, "media:thumbnail", "url") ??
    extractSelfClosingAttr(block, "enclosure", "url") ??
    extractSelfClosingAttr(block, "itunes:image", "href")
  );
}

function extractCategory(block: string): string | null {
  const withText = extractTagText(block, "category");
  if (withText) return withText;
  return extractSelfClosingAttr(block, "category", "term");
}

/** RSS `<pubDate>` is RFC 822 (e.g. "Wed, 15 Jul 2026 09:00:00 GMT"),
 * Atom `<published>`/`<updated>` is ISO 8601 — the existing (unmodified)
 * `EventNormalizer.date()` in events.ts only recognizes a handful of
 * plain-date formats plus an ISO-prefixed timestamp, not RFC 822. To
 * keep every feed's `publishedAt` compatible with that downstream
 * normalizer without touching it, dates are converted to ISO 8601 here
 * at the source using JS's own RFC-822/ISO-aware Date parser. */
function toIsoDate(rawText: string): string | null {
  const parsed = new Date(rawText);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function parseOneBlock(block: string, isAtom: boolean, source: SourceConfig): RawNewsItem | null {
  const title = extractTagText(block, "title") ?? extractTagText(block, "media:title");
  const url = isAtom ? extractAtomLink(block) : extractTagText(block, "link");
  if (!title || !url) return null;

  const summary =
    extractTagText(block, "summary") ??
    extractTagText(block, "description") ??
    extractTagText(block, "media:description") ??
    "";

  const rawPublishedAt =
    extractTagText(block, "pubDate") ??
    extractTagText(block, "published") ??
    extractTagText(block, "updated") ??
    null;
  const publishedAt = rawPublishedAt ? toIsoDate(rawPublishedAt) : null;

  return {
    title,
    summary,
    url,
    canonicalUrl: canonicalizeUrl(url),
    publishedAt,
    author: extractAuthor(block),
    thumbnail: extractThumbnail(block),
    category: extractCategory(block),
    rawContent: block,
    sourceId: source.id,
    sourceName: source.name,
    sourceTier: source.tier,
  };
}

/** Parses a full RSS 2.0 or Atom XML document into RawNewsItem[]. Auto-
 * detects RSS `<item>` vs Atom `<entry>` blocks. Returns [] (not an
 * error) for a well-formed-but-empty feed. */
export function parseFeedXml(xml: string, source: SourceConfig): RawNewsItem[] {
  const isRss = /<rss[\s>]/i.test(xml) || /<channel[\s>]/i.test(xml);
  const isAtomRoot = /<feed[\s>]/i.test(xml);
  const blocks = isRss ? extractBlocks(xml, "item") : extractBlocks(xml, "entry");
  const isAtom = !isRss && isAtomRoot;

  if (!isRss && !isAtomRoot) {
    throw new Error("Không nhận diện được định dạng feed (không phải RSS lẫn Atom).");
  }

  const items: RawNewsItem[] = [];
  for (const block of blocks) {
    const item = parseOneBlock(block, isAtom, source);
    if (item) items.push(item);
  }
  return items;
}

function withTimeout(ms: number): { signal: AbortSignal; cancel: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return {
    signal: controller.signal,
    cancel: () => clearTimeout(timer),
  };
}

/** Fetches and parses one RSS/Atom source, with timeout + retry per its
 * SourceConfig, classifying the outcome for Collector Health. Never
 * throws — every failure mode becomes a CollectorFetchResult with a
 * non-"healthy" status instead. */
export async function fetchRssFeed(
  source: SourceConfig,
  fetchImpl: FetchImpl = fetch,
): Promise<CollectorFetchResult> {
  let lastError: { status: import("./base").CollectorHealthStatus; message: string } | null = null;
  let retryCount = 0;

  for (let attempt = 0; attempt <= source.retry; attempt++) {
    if (attempt > 0) retryCount += 1;
    const { signal, cancel } = withTimeout(source.timeoutMs);
    const started = Date.now();
    try {
      const response = await fetchImpl(source.feed, { signal });
      const responseTimeMs = Date.now() - started;
      cancel();

      if (response.status === 404) {
        lastError = { status: "http_404", message: `HTTP 404 từ ${source.feed}` };
        continue;
      }
      if (!response.ok) {
        lastError = { status: "http_error", message: `HTTP ${response.status} từ ${source.feed}` };
        continue;
      }

      const xml = await response.text();
      try {
        const items = parseFeedXml(xml, source);
        return {
          sourceId: source.id,
          sourceName: source.name,
          status: "healthy",
          items,
          responseTimeMs,
          retryCount,
          errorMessage: null,
        };
      } catch (parseErr) {
        lastError = {
          status: "parsing_error",
          message: parseErr instanceof Error ? parseErr.message : String(parseErr),
        };
        continue;
      }
    } catch (fetchErr) {
      cancel();
      const isAbort = fetchErr instanceof Error && fetchErr.name === "AbortError";
      lastError = {
        status: isAbort ? "timeout" : "http_error",
        message: fetchErr instanceof Error ? fetchErr.message : String(fetchErr),
      };
    }
  }

  return {
    sourceId: source.id,
    sourceName: source.name,
    status: lastError?.status ?? "http_error",
    items: [],
    responseTimeMs: null,
    retryCount,
    errorMessage: lastError?.message ?? "Không rõ lỗi.",
  };
}

