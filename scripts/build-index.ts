#!/usr/bin/env bun
/**
 * build-index.ts — the no-drift core (build-time only).
 *
 * Emits `src/generated/spec-index.json` from the DACS spec at a PINNED commit and
 * a VENDORED snapshot of the dacs-verify conformance MANIFEST. The only code that
 * reads the live spec; the server loads the generated JSON via a static import.
 *
 * Drift impossibility rests on:
 *   1. The spec is read from the PINNED GIT BLOB (`git show <pin>:spec/...`), not the
 *      working tree — a dirty/checked-out tree cannot influence the index (M2).
 *   2. specSourceSha256 — SHA-256 of those pinned bytes; check-index re-derives it.
 *   3. Vectors are vendored in-repo (vendor/dacs-verify-MANIFEST.json) so build + CI
 *      are hermetic — no dependency on a sibling repo at a fixed $HOME path (C1).
 *   4. Deterministic extraction: same inputs => byte-identical output (modulo
 *      generatedAt), so check-index's rebuild-and-deep-equal proves output faithful (H1).
 *
 * `buildIndex()` is exported so check-index.ts can rebuild in-memory and compare.
 * Node/git/fs/Bun APIs are allowed HERE (dev tooling); never in src/.
 */

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { homedir } from "node:os";

// ── Configuration (pin lives here; override paths via env for CI) ──────────────
export const PINNED_COMMIT = "85ff7a92ba3ee12e5e46ffe9346250fa8b892115";
const HOME = homedir();
const SPEC_REPO = process.env.DACS_SPEC_REPO ?? resolve(HOME, "projects/DACS-standard/repo");
const SPEC_PATH_IN_REPO = "spec/SPECIFICATION.md";
// Vendored snapshot (hermetic). Override only for re-vendoring.
const VECTORS_FILE = process.env.DACS_VECTORS_FILE ?? resolve(import.meta.dir, "../vendor/dacs-verify-MANIFEST.json");
const OUT_FILE = resolve(import.meta.dir, "../src/generated/spec-index.json");

const ATTRIBUTION =
  "DACS (Demos Agent Commerce Standards) spec © 2026 KyneSys Labs and the DACS authors — MIT License. Served verbatim, non-normative reproduction.";

// Curated artifact → defining-section map. Each § is verified by title against the
// pinned spec (build fails on a dangling map). The collision-prone §7.5/§7.7 resolve
// to the normative Chapter via the loader's chapter-preference. Fixed order.
const ARTIFACT_SECTIONS: ReadonlyArray<readonly [string, string]> = [
  ["ClaimReference", "6.3.1"], // "Identity claim reference scheme"
  ["IdentityBundle", "6.3.2"], // "Identity bundle"
  ["Listing", "6.3.4"], // "Service listing"
  ["VerifyResult", "7.5"], // "VerifyResult" (Chapter 7; collides w/ front-matter §7.5)
  ["CompositeVerificationRecord", "7.7"], // "Composite verification record" (Chapter 7)
  ["AgreementDocument", "8.5"], // "Agreement document"
  ["ChannelMessage", "8.3.3"], // "Message envelope (substrate-independent)"
  ["SettlementEvidence", "9.7"], // "Settlement evidence"
  ["EntitlementRecord", "9.6.2"], // "deliver-entitlement"
  ["AttestationBundle", "10.4"], // "Attestation bundle"
  ["ReputationRecord", "10.5"], // "Reputation derivation"
  ["RatingRecord", "10.6"], // "The rate phase (optional)"
];

const FAMILY_DESCRIPTIONS: Record<string, string> = {
  SE: "Settlement evidence rules", PC: "Payment-contract rules",
  HTLC: "Hashed-timelock cross-chain swap rules", RAV: "Rail-availability rules",
  CF: "Canonical-form rules", SIG: "Signature domain-separation rules",
  RT: "Rating-bounds rules", ST: "Session-state transition rules", CH: "Channel rules",
  VPC: "Verification-policy / claim-mapping rules", GOV: "Governance rules",
  PSP: "Provider-screening rules", DP: "DACS-X dispute rules", AMEND: "Amendment rules",
  SR: "Substrate-requirement rules", PIPE: "Pipeline-executor rules", CD: "Canonical-decimal rules",
  CCI: "Cross-claim-identity contexts", GCR: "Governance-controlled routine rules",
};

const FAMILY_DENYLIST = new Set([
  "SHA", "UTF", "ES", "ASL", "ERC", "BIP", "HKDF", "AES", "RFC", "ISO", "HTTP",
  "USD", "USDC", "EUR", "MICA", "MSB", "EU", "US", "JSON", "TLS", "DNS", "API",
  "ID", "URL", "PII", "FX", "KYC", "AML", "JCS", "UTC", "ASCII", "NFC", "X",
]);

interface SectionEntry { id: string; level: number; title: string; part: string; body: string; children: string[]; }
interface FamilyEntry { family: string; description: string; tokens: string[]; sections: string[]; }
interface SchemaEntry { artifact: string; section: string; }

function sha256(bytes: string): string {
  return createHash("sha256").update(bytes, "utf8").digest("hex");
}

/** Read a file as it exists AT the pinned commit (working-tree-independent). */
function readPinnedBlob(repo: string, commit: string, pathInRepo: string): string {
  return execFileSync("git", ["-C", repo, "show", `${commit}:${pathInRepo}`], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
}

/**
 * Parse `## N`, `### N.N`, … numbered headers into leaf-own-body sections.
 * Fence-aware with marker tracking: a fence only closes on the SAME marker char it
 * opened with (``` vs ~~~), so mixed/nested fences can't mis-toggle (H3). Headers
 * are matched only at column 0 (`^#`), so 4-space-indented code samples never parse.
 */
function parseSections(spec: string): SectionEntry[] {
  const lines = spec.split("\n");
  const headerRe = /^(#{2,6})\s+(\d+(?:\.\d+)*)\.?\s+(.+?)\s*$/;
  const partRe = /^##\s+(.+?)\s*$/; // any level-2 header delimits a "part"
  const fenceRe = /^\s*(`{3,}|~{3,})/;

  const raw: { id: string; level: number; title: string; part: string; start: number }[] = [];
  let inFence = false;
  let fenceChar = "";
  let currentPart = "(front matter)";
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const fm = fenceRe.exec(line);
    if (fm) {
      const ch = fm[1]![0]!;
      if (!inFence) {
        inFence = true;
        fenceChar = ch;
      } else if (ch === fenceChar) {
        inFence = false;
        fenceChar = "";
      }
      continue;
    }
    if (inFence) continue;
    const pm = partRe.exec(line);
    if (pm) currentPart = pm[1]!.trim(); // ## headers (numbered or "Chapter N — …") set the part
    const m = headerRe.exec(line);
    if (m) {
      const id = m[2]!;
      raw.push({ id, level: id.split(".").length, title: m[3]!.trim(), part: currentPart, start: i });
    }
  }

  const sections: SectionEntry[] = raw.map((h, idx) => {
    const end = idx + 1 < raw.length ? raw[idx + 1]!.start : lines.length;
    const body = lines.slice(h.start + 1, end).join("\n").trim();
    return { id: h.id, level: h.level, title: h.title, part: h.part, body, children: [] };
  });

  // Wire children to the NEAREST existing ancestor (walk up if a literal parent
  // header is missing), so deep sections never strand off the tree (M1).
  const byId = new Map(sections.map((s) => [s.id, s]));
  for (const s of sections) {
    let pid = s.id;
    while (pid.includes(".")) {
      pid = pid.slice(0, pid.lastIndexOf("."));
      if (byId.has(pid)) {
        byId.get(pid)!.children.push(s.id);
        break;
      }
    }
  }
  return sections;
}

function sectionCmp(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

function deriveFamilies(sections: SectionEntry[]): FamilyEntry[] {
  const tokenRe = /\b([A-Z]{2,6})-(\d{1,3})\b/g;
  const acc = new Map<string, { tokens: Set<string>; sections: Set<string> }>();
  for (const s of sections) {
    const hay = `${s.title}\n${s.body}`;
    let m: RegExpExecArray | null;
    while ((m = tokenRe.exec(hay)) !== null) {
      const fam = m[1]!;
      if (FAMILY_DENYLIST.has(fam)) continue;
      if (!acc.has(fam)) acc.set(fam, { tokens: new Set(), sections: new Set() });
      const e = acc.get(fam)!;
      e.tokens.add(`${m[1]}-${m[2]}`);
      e.sections.add(s.id);
    }
  }
  return [...acc.entries()]
    .map(([family, e]) => ({
      family,
      description: FAMILY_DESCRIPTIONS[family] ?? "(derived from spec; no curated description)",
      tokens: [...e.tokens].sort(),
      sections: [...e.sections].sort(sectionCmp),
    }))
    .sort((a, b) => a.family.localeCompare(b.family));
}

function buildSchemas(sections: SectionEntry[]): SchemaEntry[] {
  const ids = new Set(sections.map((s) => s.id));
  return ARTIFACT_SECTIONS.map(([artifact, section]) => {
    if (!ids.has(section)) {
      throw new Error(
        `Artifact map error: ${artifact} → §${section} does not exist in the parsed spec. ` +
          `Fix ARTIFACT_SECTIONS in build-index.ts (the defining section may have been renumbered).`,
      );
    }
    return { artifact, section };
  });
}

/** Build the full index object from the pinned spec + vendored vectors. Pure modulo
 *  git read of the pinned blob. `generatedAt` is injected so callers can hold it fixed. */
export function buildIndex(generatedAt: string): Record<string, unknown> {
  const specRaw = readPinnedBlob(SPEC_REPO, PINNED_COMMIT, SPEC_PATH_IN_REPO);
  const specSourceSha256 = sha256(specRaw);

  const sections = parseSections(specRaw);
  if (sections.length < 150) {
    throw new Error(`Parsed only ${sections.length} sections (<150) — header parser likely broke.`);
  }
  const families = deriveFamilies(sections);
  const schemas = buildSchemas(sections);

  const vectorsRaw = readFileSync(VECTORS_FILE, "utf8");
  const vj = JSON.parse(vectorsRaw) as {
    dacsVersion?: string; generator?: string; surfaces?: unknown; cases?: unknown[];
  };
  const vectors = {
    dacsVersion: vj.dacsVersion ?? "unknown",
    generator: vj.generator ?? "unknown",
    surfaces: vj.surfaces ?? {},
    cases: vj.cases ?? [],
  };

  return {
    generatedAt,
    specCommit: PINNED_COMMIT,
    specSourceSha256,
    specSource: "spec/SPECIFICATION.md @ github.com/DACS-Agent-commerce/DACS-Standard",
    vectorsSource: {
      path: "vendor/dacs-verify-MANIFEST.json",
      sha256: sha256(vectorsRaw),
      note: "Non-normative conformance pack, vendored by snapshot at build time.",
    },
    attribution: ATTRIBUTION,
    counts: {
      sections: sections.length,
      families: families.length,
      schemas: schemas.length,
      vectors: vectors.cases.length,
    },
    sections,
    families,
    schemas,
    vectors,
  };
}

function main(): void {
  const index = buildIndex(new Date().toISOString());
  const counts = index.counts as Record<string, number>;
  mkdirSync(resolve(OUT_FILE, ".."), { recursive: true });
  writeFileSync(OUT_FILE, JSON.stringify(index, null, 2) + "\n", "utf8");
  console.error(
    `[build-index] ok — pin ${PINNED_COMMIT.slice(0, 7)} | ${counts.sections} sections | ` +
      `${counts.families} families | ${counts.schemas} schemas | ${counts.vectors} vectors → ${OUT_FILE}`,
  );
}

if (import.meta.main) main();
