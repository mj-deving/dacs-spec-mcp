/** registerAll — wire every tool + resource onto the server. Pure (no transport). */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerSearchRules } from "./tools/search-rules.js";
import { registerGetSection } from "./tools/get-section.js";
import { registerListRuleFamilies } from "./tools/list-families.js";
import { registerGetArtifactSchema } from "./tools/get-schema.js";
import { registerGetConformanceVector } from "./tools/get-vector.js";
import { registerResources } from "./resources.js";

export function registerAll(server: McpServer): void {
  registerSearchRules(server);
  registerGetSection(server);
  registerListRuleFamilies(server);
  registerGetArtifactSchema(server);
  registerGetConformanceVector(server);
  registerResources(server);
}
