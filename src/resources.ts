/** The 3 read-only resources: dacs://toc, dacs://schemas/{name}, dacs://vectors/manifest.
 *  Resource handlers are equally pure (no fs/Bun/network) per ISC-139. */

import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  getIndex,
  allSections,
  getSchemaEntry,
  getSection,
  allArtifactNames,
} from "./index-loader.js";
import { versionStamp } from "./format.js";

export function registerResources(server: McpServer): void {
  // dacs://toc — the section tree (id · level · title).
  server.registerResource(
    "toc",
    "dacs://toc",
    {
      title: "DACS spec table of contents",
      description: "The DACS v0.1 §-tree: every section id, depth, and title from the pinned spec.",
      mimeType: "text/markdown",
    },
    async (uri) => {
      const lines = allSections().map((s) => `${"  ".repeat(s.level - 1)}- §${s.id} ${s.title}`);
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "text/markdown",
            text: `${versionStamp()}\n\n# DACS Spec — Table of Contents\n\n${lines.join("\n")}`,
          },
        ],
      };
    },
  );

  // dacs://schemas/{name} — artifact defining-section (prose), templated + listable.
  server.registerResource(
    "artifact-schema",
    new ResourceTemplate("dacs://schemas/{name}", {
      list: async () => ({
        resources: allArtifactNames().map((name) => ({
          uri: `dacs://schemas/${name}`,
          name,
          mimeType: "text/markdown",
        })),
      }),
    }),
    {
      title: "DACS artifact defining sections",
      description: "Per-artifact defining-section prose (format: prose, not JSON Schema).",
      mimeType: "text/markdown",
    },
    async (uri, variables) => {
      const name = String(variables.name);
      const entry = getSchemaEntry(name);
      const section = entry ? getSection(entry.section) : undefined;
      const text = section
        ? `${versionStamp()}\n\n# ${name} — §${section.id} ${section.title} (PROSE)\n\n${section.body}`
        : `${versionStamp()}\n\nUnknown artifact "${name}". Known: ${allArtifactNames().join(", ")}`;
      return { contents: [{ uri: uri.href, mimeType: "text/markdown", text }] };
    },
  );

  // dacs://vectors/manifest — the vendored conformance MANIFEST (surfaces + cases).
  server.registerResource(
    "vectors-manifest",
    "dacs://vectors/manifest",
    {
      title: "DACS conformance vector manifest",
      description: "The non-normative dacs-verify conformance pack (golden + candidate vectors) vendored into the index.",
      mimeType: "application/json",
    },
    async (uri) => {
      const idx = getIndex();
      const payload = {
        versionStamp: versionStamp(),
        specCommit: idx.specCommit,
        vectorsSource: idx.vectorsSource,
        surfaces: idx.vectors.surfaces,
        cases: idx.vectors.cases,
      };
      return {
        contents: [
          { uri: uri.href, mimeType: "application/json", text: JSON.stringify(payload, null, 2) },
        ],
      };
    },
  );
}
