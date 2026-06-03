/** dacs_get_artifact_schema — return the spec's DEFINING SECTION for an artifact.
 *  v1 serves the section prose (format:"prose"), NOT a JSON Schema, to avoid a
 *  second drift source. Pure. */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getSchemaEntry, getSection, allArtifactNames } from "../index-loader.js";
import { ok, notFound } from "../format.js";

const READ_ONLY = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

export function registerGetArtifactSchema(server: McpServer): void {
  server.registerTool(
    "dacs_get_artifact_schema",
    {
      title: "Get DACS artifact defining section",
      description: `Return the DACS spec's DEFINING SECTION for a signed artifact (Listing, IdentityBundle, AgreementDocument, SettlementEvidence, AttestationBundle, etc.).

IMPORTANT: this returns the spec's defining-section PROSE (format: "prose"), not a machine-validatable JSON Schema. DACS v0.1 defines artifact shapes in normative prose + field tables; deriving a JSON Schema would create a second, unblessed, drift-prone source — so v1 faithfully points at the spec section instead. Do NOT build a validator against this output; read it as the normative definition.

Args:
  - name (string): artifact name. Call with an unknown name to get the list of known artifacts.

Returns: { artifact, definingSection, format:"prose", body }, version-stamped.`,
      inputSchema: {
        name: z.string().min(1).describe("Artifact name, e.g. \"AgreementDocument\""),
      },
      annotations: READ_ONLY,
    },
    async ({ name }) => {
      const entry = getSchemaEntry(name);
      if (!entry) {
        return notFound(
          `no artifact named "${name}"`,
          `known artifacts: ${allArtifactNames().join(", ")}`,
        );
      }
      const s = getSection(entry.section);
      if (!s) {
        return notFound(
          `artifact "${name}" maps to §${entry.section} which is missing from the index`,
          `re-run \`bun run build-index\` (the defining section may have been renumbered)`,
        );
      }
      return ok(
        `${name} — defining section §${s.id} ${s.title} (PROSE, not JSON Schema):\n\n${s.body}`,
        { artifact: name, definingSection: s.id, format: "prose", title: s.title, body: s.body },
      );
    },
  );
}
