import { describe, expect, it } from "vitest"
import {
  CHARACTER_LIMIT,
  buildBoundedResponse,
  buildListEnvelope,
  formatUnits,
  hexToDecimalString,
} from "../src/format.js"

describe("buildBoundedResponse", () => {
  it("serializes undefined safely", () => {
    expect(buildBoundedResponse(undefined)).toBe("null")
  })

  it("keeps normal responses unchanged", () => {
    expect(JSON.parse(buildBoundedResponse({ ok: true }))).toEqual({
      ok: true,
    })
  })

  it("returns a bounded preview by default", () => {
    const response = buildBoundedResponse({ source: "x".repeat(50000) })
    const parsed = JSON.parse(response) as {
      truncated: boolean
      full_output_available: boolean
      original_characters: number
    }

    expect(response.length).toBeLessThanOrEqual(CHARACTER_LIMIT)
    expect(parsed.truncated).toBe(true)
    expect(parsed.full_output_available).toBe(true)
    expect(parsed.original_characters).toBeGreaterThan(CHARACTER_LIMIT)
  })

  it("returns complete oversized output only when explicitly enabled", () => {
    const value = { source: "x".repeat(50000) }
    const response = buildBoundedResponse(value, true)

    expect(response.length).toBeGreaterThan(CHARACTER_LIMIT)
    expect(JSON.parse(response)).toEqual(value)
  })

  it("previews nested arrays and primitive values", () => {
    const value = {
      rows: Array.from({ length: 100 }, (_, index) => ({
        index,
        active: index % 2 === 0,
        nullable: null,
        nested: { payload: "x".repeat(1000) },
      })),
    }

    const parsed = JSON.parse(buildBoundedResponse(value)) as {
      truncated: boolean
      preview: { rows: unknown[] }
    }

    expect(parsed.truncated).toBe(true)
    expect(parsed.preview.rows.length).toBeLessThan(100)
  })

  it("falls back to a summary when object keys alone exceed the limit", () => {
    const hugeObject = Object.fromEntries(
      Array.from({ length: 4000 }, (_, index) => [
        `very_long_property_name_${index}`,
        "x",
      ]),
    )

    const parsed = JSON.parse(buildBoundedResponse(hugeObject)) as {
      preview: string
    }

    expect(parsed.preview).toContain("object with 4000 keys omitted")
  })
})

describe("buildListEnvelope", () => {
  const records = Array.from({ length: 100 }, (_, index) => ({
    index,
    payload: "x".repeat(1000),
  }))

  it("truncates to the largest bounded record prefix", () => {
    const response = buildListEnvelope(records, 2, 100)
    const parsed = JSON.parse(response) as {
      returned_count: number
      fetched_count: number
      truncated: boolean
      full_output_available: boolean
      results: unknown[]
    }

    expect(response.length).toBeLessThanOrEqual(CHARACTER_LIMIT)
    expect(parsed.truncated).toBe(true)
    expect(parsed.full_output_available).toBe(true)
    expect(parsed.fetched_count).toBe(100)
    expect(parsed.returned_count).toBe(parsed.results.length)
    expect(parsed.returned_count).toBeGreaterThan(0)
    expect(parsed.returned_count).toBeLessThan(100)
  })

  it("returns the complete page when full output is enabled", () => {
    const parsed = JSON.parse(buildListEnvelope(records, 1, 100, true)) as {
      returned_count: number
      truncated: boolean
    }

    expect(parsed.returned_count).toBe(100)
    expect(parsed.truncated).toBe(false)
  })
})

describe("numeric formatting", () => {
  it("formats base-unit integers without losing precision", () => {
    expect(formatUnits("1000000000000000000", 18)).toBe("1")
    expect(formatUnits("-1234500", 4)).toBe("-123.45")
    expect(formatUnits("42", 0)).toBe("42")
    expect(formatUnits("-42", 0)).toBe("-42")
    expect(formatUnits("not-a-number", 18)).toBe("not-a-number")
  })

  it("converts valid hex quantities and rejects invalid values", () => {
    expect(hexToDecimalString("0x10")).toBe("16")
    expect(hexToDecimalString("10")).toBeNull()
    expect(hexToDecimalString(null)).toBeNull()
  })
})
