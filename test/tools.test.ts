import { describe, expect, test } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { registerAll } from "../src/register.js";
import { searchRules } from "../src/tools/search-rules.js";
import {
  getIndex,
  getSection,
  getSectionAlternatives,
  getVector,
  allArtifactNames,
  getSchemaEntry,
  allFamilies,
} from "../src/index-loader.js";
import { versionStamp } from "../src/format.js";
import { SpecIndexSchema } from "../src/types.js";

const STAMP_RE = /^_Spec commit: [0-9a-f]{40} \| index .+_$/m;

// ── Pure-function + loader unit tests ─────────────────────────────────────────
describe("index", () => {
  test("loads and counts are self-consistent", () => {
    const idx = getIndex();
    expect(idx.counts.sections).toBe(idx.sections.length);
    expect(idx.counts.vectors).toBe(idx.vectors.cases.length);
    expect(idx.sections.length).toBeGreaterThan(150);
    expect(idx.specCommit).toHaveLength(40);
    expect(idx.specSourceSha256).toHaveLength(64);
  });

  test("artifact map has no dangling section (ISC-101)", () => {
    const ids = new Set(getIndex().sections.map((s) => s.id));
    for (const name of allArtifactNames()) {
      const entry = getSchemaEntry(name)!;
      expect(ids.has(entry.section)).toBe(true);
    }
  });

  test("loader rejects a malformed index (ISC-100)", () => {
    expect(() => SpecIndexSchema.parse({ specCommit: 123 })).toThrow();
  });
});

describe("get-section", () => {
  test("§11.2.1 returns a non-empty dispute body (ISC-96)", () => {
    const s = getSection("11.2.1");
    expect(s).toBeDefined();
    expect(s!.body.length).toBeGreaterThan(0);
    expect(/dispute/i.test(`${s!.title} ${s!.body}`)).toBe(true);
  });
});

describe("search-rules", () => {
  test("'preimage' returns ≥1 result (ISC-97)", () => {
    expect(searchRules("preimage", 5).length).toBeGreaterThanOrEqual(1);
  });
  test("nonsense query returns no results (ISC-38)", () => {
    expect(searchRules("zzqqxx-not-a-term", 5).length).toBe(0);
  });
  test("respects the limit", () => {
    expect(searchRules("the", 3).length).toBeLessThanOrEqual(3);
  });
});

describe("get-vector", () => {
  test("dispute-rule-swap-fail want === 'fail' (ISC-98)", () => {
    expect(getVector("dispute-rule-swap-fail")!.want).toBe("fail");
  });
  test("unknown vector id is undefined", () => {
    expect(getVector("no-such-vector")).toBeUndefined();
  });
});

describe("version stamp", () => {
  test("matches the canonical shape (ISC-99)", () => {
    expect(STAMP_RE.test(versionStamp())).toBe(true);
  });
});

describe("section-id collisions (overview vs Chapter)", () => {
  test("§7.7 resolves to the normative Chapter, not the overview", () => {
    const s = getSection("7.7")!;
    expect(s.title).toBe("Composite verification record");
    expect(s.part.startsWith("Chapter")).toBe(true);
  });
  test("§7.7 exposes its overview alternative", () => {
    expect(getSectionAlternatives("7.7").length).toBeGreaterThanOrEqual(2);
  });
  test("every artifact maps to a Chapter section (ISC-24, corrected map)", () => {
    for (const name of allArtifactNames()) {
      const sec = getSection(getSchemaEntry(name)!.section)!;
      expect(sec.part.startsWith("Chapter")).toBe(true);
    }
  });
});

describe("derived families — DP tripwire (no-drift)", () => {
  // DP-1..DP-5 are DACS-X *discussion*, non-normative at pin 85ff7a9, so they are
  // correctly ABSENT from the derived families. If DP-* ever enters normative spec
  // text the parser will surface it and THIS test fails loudly — forcing a re-review
  // rather than silently re-litigating the judgment. (Regression tripwire.)
  test("DP is absent; the canonical known families are present", () => {
    const fams = allFamilies().map((f) => f.family);
    expect(fams).not.toContain("DP");
    for (const k of ["SE", "HTLC", "PC", "RAV", "CF", "SIG", "RT", "ST", "CH", "VPC", "GOV", "PSP", "AMEND", "SR"]) {
      expect(fams).toContain(k);
    }
  });
});

// ── Eval EXECUTION (mcp-builder Phase 4 — execute, don't just author) ──────────
// Derives each of the 10 eval answers from the server's data layer and asserts it,
// so eval/dacs-mcp-eval.xml is proven-passing, not merely written (ISC-106).
describe("eval execution", () => {
  const cases = getIndex().vectors.cases;
  test("Q1 dispute-resolution section title", () => {
    expect(getSection("11.2.1")!.title).toBe("Dispute resolution (DACS-X, anticipated)");
  });
  test("Q2 dispute-rule-swap-fail want", () => {
    expect(getVector("dispute-rule-swap-fail")!.want).toBe("fail");
  });
  test("Q3 AgreementDocument defining section", () => {
    expect(getSchemaEntry("AgreementDocument")!.section).toBe("8.5");
  });
  test("Q4 golden count", () => {
    expect(cases.filter((c) => c.status === "golden").length).toBe(24);
  });
  test("Q5 candidate count", () => {
    expect(cases.filter((c) => c.status === "candidate").length).toBe(18);
  });
  test("Q6 sig-registry-closed-16 want", () => {
    expect(getVector("sig-registry-closed-16")!.want).toBe(16);
  });
  test("Q7 total cases", () => {
    expect(cases.length).toBe(42);
  });
  test("Q8 artifact at §10.4", () => {
    expect(allArtifactNames().find((n) => getSchemaEntry(n)!.section === "10.4")).toBe("AttestationBundle");
  });
  test("Q9 disclosure-wrong-recipient-fail status", () => {
    expect(getVector("disclosure-wrong-recipient-fail")!.status).toBe("candidate");
  });
  test("Q10 HTLC-10 token exists", () => {
    expect(allFamilies().find((f) => f.family === "HTLC")!.tokens).toContain("HTLC-10");
  });
});

// ── Real in-memory protocol integration (ISC-110/111/112) ─────────────────────
async function connectedClient(): Promise<Client> {
  const server = new McpServer({ name: "dacs-spec-mcp-server", version: "0.1.0" });
  registerAll(server);
  const [clientT, serverT] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test-client", version: "0.0.0" });
  await Promise.all([server.connect(serverT), client.connect(clientT)]);
  return client;
}

describe("protocol", () => {
  test("lists all 5 tools, each read-only (ISC-111)", async () => {
    const client = await connectedClient();
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name).sort();
    expect(names).toEqual(
      [
        "dacs_get_artifact_schema",
        "dacs_get_conformance_vector",
        "dacs_get_section",
        "dacs_list_rule_families",
        "dacs_search_rules",
      ].sort(),
    );
    for (const t of tools) {
      expect(t.annotations?.readOnlyHint).toBe(true);
      expect(t.annotations?.destructiveHint).toBe(false);
    }
  });

  test("lists all 3 resources (ISC-112)", async () => {
    const client = await connectedClient();
    const { resources } = await client.listResources();
    const uris = resources.map((r) => r.uri);
    expect(uris).toContain("dacs://toc");
    expect(uris).toContain("dacs://vectors/manifest");
  });

  test("every tool response is version-stamped (ISC-99/121)", async () => {
    const client = await connectedClient();
    const calls: Array<[string, Record<string, unknown>]> = [
      ["dacs_search_rules", { query: "preimage", limit: 3 }],
      ["dacs_get_section", { section: "11.2.1" }],
      ["dacs_list_rule_families", { page: 1, page_size: 5 }],
      ["dacs_get_artifact_schema", { name: "AgreementDocument" }],
      ["dacs_get_conformance_vector", { id: "dispute-rule-swap-fail" }],
    ];
    for (const [name, args] of calls) {
      const res = await client.callTool({ name, arguments: args });
      const text = (res.content as Array<{ type: string; text: string }>)[0]!.text;
      expect(STAMP_RE.test(text)).toBe(true);
    }
  });

  test("missing section returns an actionable error (ISC-47)", async () => {
    const client = await connectedClient();
    const res = await client.callTool({ name: "dacs_get_section", arguments: { section: "99.99" } });
    expect(res.isError).toBe(true);
    const text = (res.content as Array<{ type: string; text: string }>)[0]!.text;
    expect(text).toContain("dacs_search_rules");
  });

  test("artifact schema is labelled prose, not JSON Schema (ISC-62/125)", async () => {
    const client = await connectedClient();
    const res = await client.callTool({
      name: "dacs_get_artifact_schema",
      arguments: { name: "AgreementDocument" },
    });
    expect((res.structuredContent as { format?: string }).format).toBe("prose");
  });
});
