#!/usr/bin/env node
/**
 * Entry point for the Etherscan-compatible MCP server.
 *
 * Startup does no network calls and requires no secrets: the per-request
 * apiKey, baseUrl, and chainId are injected as hidden values on each tool call
 * (or supplied via environment variables for standalone use). This lets the
 * server start cleanly on the MissionSquad platform before any user has
 * configured credentials.
 */

import { FastMCP } from "@missionsquad/fastmcp"
import { loadAppConfig } from "./config.js"
import { registerAllTools } from "./tools/index.js"

function main(): void {
  try {
    const defaults = loadAppConfig()

    const server = new FastMCP({
      name: "etherscan-mcp-server",
      version: "1.0.0",
    })

    registerAllTools(server, defaults)

    server.start({ transportType: "stdio" }).catch(function onStartError(
      error: unknown,
    ) {
      reportFatalError(error)
    })
  } catch (error) {
    reportFatalError(error)
  }
}

function reportFatalError(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error)
  process.stderr.write(`Failed to start etherscan-mcp-server: ${message}\n`)
  process.exit(1)
}

main()
