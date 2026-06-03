#!/usr/bin/env bun
/** server.ts — the ONLY transport-coupled file. stdio entry point.
 *  A future Cloudflare Workers transport is a sibling entry file over the same
 *  registerAll() + bundled index; nothing here leaks into tool/resource code. */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerAll } from "./register.js";
import { SERVER_NAME, SERVER_VERSION } from "./constants.js";
import { specCommit } from "./index-loader.js";

const INSTRUCTIONS = `Read-only reference for the DACS (Demos Agent Commerce Standards) v0.1 specification, served from a pinned spec commit (${specCommit().slice(0, 7)}) — every response is version-stamped and cannot drift from the spec.

Tool routing:
- dacs_search_rules — find sections by keyword when you don't know the § number.
- dacs_get_section — read a section's full normative text when you DO know the § number.
- dacs_list_rule_families — orient: which rule families (SE-*, HTLC-*, …) exist and where.
- dacs_get_artifact_schema — the defining section (prose) for a signed artifact (Listing, AgreementDocument, …).
- dacs_get_conformance_vector — one §14 conformance vector (golden/candidate) by id.

Resources: dacs://toc (section tree), dacs://schemas/{name} (artifact sections), dacs://vectors/manifest (conformance pack).

This server is non-normative ecosystem tooling; the steward (KyneSys) owns the normative spec.`;

const server = new McpServer(
  { name: SERVER_NAME, version: SERVER_VERSION },
  { instructions: INSTRUCTIONS },
);

registerAll(server);

const transport = new StdioServerTransport();
await server.connect(transport);
