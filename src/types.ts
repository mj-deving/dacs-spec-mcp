/** Runtime zod schema + inferred types for the generated spec index.
 *  Portable TS — no Bun/fs/network. The loader validates the imported JSON
 *  against `SpecIndexSchema` so a malformed index fails loudly at startup. */

import { z } from "zod";

export const SectionSchema = z.object({
  id: z.string(),
  level: z.number().int(),
  title: z.string(),
  part: z.string(),
  body: z.string(),
  children: z.array(z.string()),
});

export const FamilySchema = z.object({
  family: z.string(),
  description: z.string(),
  tokens: z.array(z.string()),
  sections: z.array(z.string()),
});

export const SchemaEntrySchema = z.object({
  artifact: z.string(),
  section: z.string(),
});

/** A conformance vector case, snapshotted verbatim from the dacs-verify MANIFEST.
 *  `want` is intentionally permissive; `.loose()` preserves any extra MANIFEST
 *  fields so the served vector stays byte-faithful (H2 — zod strips by default). */
export const VectorCaseSchema = z
  .object({
    id: z.string(),
    area: z.string(),
    spec: z.string(),
    summary: z.string(),
    status: z.string(),
    want: z.unknown(),
  })
  .loose();

export const VectorsSchema = z.object({
  dacsVersion: z.string(),
  generator: z.string(),
  surfaces: z.unknown(),
  cases: z.array(VectorCaseSchema),
});

export const SpecIndexSchema = z.object({
  generatedAt: z.string(),
  specCommit: z.string(),
  specSourceSha256: z.string(),
  specSource: z.string(),
  vectorsSource: z.object({
    path: z.string(),
    sha256: z.string(),
    note: z.string(),
  }),
  attribution: z.string(),
  counts: z.object({
    sections: z.number().int(),
    families: z.number().int(),
    schemas: z.number().int(),
    vectors: z.number().int(),
  }),
  sections: z.array(SectionSchema),
  families: z.array(FamilySchema),
  schemas: z.array(SchemaEntrySchema),
  vectors: VectorsSchema,
});

export type Section = z.infer<typeof SectionSchema>;
export type Family = z.infer<typeof FamilySchema>;
export type SchemaEntry = z.infer<typeof SchemaEntrySchema>;
export type VectorCase = z.infer<typeof VectorCaseSchema>;
export type SpecIndex = z.infer<typeof SpecIndexSchema>;
