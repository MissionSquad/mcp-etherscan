/**
 * Shared Zod field validators.
 *
 * Each tool composes these into a plain `z.object({ ... })`. Tool schemas must
 * NOT use `.strict()` (the FastMCP fork validates the full incoming arguments,
 * including injected hidden values, so strict mode would reject them) and must
 * NOT use a top-level `.refine()` (which turns the schema into a ZodEffects and
 * removes the object shape the fork uses to separate hidden values). Cross-field
 * validation is therefore done inside each tool's `execute`.
 */

import { z } from "zod"

export const addressSchema = z
  .string()
  .regex(
    /^0x[a-fA-F0-9]{40}$/,
    "Address must be a 0x-prefixed 40-hex-character string.",
  )

export const txHashSchema = z
  .string()
  .regex(
    /^0x[a-fA-F0-9]{64}$/,
    "Transaction hash must be a 0x-prefixed 64-hex-character string.",
  )

export const sortSchema = z
  .enum(["asc", "desc"])
  .default("asc")
  .describe("Sort order: 'asc' for oldest first, 'desc' for newest first.")

export const pageSchema = z
  .number()
  .int()
  .min(1)
  .default(1)
  .describe("Page number for pagination.")

export const offsetSchema = z
  .number()
  .int()
  .min(1)
  .max(10000)
  .default(100)
  .describe(
    "Records requested per page (1-10000). Large values may be expensive or unsupported by the selected explorer; default responses are context-bounded unless fullOutput is true.",
  )

export const startBlockSchema = z
  .number()
  .int()
  .min(0)
  .default(0)
  .describe("Start block number to search from.")

export const endBlockSchema = z
  .number()
  .int()
  .min(0)
  .default(99999999)
  .describe("End block number to search to.")

export const balanceTagSchema = z
  .enum(["latest", "earliest", "pending"])
  .default("latest")
  .describe("Block state to read the balance at.")

export const fullOutputSchema = z
  .boolean()
  .default(false)
  .describe(
    "Return the complete raw result even when it exceeds the default 25000-character context limit. Defaults to false because full output can overwhelm model context; enable only when the complete payload is necessary.",
  )

/** A hex block quantity (e.g. 0x10d4f) or a named tag, used by proxy endpoints. */
export const hexBlockTagSchema = z
  .string()
  .regex(
    /^(0x[0-9a-fA-F]+|latest|earliest|pending)$/,
    "Use a hex block number like 0x10d4f or one of latest/earliest/pending.",
  )
