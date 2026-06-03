# dacs-spec-mcp-server

A **read-only** [MCP](https://modelcontextprotocol.io) server that exposes the **DACS** (Demos Agent Commerce Standards) v0.1 specification — by section, rule family, artifact-defining section, and §14 conformance vector — so an agent can query the standard without loading the ~3,800-line spec file.

> **Proposed / non-normative ecosystem tooling.** The steward (KyneSys) owns the normative spec; this server only *serves* it. ROADMAP Part 2 names "a DACS spec-reference MCP server" with the mandate that it **must generate from the repo so it cannot drift.** This is that server.

## Why it cannot drift

The server never parses the live spec at runtime. Instead:

1. **Build-time index.** `scripts/build-index.ts` reads the spec at a **pinned commit** (`85ff7a9`) and emits `src/generated/spec-index.json`. The server loads only this committed JSON, via a static import.
2. **Content-hash lock.** The index records `specSourceSha256` — the SHA-256 of the spec at the pin. `scripts/check-index.ts` re-hashes the spec *as of the pinned commit* and fails if it differs, so the pin is a **lock, not just a label** (bumping the pin without regenerating fails CI).
3. **Version stamp.** Every tool/resource response is prefixed with `_Spec commit: <SHA> | index <ISO>_`.
4. **CI freshness gate** (`.github/workflows/spec-sync.yml`): a **blocking** job proves the committed index is byte-faithful to a fresh rebuild at the pin; an **advisory** job reports when upstream `main` has moved past the pin.

Drift is not discouraged — it is structurally caught before ship.

## Tools (all `readOnlyHint: true`)

| Tool | Use |
|------|-----|
| `dacs_search_rules` | full-text search across section titles + bodies (know what, not the §) |
| `dacs_get_section` | full normative text of a section by id (e.g. `11.2.1`) |
| `dacs_list_rule_families` | the derived rule families (SE-*, HTLC-*, …) and where they live |
| `dacs_get_artifact_schema` | the **defining section (prose)** for a signed artifact — *not* a JSON Schema |
| `dacs_get_conformance_vector` | one §14 conformance vector (golden/candidate) from the vendored `dacs-verify` pack |

## Resources

- `dacs://toc` — the section tree
- `dacs://schemas/{name}` — artifact defining-sections (listable)
- `dacs://vectors/manifest` — the conformance pack (surfaces + cases)

## Usage

```bash
bun install
bun run build-index   # regenerate the index from the pinned spec
bun run typecheck     # tsc strict
bun test              # unit + in-memory protocol tests
bun run start         # run over stdio
```

Register in Claude Code via the bundled `.mcp.json` (stdio, `${CLAUDE_PROJECT_DIR}`-relative), or:

```bash
claude mcp add dacs-spec --transport stdio -- bun "$PWD/src/server.ts"
```

A later Cloudflare Workers transport is intentionally additive: every tool/resource is a pure function of `(index, input)`, with `src/server.ts` the only transport-coupled file.

## Provenance & license

This server's own code is **MIT**. It serves verbatim excerpts of the DACS spec, which is **MIT — © 2026 KyneSys Labs and the DACS authors** (redistribution permitted with attribution); each served body carries that attribution. The `dacs-verify` conformance pack is non-normative and vendored by snapshot.

- Spec source: `github.com/DACS-Agent-commerce/DACS-Standard` @ `85ff7a9`
- Vectors: `dacs-verify/conformance/MANIFEST.json` (42 cases: 24 golden + 18 candidate)
