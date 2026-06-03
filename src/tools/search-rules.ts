/** dacs_search_rules — full-text search across spec section titles + bodies.
 *  Pure: operates only on the in-memory index; no transport/IO awareness. */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { allSections } from "../index-loader.js";
import { ok } from "../format.js";
import {
  SEARCH_EXCERPT_CHARS,
  SEARCH_LIMIT_MIN,
  SEARCH_LIMIT_MAX,
  SEARCH_LIMIT_DEFAULT,
} from "../constants.js";

export interface SearchHit {
  id: string;
  title: string;
  level: number;
  score: number;
  excerpt: string;
}

const READ_ONLY = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

/** Rank sections by term frequency (title weighted 3×, body 1×). All query terms
 *  must appear (AND). Deterministic: ties broken by section id order. */
export function searchRules(query: string, limit: number): SearchHit[] {
  const terms = query.toLowerCase().split(/\s+/).filter((t) => t.length > 0);
  if (terms.length === 0) return [];
  const hits: SearchHit[] = [];
  for (const s of allSections()) {
    const title = s.title.toLowerCase();
    const body = s.body.toLowerCase();
    let score = 0;
    let allPresent = true;
    for (const t of terms) {
      // Heuristic term-frequency (substring count, title weighted 3×). Counts
      // substrings, not word boundaries — a relevance ranking signal, not exact TF.
      const inTitle = title.split(t).length - 1;
      const inBody = body.split(t).length - 1;
      if (inTitle === 0 && inBody === 0) {
        allPresent = false;
        break;
      }
      score += inTitle * 3 + inBody;
    }
    if (!allPresent) continue;
    // Anchor the excerpt on the EARLIEST occurrence of any query term (AND-matching
    // guarantees all are present), not just the first term.
    const positions = terms.map((t) => body.indexOf(t)).filter((i) => i >= 0);
    const anchor = positions.length > 0 ? Math.min(...positions) : 0;
    const start = Math.max(0, anchor - 40);
    const slice = s.body.slice(start, start + SEARCH_EXCERPT_CHARS);
    const excerpt =
      (start > 0 ? "…" : "") +
      slice.replace(/\s+/g, " ").trim() +
      (start + SEARCH_EXCERPT_CHARS < s.body.length ? "…" : "");
    hits.push({ id: s.id, title: s.title, level: s.level, score, excerpt });
  }
  hits.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  return hits.slice(0, limit);
}

export function registerSearchRules(server: McpServer): void {
  server.registerTool(
    "dacs_search_rules",
    {
      title: "Search DACS spec rules",
      description: `Full-text search across the DACS (Demos Agent Commerce Standards) v0.1 specification — every section title and body. Use this when you know WHAT you're looking for (a concept, a rule, a mechanism) but not the section number.

Args:
  - query (string, ≥2 chars): space-separated terms; ALL must appear (AND match). e.g. "preimage front-running", "ofac negative match", "canonical decimal".
  - limit (int 1–20, default 5): max results.

Returns: ranked matches, each with the section id (use dacs_get_section to read the full normative text), title, and a short excerpt. Results are version-stamped with the spec commit.

Example: query="preimage" → finds the HTLC preimage front-running threat material. Then call dacs_get_section with the returned id.
Don't use when: you already know the section number (use dacs_get_section) or want the family list (use dacs_list_rule_families).`,
      inputSchema: {
        query: z.string().min(2, "query must be at least 2 characters").describe("Search terms (AND-matched)"),
        limit: z
          .number()
          .int()
          .min(SEARCH_LIMIT_MIN)
          .max(SEARCH_LIMIT_MAX)
          .default(SEARCH_LIMIT_DEFAULT)
          .describe("Max results (1–20)"),
      },
      annotations: READ_ONLY,
    },
    async ({ query, limit }) => {
      const hits = searchRules(query, limit ?? SEARCH_LIMIT_DEFAULT);
      if (hits.length === 0) {
        return ok(`No sections matched "${query}". Try fewer or broader terms, or dacs_list_rule_families.`, {
          query,
          count: 0,
          hits: [],
        });
      }
      const text = hits
        .map((h) => `§${h.id}  ${h.title}\n  ${h.excerpt}`)
        .join("\n\n");
      return ok(`${hits.length} match(es) for "${query}":\n\n${text}`, { query, count: hits.length, hits });
    },
  );
}
