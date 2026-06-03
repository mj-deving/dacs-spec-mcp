/** Response formatting + version-stamp helpers. Portable TS.
 *  Every tool/resource response is version-stamped with the pinned spec commit
 *  so a consumer can always see exactly which spec state produced the answer. */

import { specCommit, generatedAt } from "./index-loader.js";

/** The mandatory version stamp prepended to every response. */
export function versionStamp(): string {
  return `_Spec commit: ${specCommit()} | index ${generatedAt()}_`;
}

/** Shape of an MCP tool result (subset we use). The index signature keeps it
 *  structurally assignable to the SDK's CallToolResult type. */
export interface ToolResult {
  [x: string]: unknown;
  content: { type: "text"; text: string }[];
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}

/** A successful, version-stamped result carrying both human text and structured data. */
export function ok(text: string, structured?: Record<string, unknown>): ToolResult {
  const result: ToolResult = {
    content: [{ type: "text", text: `${versionStamp()}\n\n${text}` }],
  };
  if (structured) result.structuredContent = { specCommit: specCommit(), ...structured };
  return result;
}

/** A structured, actionable not-found result (isError) with a recovery hint. */
export function notFound(message: string, hint: string): ToolResult {
  return {
    content: [{ type: "text", text: `${versionStamp()}\n\nNot found: ${message}\n\nTry: ${hint}` }],
    structuredContent: { specCommit: specCommit(), error: "not_found", message, hint },
    isError: true,
  };
}
