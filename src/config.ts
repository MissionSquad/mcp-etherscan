/**
 * Local-development configuration.
 *
 * On the MissionSquad platform the per-user `apiKey`, `baseUrl`, and `chainId`
 * values are injected as hidden secrets and read from `context.extraArgs`.
 * The environment variables below are only a fallback for running the server
 * standalone (local development or a single-tenant deployment). Hidden values
 * always take precedence over these defaults.
 */

export const DEFAULT_BASE_URL = "https://api.etherscan.io/v2/api"
export const DEFAULT_CACHE_MAX_ENTRIES = 1000
export const DEFAULT_CACHE_MAX_ENTRY_BYTES = 2 * 1024 * 1024

export interface AppConfig {
  defaultApiKey: string | undefined
  defaultBaseUrl: string
  defaultChainId: string | undefined
  cacheEnabled: boolean
  cacheMaxEntries: number
  cacheMaxEntryBytes: number
}

export function loadAppConfig(): AppConfig {
  const envBaseUrl = cleanEnv(process.env.ETHERSCAN_BASE_URL)
  return {
    defaultApiKey: cleanEnv(process.env.ETHERSCAN_API_KEY),
    defaultBaseUrl: envBaseUrl ?? DEFAULT_BASE_URL,
    defaultChainId: cleanEnv(process.env.ETHERSCAN_CHAIN_ID),
    cacheEnabled: readBooleanEnv("ETHERSCAN_CACHE_ENABLED", true),
    cacheMaxEntries: readPositiveIntegerEnv(
      "ETHERSCAN_CACHE_MAX_ENTRIES",
      DEFAULT_CACHE_MAX_ENTRIES,
    ),
    cacheMaxEntryBytes: readPositiveIntegerEnv(
      "ETHERSCAN_CACHE_MAX_ENTRY_BYTES",
      DEFAULT_CACHE_MAX_ENTRY_BYTES,
    ),
  }
}

function cleanEnv(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined
  }
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function readBooleanEnv(name: string, fallback: boolean): boolean {
  const value = cleanEnv(process.env[name])
  if (value === undefined) {
    return fallback
  }
  if (value === "true" || value === "1") {
    return true
  }
  if (value === "false" || value === "0") {
    return false
  }
  throw new Error(`${name} must be true, false, 1, or 0.`)
}

function readPositiveIntegerEnv(name: string, fallback: number): number {
  const value = cleanEnv(process.env[name])
  if (value === undefined) {
    return fallback
  }
  if (!/^[1-9]\d*$/.test(value)) {
    throw new Error(`${name} must be a positive integer.`)
  }
  return Number(value)
}
