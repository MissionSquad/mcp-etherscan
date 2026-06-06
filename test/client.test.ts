import { afterEach, describe, expect, it, vi } from "vitest"
import { EtherscanClient } from "../src/client.js"

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("EtherscanClient", () => {
  it("preserves configured query parameters and appends request parameters", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input))
      expect(url.searchParams.get("network")).toBe("mainnet")
      expect(url.searchParams.get("module")).toBe("account")
      expect(url.searchParams.get("action")).toBe("balance")
      expect(url.searchParams.get("chainid")).toBe("999")
      expect(url.searchParams.get("address")).toBe("0xabc")
      expect(url.searchParams.get("apikey")).toBe("secret")
      return Response.json({ status: "1", message: "OK", result: "42" })
    })
    vi.stubGlobal("fetch", fetchMock)

    const client = new EtherscanClient({
      apiKey: "secret",
      baseUrl: "https://example.com/api?network=mainnet",
      chainId: "999",
      ...CACHE_DISABLED,
    })

    await expect(
      client.standardCall<string>("account", "balance", { address: "0xabc" }),
    ).resolves.toBe("42")
  })

  it("rejects malformed standard responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ status: "1", message: "OK" })),
    )
    const client = new EtherscanClient({
      apiKey: undefined,
      baseUrl: "https://example.com/api",
      chainId: undefined,
      ...CACHE_DISABLED,
    })

    await expect(
      client.standardCall<string>("account", "balance", {}),
    ).rejects.toThrow("malformed standard response")
  })

  it("rejects declared oversized responses before reading the body", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response("{}", {
            headers: { "content-length": String(11 * 1024 * 1024) },
          }),
      ),
    )
    const client = new EtherscanClient({
      apiKey: undefined,
      baseUrl: "https://example.com/api",
      chainId: undefined,
      ...CACHE_DISABLED,
    })

    await expect(client.proxyCall("eth_blockNumber", {})).rejects.toThrow(
      "response is too large",
    )
  })

  it("rejects streamed responses that exceed the safety limit", async () => {
    const megabyte = new Uint8Array(1024 * 1024)
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            new ReadableStream<Uint8Array>({
              start(controller) {
                for (let index = 0; index < 11; index += 1) {
                  controller.enqueue(megabyte)
                }
                controller.close()
              },
            }),
          ),
      ),
    )
    const client = new EtherscanClient({
      apiKey: undefined,
      baseUrl: "https://example.com/api",
      chainId: undefined,
      ...CACHE_DISABLED,
    })

    await expect(client.proxyCall("eth_blockNumber", {})).rejects.toThrow(
      "safety limit while downloading",
    )
  })

  it("rejects proxy responses without a result or error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ jsonrpc: "2.0", id: 1 })),
    )
    const client = new EtherscanClient({
      apiKey: undefined,
      baseUrl: "https://example.com/api",
      chainId: undefined,
      ...CACHE_DISABLED,
    })

    await expect(client.proxyCall("eth_blockNumber", {})).rejects.toThrow(
      "neither a result nor an error",
    )
  })

  it("normalizes documented empty standard responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          status: "0",
          message: "No transactions found",
          result: [],
        }),
      ),
    )
    const client = createClient()

    await expect(
      client.standardCall<unknown[]>(
        "account",
        "txlist",
        {},
        {
          allowEmpty: true,
        },
      ),
    ).resolves.toEqual([])
  })

  it("surfaces standard and proxy API errors", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          status: "0",
          message: "NOTOK",
          result: "Invalid API Key",
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          jsonrpc: "2.0",
          id: 1,
          error: { code: -32000, message: "execution failed" },
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          jsonrpc: "2.0",
          id: 1,
          error: { code: -32000 },
        }),
      )
    vi.stubGlobal("fetch", fetchMock)
    const client = createClient()

    await expect(client.standardCall("account", "balance", {})).rejects.toThrow(
      "Invalid API Key",
    )
    await expect(client.proxyCall("eth_call", {})).rejects.toThrow(
      "execution failed",
    )
    await expect(client.proxyCall("eth_call", {})).rejects.toThrow(
      "proxy request failed",
    )
  })

  it("handles HTTP, timeout, network, invalid JSON, and empty-body failures", async () => {
    const abortError = new Error("aborted")
    abortError.name = "AbortError"
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response("failure", { status: 503, statusText: "Unavailable" }),
      )
      .mockRejectedValueOnce(abortError)
      .mockRejectedValueOnce(new Error("socket closed"))
      .mockResolvedValueOnce(new Response("not-json"))
      .mockResolvedValueOnce(new Response(null))
    vi.stubGlobal("fetch", fetchMock)
    const client = createClient()

    await expect(client.proxyCall("eth_blockNumber", {})).rejects.toThrow(
      "HTTP 503 Unavailable",
    )
    await expect(client.proxyCall("eth_blockNumber", {})).rejects.toThrow(
      "timed out",
    )
    await expect(client.proxyCall("eth_blockNumber", {})).rejects.toThrow(
      "socket closed",
    )
    await expect(client.proxyCall("eth_blockNumber", {})).rejects.toThrow(
      "invalid JSON",
    )
    await expect(client.proxyCall("eth_blockNumber", {})).rejects.toThrow(
      "empty response body",
    )
  })

  it("accepts null proxy results and rejects non-object proxy envelopes", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({ jsonrpc: "2.0", id: 1, result: null }),
      )
      .mockResolvedValueOnce(Response.json(["unexpected"]))
    vi.stubGlobal("fetch", fetchMock)
    const client = createClient()

    await expect(client.proxyCall("eth_getCode", {})).resolves.toBeNull()
    await expect(client.proxyCall("eth_getCode", {})).rejects.toThrow(
      "malformed proxy response",
    )
  })
})

function createClient(): EtherscanClient {
  return new EtherscanClient({
    apiKey: undefined,
    baseUrl: "https://example.com/api",
    chainId: undefined,
    ...CACHE_DISABLED,
  })
}

const CACHE_DISABLED = {
  cacheEnabled: false,
  cacheMaxEntries: 1,
  cacheMaxEntryBytes: 1,
} as const
