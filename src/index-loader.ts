/** index-loader — loads the generated spec index via a STATIC import (no runtime
 *  fs / Bun / network), validates it once, and exposes typed read accessors.
 *
 *  The static import is the Workers-portability guarantee: both stdio and a future
 *  Workers transport consume the identical bundled artifact. This
 *  file and every tool/resource must stay free of Bun.* and node:fs. */

import rawIndex from "./generated/spec-index.json";
import {
  SpecIndexSchema,
  type SpecIndex,
  type Section,
  type Family,
  type SchemaEntry,
  type VectorCase,
} from "./types.js";

let parsed: SpecIndex;
try {
  parsed = SpecIndexSchema.parse(rawIndex);
} catch (err) {
  throw new Error(
    `Spec index failed validation — the generated src/generated/spec-index.json is malformed. ` +
      `Re-run \`bun run build-index\`. Underlying error: ${(err as Error).message}`,
  );
}

const index = parsed;

// The DACS spec reuses §6.x/§7.x numbering between the front-matter overview and
// the normative "Chapter N" parts. Build an alternatives map of ALL sections per id,
// and a primary map that PREFERS the normative Chapter on collision so a bare
// `get_section("7.7")` resolves to the spec's real content, not the overview.
const sectionAltsById = new Map<string, Section[]>();
for (const s of index.sections) {
  const arr = sectionAltsById.get(s.id);
  if (arr) arr.push(s);
  else sectionAltsById.set(s.id, [s]);
}
const sectionById = new Map<string, Section>();
for (const [id, arr] of sectionAltsById) {
  const chapter = arr.find((s) => s.part.startsWith("Chapter"));
  sectionById.set(id, chapter ?? arr[arr.length - 1]!);
}

const vectorById = new Map<string, VectorCase>(index.vectors.cases.map((c) => [c.id, c]));
const schemaByArtifact = new Map<string, SchemaEntry>(index.schemas.map((s) => [s.artifact, s]));

export function getIndex(): SpecIndex {
  return index;
}
export function getSection(id: string): Section | undefined {
  return sectionById.get(id);
}
/** All sections sharing this id (>1 when the overview and a Chapter collide). */
export function getSectionAlternatives(id: string): readonly Section[] {
  return sectionAltsById.get(id) ?? [];
}
export function allSections(): readonly Section[] {
  return index.sections;
}
export function allFamilies(): readonly Family[] {
  return index.families;
}
export function getVector(id: string): VectorCase | undefined {
  return vectorById.get(id);
}
export function allVectors(): readonly VectorCase[] {
  return index.vectors.cases;
}
export function getSchemaEntry(artifact: string): SchemaEntry | undefined {
  return schemaByArtifact.get(artifact);
}
export function allArtifactNames(): readonly string[] {
  return index.schemas.map((s) => s.artifact);
}
export function specCommit(): string {
  return index.specCommit;
}
export function generatedAt(): string {
  return index.generatedAt;
}
export function attribution(): string {
  return index.attribution;
}
