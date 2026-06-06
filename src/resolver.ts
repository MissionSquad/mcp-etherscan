/**
 * Resolves the per-request connection configuration.
 *
 * Hidden values injected by MissionSquad arrive in `context.extraArgs` because
 * they are not declared in any tool schema. This module reads them, validates
 * their type, and falls back to the local environment defaults when a hidden
 * value is absent. It is the single place that decides which explorer endpoint,
 * chain, and API key a tool call will use.
 */

import { UserError } from "@missionsquad/fastmcp"
import type { AppConfig } from "./config.js"

export interface ResolvedRequestConfig {
  apiKey: string | undefined
  baseUrl: string
  chainId: string | undefined
  cacheEnabled: boolean
  cacheMaxEntries: number
  cacheMaxEntryBytes: number
}

export function resolveRequestConfig(
  extraArgs: Record<string, unknown> | undefined,
  defaults: AppConfig,
): ResolvedRequestConfig {
  const apiKey = readHiddenString(extraArgs, "apiKey") ?? defaults.defaultApiKey
  const baseUrl =
    readHiddenString(extraArgs, "baseUrl") ?? defaults.defaultBaseUrl
  const chainId =
    readHiddenString(extraArgs, "chainId") ??
    readHiddenString(extraArgs, "chainid") ??
    defaults.defaultChainId

  validateBaseUrl(baseUrl)
  validateChainId(chainId)

  return {
    apiKey,
    baseUrl,
    chainId,
    cacheEnabled: defaults.cacheEnabled,
    cacheMaxEntries: defaults.cacheMaxEntries,
    cacheMaxEntryBytes: defaults.cacheMaxEntryBytes,
  }
}

/**
 * Reads a single hidden string value. Returns undefined when the key is absent,
 * but rejects values that are present yet malformed (non-string or empty) so the
 * caller gets a clear, user-facing error instead of a confusing upstream failure.
 */
function readHiddenString(
  extraArgs: Record<string, unknown> | undefined,
  key: string,
): string | undefined {
  const value = extraArgs?.[key]

  if (value === undefined || value === null) {
    return undefined
  }

  if (typeof value !== "string") {
    throw new UserError(
      `Hidden argument "${key}" must be a string when provided.`,
    )
  }

  const trimmed = value.trim()
  if (trimmed.length === 0) {
    throw new UserError(
      `Hidden argument "${key}" must be a non-empty string when provided.`,
    )
  }

  return trimmed
}

function validateBaseUrl(baseUrl: string): void {
  let parsed: URL
  try {
    parsed = new URL(baseUrl)
  } catch {
    throw new UserError("Explorer base URL must be a valid absolute URL.")
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new UserError("Explorer base URL must use http or https.")
  }
  if (parsed.username.length > 0 || parsed.password.length > 0) {
    throw new UserError(
      "Explorer base URL must not contain embedded credentials.",
    )
  }
}

function validateChainId(chainId: string | undefined): void {
  if (chainId !== undefined && !/^[1-9]\d*$/.test(chainId)) {
    throw new UserError(
      "Chain ID must be a positive decimal integer string when provided.",
    )
  }
}
