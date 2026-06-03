/** Shared constants — no magic numbers inline. Portable TS (no Bun/fs APIs). */

export const SERVER_NAME = "dacs-spec-mcp-server";
export const SERVER_VERSION = "0.1.0";

/** Max characters of a section body shown in a search excerpt. */
export const SEARCH_EXCERPT_CHARS = 280;

/** dacs_search_rules limit bounds. */
export const SEARCH_LIMIT_MIN = 1;
export const SEARCH_LIMIT_MAX = 20;
export const SEARCH_LIMIT_DEFAULT = 5;

/** dacs_list_rule_families pagination defaults. */
export const FAMILIES_PAGE_SIZE_DEFAULT = 20;
export const FAMILIES_PAGE_SIZE_MAX = 100;

/** Section id shape, e.g. "11.2.1" (1–4 dotted numeric components). */
export const SECTION_ID_RE = /^\d+(?:\.\d+){0,3}$/;
