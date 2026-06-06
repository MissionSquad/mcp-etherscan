import { afterEach, describe, expect, it } from "vitest"
import { DEFAULT_BASE_URL, loadAppConfig } from "../src/config.js"

const originalEnv = { ...process.env }

afterEach(() => {
  process.env = { ...originalEnv }
})

describe("loadAppConfig", () => {
  it("uses defaults when environment values are absent or blank", () => {
    delete process.env.ETHERSCAN_API_KEY
    process.env.ETHERSCAN_BASE_URL = "   "
    delete process.env.ETHERSCAN_CHAIN_ID

    expect(loadAppConfig()).toEqual({
      defaultApiKey: undefined,
      defaultBaseUrl: DEFAULT_BASE_URL,
      defaultChainId: undefined,
      cacheEnabled: true,
      cacheMaxEntries: 1000,
      cacheMaxEntryBytes: 2 * 1024 * 1024,
    })
  })

  it("trims configured environment values", () => {
    process.env.ETHERSCAN_API_KEY = " key "
    process.env.ETHERSCAN_BASE_URL = " https://example.com/api "
    process.env.ETHERSCAN_CHAIN_ID = " 999 "

    expect(loadAppConfig()).toEqual({
      defaultApiKey: "key",
      defaultBaseUrl: "https://example.com/api",
      defaultChainId: "999",
      cacheEnabled: true,
      cacheMaxEntries: 1000,
      cacheMaxEntryBytes: 2 * 1024 * 1024,
    })
  })

  it("reads cache settings from the environment", () => {
    process.env.ETHERSCAN_CACHE_ENABLED = "false"
    process.env.ETHERSCAN_CACHE_MAX_ENTRIES = "25"
    process.env.ETHERSCAN_CACHE_MAX_ENTRY_BYTES = "4096"

    expect(loadAppConfig()).toMatchObject({
      cacheEnabled: false,
      cacheMaxEntries: 25,
      cacheMaxEntryBytes: 4096,
    })
  })

  it("rejects malformed cache settings", () => {
    process.env.ETHERSCAN_CACHE_ENABLED = "maybe"
    expect(() => loadAppConfig()).toThrow("must be true, false, 1, or 0")

    process.env.ETHERSCAN_CACHE_ENABLED = "true"
    process.env.ETHERSCAN_CACHE_MAX_ENTRIES = "0"
    expect(() => loadAppConfig()).toThrow("must be a positive integer")
  })
})
