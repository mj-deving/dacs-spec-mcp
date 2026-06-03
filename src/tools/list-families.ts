/** dacs_list_rule_families — paginated list of derived rule families. Pure. */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { allFamilies } from "../index-loader.js";
import { ok } from "../format.js";
import { FAMILIES_PAGE_SIZE_DEFAULT, FAMILIES_PAGE_SIZE_MAX } from "../constants.js";

const READ_ONLY = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

export function registerListRuleFamilies(server: McpServer): void {
  server.registerTool(
    "dacs_list_rule_families",
    {
      title: "List DACS rule families",
      description: `List the DACS rule families (SE-*, HTLC-*, PC-*, RAV-*, CF-*, SIG-*, RT-*, ST-*, CH-*, VPC-*, GOV-*, PSP-*, AMEND-*, SR-*, …) with the section ids where each appears. Families are DERIVED from the spec text at build time, so the list reflects exactly what the pinned spec contains (a family discussed elsewhere but not yet in normative text will not appear — that is correct no-drift behaviour).

Use this to orient: discover which rule families exist and where to read them.

Args:
  - page (int ≥1, default 1)
  - page_size (int 1–100, default 20)

Returns: per family — name, description (curated where known), the rule tokens seen (e.g. HTLC-9), and the section ids. Version-stamped, with pagination metadata.`,
      inputSchema: {
        page: z.number().int().min(1).default(1).describe("1-based page number"),
        page_size: z
          .number()
          .int()
          .min(1)
          .max(FAMILIES_PAGE_SIZE_MAX)
          .default(FAMILIES_PAGE_SIZE_DEFAULT)
          .describe("Families per page (1–100)"),
      },
      annotations: READ_ONLY,
    },
    async ({ page, page_size }) => {
      const fams = allFamilies();
      const p = page ?? 1;
      const size = page_size ?? FAMILIES_PAGE_SIZE_DEFAULT;
      const total = fams.length;
      const start = (p - 1) * size;
      const pageItems = fams.slice(start, start + size);
      const hasMore = start + size < total;
      const text = pageItems
        .map((f) => `${f.family}-*  — ${f.description}\n  tokens: ${f.tokens.join(", ")}\n  sections: ${f.sections.map((s) => `§${s}`).join(", ")}`)
        .join("\n\n");
      return ok(
        `Rule families (page ${p}, ${pageItems.length} of ${total}):\n\n${text}`,
        { total, page: p, page_size: size, has_more: hasMore, families: pageItems },
      );
    },
  );
}
