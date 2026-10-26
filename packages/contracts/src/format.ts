import { z } from "zod";

/** Preserve original wire identifiers without rewriting hash-bound saved evidence. */
export type FormatVersion<Suffix extends string> = `emberforge.${Suffix}` | `pocketforge.${Suffix}`;

export function formatVersionSchema<Suffix extends string>(suffix: Suffix) {
  return z.literal([`emberforge.${suffix}`, `pocketforge.${suffix}`] as const);
}
