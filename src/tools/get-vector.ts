/** dacs_get_conformance_vector — return one §14 conformance vector from the
 *  vendored dacs-verify pack (golden | candidate). Pure. */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getVector } from "../index-loader.js";
import { ok, notFound } from "../format.js";

const READ_ONLY = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

export function registerGetConformanceVector(server: McpServer): void {
  server.registerTool(
    "dacs_get_conformance_vector",
    {
      title: "Get DACS conformance vector",
      description: `Return one DACS conformance vector by id, from the (non-normative) dacs-verify conformance pack vendored into the index. Each vector pins a spec rule to a concrete expected result, so an implementer can check byte-for-byte agreement.

Status semantics:
  - "golden": byte-stable AND reference-verifier-accepted — no two conformant impls can disagree.
  - "candidate": single-impl so far (e.g. §11.2.1 dispute, §8.7 disclosure); cross-impl agreement pending a shared fixture.

Args:
  - id (string): vector id, e.g. "dispute-rule-swap-fail", "canon-key-order", "sig-roundtrip". See the dacs://vectors/manifest resource for the full list.

Returns: { id, area, spec, summary, status, want }, version-stamped.`,
      inputSchema: {
        id: z.string().min(1).describe('Vector id, e.g. "dispute-rule-swap-fail"'),
      },
      annotations: READ_ONLY,
    },
    async ({ id }) => {
      const v = getVector(id);
      if (!v) {
        return notFound(
          `no conformance vector with id "${id}"`,
          `read the dacs://vectors/manifest resource for the full vector list`,
        );
      }
      return ok(
        `Vector ${v.id} [${v.status}] — ${v.spec} (${v.area})\n${v.summary}\nwant: ${JSON.stringify(v.want)}`,
        { id: v.id, area: v.area, spec: v.spec, summary: v.summary, status: v.status, want: v.want },
      );
    },
  );
}
