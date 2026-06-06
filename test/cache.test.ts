import { afterEach, describe, expect, it, vi } from "vitest"
import { ExplorerResponseCache } from "../src/cache.js"
import { EtherscanClient } from "../src/client.js"

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe("ExplorerResponseCache integration", () => {
  it("reuses a successful response and ignores API keys in cache identity", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({ status: "1", message: "OK", result: "42" }),
    )
    vi.stubGlobal("fetch", fetchMock)
    const cache = createCache()
    const first = createClient(cache, "first-key")
    const second = createClient(cache, "second-key")

    await expect(first.standardCall("account", "balance", {})).resolves.toBe(
      "42",
    )
    await expect(second.standardCall("account", "balance", {})).resolves.toBe(
      "42",
    )

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("keeps API pages and normalized parameter values in separate entries", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input))
      return Response.json({
        status: "1",
        message: "OK",
        result: url.searchParams.get("page"),
      })
    })
    vi.stubGlobal("fetch", fetchMock)
    const client = createClient(createCache())

    await client.standardCall("account", "txlist", { page: 1, offset: 10 })
    await client.standardCall("account", "txlist", { offset: 10, page: 1 })
    await client.standardCall("account", "txlist", { page: 2, offset: 10 })

    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it("coalesces concurrent identical requests", async () => {
    let resolveResponse: ((response: Response) => void) | undefined
    const fetchMock = vi.fn(
      async () =>
        new Promise<Response>((resolve) => {
          resolveResponse = resolve
        }),
    )
    vi.stubGlobal("fetch", fetchMock)
    const client = createClient(createCache())

    const first = client.proxyCall("eth_blockNumber", {})
    const second = client.proxyCall("eth_blockNumber", {})
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    resolveResponse?.(Response.json({ jsonrpc: "2.0", id: 1, result: "0x10" }))

    await expect(Promise.all([first, second])).resolves.toEqual([
      "0x10",
      "0x10",
    ])
  })

  it("expires live entries after ten seconds", async () => {
    vi.useFakeTimers()
    const fetchMock = vi.fn(async () =>
      Response.json({ status: "1", message: "OK", result: "42" }),
    )
    vi.stubGlobal("fetch", fetchMock)
    const client = createClient(createCache())

    await client.standardCall("account", "balance", {})
    await vi.advanceTimersByTimeAsync(10_001)
    await client.standardCall("account", "balance", {})

    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it("retains immutable and fixed historical responses beyond the live TTL", async () => {
    vi.useFakeTimers()
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input))
      const action = url.searchParams.get("action")
      if (action?.startsWith("eth_") === true) {
        return Response.json({ jsonrpc: "2.0", id: 1, result: { action } })
      }
      return Response.json({ status: "1", message: "OK", result: [] })
    })
    vi.stubGlobal("fetch", fetchMock)
    const client = createClient(createCache())

    await client.proxyCall("eth_getTransactionByHash", { txhash: "0xabc" })
    await client.standardCall("account", "txlist", { endblock: 100 })
    await vi.advanceTimersByTimeAsync(10_001)
    await client.proxyCall("eth_getTransactionByHash", { txhash: "0xabc" })
    await client.standardCall("account", "txlist", { endblock: 100 })

    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it("evicts the least recently used entry at the configured capacity", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input))
      return Response.json({
        status: "1",
        message: "OK",
        result: url.searchParams.get("address"),
      })
    })
    vi.stubGlobal("fetch", fetchMock)
    const client = createClient(
      new ExplorerResponseCache({
        enabled: true,
        maxEntries: 1,
        maxEntryBytes: 1024,
      }),
    )

    await client.standardCall("account", "balance", { address: "0x1" })
    await client.standardCall("account", "balance", { address: "0x2" })
    await client.standardCall("account", "balance", { address: "0x1" })

    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it("does not cache API errors, transport failures, or oversized entries", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          status: "0",
          message: "NOTOK",
          result: "rate limit",
        }),
      )
      .mockRejectedValueOnce(new Error("network failure"))
      .mockImplementation(async () =>
        Response.json({
          status: "1",
          message: "OK",
          result: "too-large",
        }),
      )
    vi.stubGlobal("fetch", fetchMock)
    const client = createClient(
      new ExplorerResponseCache({
        enabled: true,
        maxEntries: 10,
        maxEntryBytes: 1,
      }),
    )

    await expect(client.standardCall("account", "balance", {})).rejects.toThrow(
      "rate limit",
    )
    await expect(client.standardCall("account", "balance", {})).rejects.toThrow(
      "network failure",
    )
    await client.standardCall("account", "balance", {})
    await client.standardCall("account", "balance", {})

    expect(fetchMock).toHaveBeenCalledTimes(4)
  })

  it("bypasses storage when disabled", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({ status: "1", message: "OK", result: "42" }),
    )
    vi.stubGlobal("fetch", fetchMock)
    const client = createClient(
      new ExplorerResponseCache({
        enabled: false,
        maxEntries: 1,
        maxEntryBytes: 1,
      }),
    )

    await client.standardCall("account", "balance", {})
    await client.standardCall("account", "balance", {})

    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})

function createCache(): ExplorerResponseCache {
  return new ExplorerResponseCache({
    enabled: true,
    maxEntries: 10,
    maxEntryBytes: 1024,
  })
}

function createClient(
  cache: ExplorerResponseCache,
  apiKey: string | undefined = undefined,
): EtherscanClient {
  return new EtherscanClient(
    {
      apiKey,
      baseUrl: "https://example.com/api",
      chainId: "1",
      cacheEnabled: true,
      cacheMaxEntries: 10,
      cacheMaxEntryBytes: 1024,
    },
    cache,
  )
}
