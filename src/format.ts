/**
 * Output formatting helpers.
 *
 * Tools return JSON text because this is a data API consumed by an agent.
 * Potentially large tools use these helpers to keep default responses within a
 * predictable model-context budget. Callers can explicitly opt into unbounded
 * output with the tool's `fullOutput` parameter.
 */

export const CHARACTER_LIMIT = 25000
export const FULL_OUTPUT_WARNING =
  "Full output can be very large and may consume substantial model context. Use only when the complete raw response is required."

export function toJsonText(value: unknown): string {
  return JSON.stringify(value, null, 2) ?? "null"
}

interface ListEnvelope {
  returned_count: number
  fetched_count: number
  page: number
  offset: number
  has_more: boolean
  truncated: boolean
  full_output_available?: boolean
  warning?: string
  results: unknown[]
}

/**
 * Wraps a result array with pagination metadata. `has_more` is a heuristic: a
 * full page implies further pages may exist. Default output is reduced to the
 * largest record prefix that fits the context budget; `fullOutput` returns the
 * complete page.
 */
export function buildListEnvelope(
  results: unknown[],
  page: number,
  offset: number,
  fullOutput = false,
): string {
  const envelope: ListEnvelope = {
    returned_count: results.length,
    fetched_count: results.length,
    page,
    offset,
    has_more: results.length >= offset,
    truncated: false,
    results,
  }

  const text = toJsonText(envelope)
  if (fullOutput || text.length <= CHARACTER_LIMIT) {
    return text
  }

  let low = 0
  let high = results.length
  let best = createTruncatedListEnvelope(results, page, offset, 0)

  while (low <= high) {
    const candidateCount = Math.floor((low + high) / 2)
    const candidate = createTruncatedListEnvelope(
      results,
      page,
      offset,
      candidateCount,
    )
    if (toJsonText(candidate).length <= CHARACTER_LIMIT) {
      best = candidate
      low = candidateCount + 1
    } else {
      high = candidateCount - 1
    }
  }

  return toJsonText(best)
}

/**
 * Formats an arbitrary potentially large payload. Oversized default responses
 * are replaced with a bounded structural preview. Explicit full output is
 * returned unchanged.
 */
export function buildBoundedResponse(
  value: unknown,
  fullOutput = false,
): string {
  const text = toJsonText(value)
  if (fullOutput || text.length <= CHARACTER_LIMIT) {
    return text
  }

  const original_characters = text.length
  const profiles: PreviewProfile[] = [
    { maxArrayItems: 40, maxStringCharacters: 4000, maxDepth: 8 },
    { maxArrayItems: 20, maxStringCharacters: 2000, maxDepth: 6 },
    { maxArrayItems: 10, maxStringCharacters: 1000, maxDepth: 5 },
    { maxArrayItems: 5, maxStringCharacters: 500, maxDepth: 4 },
    { maxArrayItems: 3, maxStringCharacters: 200, maxDepth: 3 },
    { maxArrayItems: 1, maxStringCharacters: 100, maxDepth: 2 },
  ]

  for (const profile of profiles) {
    const response = {
      truncated: true,
      full_output_available: true,
      original_characters,
      warning: `Response exceeded the ${CHARACTER_LIMIT}-character default limit. This is a structural preview. Set fullOutput to true only if the complete raw response is required; ${FULL_OUTPUT_WARNING}`,
      preview: createPreview(value, profile),
    }
    const previewText = toJsonText(response)
    if (previewText.length <= CHARACTER_LIMIT) {
      return previewText
    }
  }

  return toJsonText({
    truncated: true,
    full_output_available: true,
    original_characters,
    warning: `Response exceeded the ${CHARACTER_LIMIT}-character default limit and was too large to preview safely. Set fullOutput to true only if the complete raw response is required; ${FULL_OUTPUT_WARNING}`,
    preview: summarizeValue(value),
  })
}

/**
 * Converts an integer base-unit amount (as a decimal string, e.g. wei) into a
 * human-readable decimal string. Returns the input unchanged when it is not a
 * plain integer so unexpected values are never silently corrupted.
 */
export function formatUnits(value: string, decimals: number): string {
  let working = value.trim()
  let negative = false

  if (working.startsWith("-")) {
    negative = true
    working = working.slice(1)
  }

  if (!/^\d+$/.test(working)) {
    return value
  }

  if (decimals === 0) {
    return negative ? `-${working}` : working
  }

  const padded = working.padStart(decimals + 1, "0")
  const whole = padded.slice(0, padded.length - decimals)
  const fraction = padded.slice(padded.length - decimals).replace(/0+$/, "")
  const result = fraction.length > 0 ? `${whole}.${fraction}` : whole
  return negative ? `-${result}` : result
}

/** Parses a 0x-prefixed hex quantity into a decimal string, or null when invalid. */
export function hexToDecimalString(value: unknown): string | null {
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]+$/.test(value)) {
    return null
  }
  return BigInt(value).toString(10)
}

interface PreviewProfile {
  maxArrayItems: number
  maxStringCharacters: number
  maxDepth: number
}

function createTruncatedListEnvelope(
  results: unknown[],
  page: number,
  offset: number,
  resultCount: number,
): ListEnvelope {
  return {
    returned_count: resultCount,
    fetched_count: results.length,
    page,
    offset,
    has_more: true,
    truncated: true,
    full_output_available: true,
    warning: `Default output was reduced to fit the ${CHARACTER_LIMIT}-character context limit. Reduce offset, narrow the block range, request another page, or set fullOutput to true only when the complete page is required.`,
    results: results.slice(0, resultCount),
  }
}

function createPreview(
  value: unknown,
  profile: PreviewProfile,
  depth = 0,
): unknown {
  if (typeof value === "string") {
    if (value.length <= profile.maxStringCharacters) {
      return value
    }
    return `${value.slice(0, profile.maxStringCharacters)}...[omitted ${value.length - profile.maxStringCharacters} characters]`
  }

  if (
    value === null ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "undefined"
  ) {
    return value
  }

  if (depth >= profile.maxDepth) {
    return summarizeValue(value)
  }

  if (Array.isArray(value)) {
    const preview = value
      .slice(0, profile.maxArrayItems)
      .map((entry) => createPreview(entry, profile, depth + 1))
    if (value.length > preview.length) {
      preview.push(`[omitted ${value.length - preview.length} array items]`)
    }
    return preview
  }

  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        createPreview(entry, profile, depth + 1),
      ]),
    )
  }

  return String(value)
}

function summarizeValue(value: unknown): string {
  if (Array.isArray(value)) {
    return `[array with ${value.length} items omitted]`
  }
  if (value !== null && typeof value === "object") {
    return `[object with ${Object.keys(value).length} keys omitted]`
  }
  if (typeof value === "string") {
    return `[string with ${value.length} characters omitted]`
  }
  return String(value)
}
