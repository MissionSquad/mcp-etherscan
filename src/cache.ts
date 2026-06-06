import { md5, SuperLRU } from "superlru"
import type { QueryParams } from "./client.js"

const LIVE_TTL_MS = 10_000
const HISTORICAL_TTL_MS = 10 * 60_000
const IMMUTABLE_TTL_MS = 6 * 60 * 60_000
const OPEN_ENDED_BLOCK = 99_999_999
const IMMUTABLE_ACTIONS = new Set([
  "getabi",
  "getsourcecode",
  "getcontractcreation",
  "getblocknobytime",
  "getstatus",
  "gettxreceiptstatus",
  "eth_getTransactionByHash",
  "eth_getTransactionReceipt",
])

export interface ResponseCacheConfig {
  enabled: boolean
  maxEntries: number
  maxEntryBytes: number
}

interface CacheEntry {
  expiresAt: number
  value: unknown
}

interface CacheRequest {
  baseUrl: string
  chainId: string | undefined
  moduleName: string
  action: string
  params: QueryParams
}

const sharedCaches = new Map<string, ExplorerResponseCache>()

export class ExplorerResponseCache {
  private readonly cache: SuperLRU<string, CacheEntry>
  private readonly inFlight = new Map<string, Promise<unknown>>()

  constructor(private readonly config: ResponseCacheConfig) {
    this.cache = new SuperLRU({
      maxSize: config.maxEntries,
      compress: false,
    })
  }

  async getOrLoad(
    request: CacheRequest,
    load: () => Promise<unknown>,
    isCacheable: (value: unknown) => boolean,
  ): Promise<unknown> {
    if (!this.config.enabled) {
      return load()
    }

    const key = createCacheKey(request)
    const cached = await this.cache.get(key)
    if (cached !== null) {
      if (cached.expiresAt > Date.now()) {
        return cached.value
      }
      await this.cache.unset(key)
    }

    const pending = this.inFlight.get(key)
    if (pending !== undefined) {
      return pending
    }

    const requestPromise = load()
      .then(async (value) => {
        if (
          isCacheable(value) &&
          serializedSize(value) <= this.config.maxEntryBytes
        ) {
          await this.cache.set(key, {
            expiresAt: Date.now() + ttlForRequest(request),
            value,
          })
        }
        return value
      })
      .finally(() => {
        this.inFlight.delete(key)
      })

    this.inFlight.set(key, requestPromise)
    return requestPromise
  }

  async clear(): Promise<void> {
    this.inFlight.clear()
    await this.cache.clear()
  }
}

export function getSharedResponseCache(
  config: ResponseCacheConfig,
): ExplorerResponseCache {
  const identity = `${config.enabled}:${config.maxEntries}:${config.maxEntryBytes}`
  let cache = sharedCaches.get(identity)
  if (cache === undefined) {
    cache = new ExplorerResponseCache(config)
    sharedCaches.set(identity, cache)
  }
  return cache
}

function createCacheKey(request: CacheRequest): string {
  const normalizedParams = Object.entries(request.params)
    .filter(([, value]) => value !== undefined && value !== "")
    .sort(([left], [right]) => left.localeCompare(right))

  return md5({
    baseUrl: new URL(request.baseUrl).toString(),
    chainId: request.chainId,
    moduleName: request.moduleName,
    action: request.action,
    params: normalizedParams,
  })
}

function ttlForRequest(request: CacheRequest): number {
  if (isImmutableRequest(request)) {
    return IMMUTABLE_TTL_MS
  }
  if (isHistoricalRequest(request)) {
    return HISTORICAL_TTL_MS
  }
  return LIVE_TTL_MS
}

function isImmutableRequest(request: CacheRequest): boolean {
  return IMMUTABLE_ACTIONS.has(request.action)
}

function isHistoricalRequest(request: CacheRequest): boolean {
  const blockValues = [
    request.params.endblock,
    request.params.toBlock,
    request.params.tag,
  ]
  return blockValues.some(
    (value) =>
      value !== undefined &&
      value !== "" &&
      value !== OPEN_ENDED_BLOCK &&
      value !== "latest" &&
      value !== "pending",
  )
}

function serializedSize(value: unknown): number {
  const serialized = JSON.stringify(value)
  return Buffer.byteLength(serialized ?? "null", "utf8")
}
