/**
 * Registers every tool group on the server. Adding a new module means writing
 * its register function and calling it here.
 */

import type { FastMCP } from "@missionsquad/fastmcp"
import type { AppConfig } from "../config.js"
import { registerAccountTools } from "./accounts.js"
import { registerContractTools } from "./contracts.js"
import { registerTransactionTools } from "./transactions.js"
import { registerLogTools } from "./logs.js"
import { registerBlockTools } from "./blocks.js"
import { registerProxyTools } from "./proxy.js"
import { registerStatsTools } from "./stats.js"

export function registerAllTools(server: FastMCP, defaults: AppConfig): void {
  registerAccountTools(server, defaults)
  registerContractTools(server, defaults)
  registerTransactionTools(server, defaults)
  registerLogTools(server, defaults)
  registerBlockTools(server, defaults)
  registerProxyTools(server, defaults)
  registerStatsTools(server, defaults)
}
