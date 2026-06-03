/** dacs_get_section — return the full normative body of a spec section. Pure. */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getSection, getSectionAlternatives } from "../index-loader.js";
import { ok, notFound } from "../format.js";
import { SECTION_ID_RE } from "../constants.js";

const READ_ONLY = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

export function registerGetSection(server: McpServer): void {
  server.registerTool(
    "dacs_get_section",
    {
      title: "Get DACS spec section",
      description: `Return the full normative text of a single DACS spec section, verbatim from the pinned spec commit. Use when you know the section number (e.g. from dacs_search_rules).

Args:
  - section (string): dotted section id, e.g. "11.2.1", "9.5", "7". 1–4 numeric components.

Returns: the section's own body text (header → next numbered header), version-stamped. If the section has subsections, their ids are listed so you can drill down — the body is the section's own prose, not a recursive dump (keeps responses focused). NOTE: the human-readable "text" field is prefixed with the version stamp; the byte-verbatim section body (no stamp) is in structuredContent.body.

Example: section="11.2.1" → the DACS-X dispute section.
Errors: a missing section returns an actionable not-found result suggesting dacs_search_rules / dacs_list_rule_families.`,
      inputSchema: {
        section: z
          .string()
          .regex(SECTION_ID_RE, 'section must look like "11.2.1"')
          .describe('Dotted section id, e.g. "11.2.1"'),
      },
      annotations: READ_ONLY,
    },
    async ({ section }) => {
      const s = getSection(section);
      if (!s) {
        return notFound(
          `§${section} is not in the spec index`,
          `dacs_search_rules to find it by keyword, or dacs_list_rule_families for the rule-family map`,
        );
      }
      const childNote =
        s.children.length > 0
          ? `\n\nSubsections (fetch individually): ${s.children.map((c) => `§${c}`).join(", ")}`
          : "";
      // The DACS spec reuses §6.x/§7.x numbers; if this id also appears in another
      // part, name the alternative so the consumer knows which one they got.
      const alts = getSectionAlternatives(s.id).filter((a) => a.part !== s.part);
      const altNote =
        alts.length > 0
          ? `\n\nNote: §${s.id} also appears in: ${alts.map((a) => `"${a.part}" (${a.title})`).join("; ")}. This result is from "${s.part}".`
          : "";
      return ok(`§${s.id}  ${s.title}  [${s.part}]\n\n${s.body}${childNote}${altNote}`, {
        section: s.id,
        title: s.title,
        part: s.part,
        level: s.level,
        children: s.children,
        body: s.body,
        alternativeParts: alts.map((a) => ({ part: a.part, title: a.title })),
      });
    },
  );
}
