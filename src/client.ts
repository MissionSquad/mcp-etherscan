/**
 * HTTP client for the Etherscan API and any Etherscan-compatible explorer.
 *
 * Two response shapes exist:
 *  - Standard modules (account, contract, transaction, logs, block, stats, token)
 *    return `{ status, message, result }` where status "1" is success and "0" is
 *    either an error or an empty result.
 *  - The `proxy` module (Geth/Parity JSON-RPC pass-through) returns
 *    `{ jsonrpc, id, result }` or `{ jsonrpc, id, error }` with no status field.
 *
 * The `chainid` query parameter is only sent when a chain id is configured, so
 * the same client works against the Etherscan V2 unified endpoint (needs chainid)
 * and against a standalone explorer's own endpoint (no chainid).
 */

import { UserError } from "@missionsquad/fastmcp"
import { ExplorerResponseCache, getSharedResponseCache } from "./cache.js"
import type { AppConfig } from "./config.js"
import { resolveRequestConfig } from "./resolver.js"
import type { ResolvedRequestConfig } from "./resolver.js"

const REQUEST_TIMEOUT_MS = 30000
const MAX_RESPONSE_BYTES = 10 * 1024 * 1024

/** Matches the canonical "empty result" messages returned with status "0". */
const EMPTY_RESULT_PATTERN =
  /no (transactions|records|token transfers)\s+found/i

export type QueryParams = Record<string, string | number | boolean | undefined>

export class EtherscanClient {
  private readonly apiKey: string | undefined
  private readonly baseUrl: string
  private readonly chainId: string | undefined
  private readonly responseCache: ExplorerResponseCache

  constructor(
    config: ResolvedRequestConfig,
    responseCache = getSharedResponseCache({
      enabled: config.cacheEnabled,
      maxEntries: config.cacheMaxEntries,
      maxEntryBytes: config.cacheMaxEntryBytes,
    }),
  ) {
    this.apiKey = config.apiKey
    this.baseUrl = config.baseUrl
    this.chainId = config.chainId
    this.responseCache = responseCache
  }

  /**
   * Calls a standard module endpoint. With `allowEmpty`, a status "0" response
   * whose message reports no results resolves to an empty array instead of an
   * error (used by the list endpoints).
   */
  async standardCall<T>(
    moduleName: string,
    action: string,
    params: QueryParams,
    options: { allowEmpty?: boolean } = {},
  ): Promise<T> {
    const data = await this.get(
      moduleName,
      action,
      params,
      isCacheableStandardResponse,
    )
    if (!isRecord(data) || !Object.hasOwn(data, "result")) {
      throw new UserError(
        "Explorer API returned a malformed standard response.",
      )
    }

    if (data.status === "1") {
      return data.result as T
    }

    const message = typeof data.message === "string" ? data.message : ""
    const resultText = typeof data.result === "string" ? data.result : ""

    if (
      options.allowEmpty === true &&
      (EMPTY_RESULT_PATTERN.test(message) ||
        EMPTY_RESULT_PATTERN.test(resultText))
    ) {
      return [] as unknown as T
    }

    const detail =
      resultText.length > 0
        ? resultText
        : message.length > 0
          ? message
          : "request failed"
    throw new UserError(`Explorer API error: ${detail}`)
  }

  /** Calls a `proxy` module (JSON-RPC) endpoint. A null result is a valid answer. */
  async proxyCall<T>(action: string, params: QueryParams): Promise<T> {
    const data = await this.get(
      "proxy",
      action,
      params,
      isCacheableProxyResponse,
    )
    if (!isRecord(data)) {
      throw new UserError("Explorer API returned a malformed proxy response.")
    }

    if (isRecord(data.error)) {
      const message =
        typeof data.error.message === "string"
          ? data.error.message
          : "proxy request failed"
      throw new UserError(`Explorer proxy error: ${message}`)
    }

    if (!Object.hasOwn(data, "result")) {
      throw new UserError(
        "Explorer proxy response contained neither a result nor an error.",
      )
    }

    return (data.result ?? null) as T
  }

  private async get(
    moduleName: string,
    action: string,
    params: QueryParams,
    isCacheable: (value: unknown) => boolean,
  ): Promise<unknown> {
    return this.responseCache.getOrLoad(
      {
        baseUrl: this.baseUrl,
        chainId: this.chainId,
        moduleName,
        action,
        params,
      },
      () => this.fetchJson(moduleName, action, params),
      isCacheable,
    )
  }

  private async fetchJson(
    moduleName: string,
    action: string,
    params: QueryParams,
  ): Promise<unknown> {
    const url = new URL(this.baseUrl)
    url.searchParams.set("module", moduleName)
    url.searchParams.set("action", action)

    if (this.chainId !== undefined) {
      url.searchParams.set("chainid", this.chainId)
    }

    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== "") {
        url.searchParams.set(key, String(value))
      }
    }

    if (this.apiKey !== undefined) {
      url.searchParams.set("apikey", this.apiKey)
    }

    const controller = new AbortController()
    const timer = setTimeout(function abort() {
      controller.abort()
    }, REQUEST_TIMEOUT_MS)

    try {
      const response = await fetch(url, {
        method: "GET",
        headers: { Accept: "application/json" },
        signal: controller.signal,
      })

      if (!response.ok) {
        throw new UserError(
          `Explorer request failed with HTTP ${response.status} ${response.statusText}.`,
        )
      }

      return await readBoundedJson(response)
    } catch (error) {
      if (error instanceof UserError) {
        throw error
      }
      if (error instanceof Error && error.name === "AbortError") {
        throw new UserError(
          `Explorer request timed out after ${REQUEST_TIMEOUT_MS} ms.`,
        )
      }
      const message = error instanceof Error ? error.message : String(error)
      throw new UserError(`Explorer request failed: ${message}`)
    } finally {
      clearTimeout(timer)
    }
  }
}

async function readBoundedJson(response: Response): Promise<unknown> {
  const declaredLength = response.headers.get("content-length")
  if (declaredLength !== null) {
    const parsedLength = Number(declaredLength)
    if (Number.isFinite(parsedLength) && parsedLength > MAX_RESPONSE_BYTES) {
      throw new UserError(
        `Explorer response is too large: ${parsedLength} bytes exceeds the ${MAX_RESPONSE_BYTES}-byte safety limit.`,
      )
    }
  }

  if (response.body === null) {
    throw new UserError("Explorer returned an empty response body.")
  }

  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let totalBytes = 0

  while (true) {
    const { done, value } = await reader.read()
    if (done) {
      break
    }
    totalBytes += value.byteLength
    if (totalBytes > MAX_RESPONSE_BYTES) {
      await reader.cancel()
      throw new UserError(
        `Explorer response exceeded the ${MAX_RESPONSE_BYTES}-byte safety limit while downloading.`,
      )
    }
    chunks.push(value)
  }

  const body = Buffer.concat(chunks, totalBytes).toString("utf8")
  try {
    return JSON.parse(body) as unknown
  } catch {
    throw new UserError("Explorer returned invalid JSON.")
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

function isCacheableStandardResponse(value: unknown): boolean {
  if (!isRecord(value) || !Object.hasOwn(value, "result")) {
    return false
  }
  if (value.status === "1") {
    return true
  }
  const message = typeof value.message === "string" ? value.message : ""
  const resultText = typeof value.result === "string" ? value.result : ""
  return (
    EMPTY_RESULT_PATTERN.test(message) || EMPTY_RESULT_PATTERN.test(resultText)
  )
}

function isCacheableProxyResponse(value: unknown): boolean {
  return (
    isRecord(value) &&
    !Object.hasOwn(value, "error") &&
    Object.hasOwn(value, "result")
  )
}

/** Builds a client from the hidden values on the current tool call. */
export function createEtherscanClient(
  extraArgs: Record<string, unknown> | undefined,
  defaults: AppConfig,
): EtherscanClient {
  return new EtherscanClient(resolveRequestConfig(extraArgs, defaults))
}
