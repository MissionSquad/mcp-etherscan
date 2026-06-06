import { describe, expect, it } from "vitest"
import type { AppConfig } from "../src/config.js"
import { resolveRequestConfig } from "../src/resolver.js"

const defaults: AppConfig = {
  defaultApiKey: undefined,
  defaultBaseUrl: "https://api.etherscan.io/v2/api",
  defaultChainId: "1",
  cacheEnabled: true,
  cacheMaxEntries: 1000,
  cacheMaxEntryBytes: 2 * 1024 * 1024,
}

describe("resolveRequestConfig", () => {
  it("prefers hidden values and trims them", () => {
    expect(
      resolveRequestConfig(
        {
          apiKey: " secret ",
          baseUrl: " https://example.com/api?network=mainnet ",
          chainId: " 999 ",
        },
        defaults,
      ),
    ).toEqual({
      apiKey: "secret",
      baseUrl: "https://example.com/api?network=mainnet",
      chainId: "999",
      cacheEnabled: true,
      cacheMaxEntries: 1000,
      cacheMaxEntryBytes: 2 * 1024 * 1024,
    })
  })

  it("rejects unsupported URL protocols", () => {
    expect(() =>
      resolveRequestConfig({ baseUrl: "file:///etc/passwd" }, defaults),
    ).toThrow("must use http or https")
  })

  it("rejects malformed chain IDs", () => {
    expect(() => resolveRequestConfig({ chainId: "0x3e7" }, defaults)).toThrow(
      "positive decimal integer",
    )
  })

  it("accepts the lowercase hidden chain ID alias", () => {
    expect(resolveRequestConfig({ chainid: "8453" }, defaults).chainId).toBe(
      "8453",
    )
  })

  it("rejects non-string and empty hidden values", () => {
    expect(() => resolveRequestConfig({ apiKey: 123 }, defaults)).toThrow(
      'Hidden argument "apiKey" must be a string',
    )
    expect(() => resolveRequestConfig({ apiKey: " " }, defaults)).toThrow(
      'Hidden argument "apiKey" must be a non-empty string',
    )
  })

  it("rejects invalid absolute URLs and embedded credentials", () => {
    expect(() =>
      resolveRequestConfig({ baseUrl: "not-a-url" }, defaults),
    ).toThrow("valid absolute URL")
    expect(() =>
      resolveRequestConfig(
        { baseUrl: "https://user:password@example.com/api" },
        defaults,
      ),
    ).toThrow("must not contain embedded credentials")
  })
})
