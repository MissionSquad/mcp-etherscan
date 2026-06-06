/**
 * Stats module tool: native token price.
 *
 * Returns the explorer's reported price for the chain's native token. Not every
 * Etherscan-compatible explorer or chain implements this endpoint; a call may
 * therefore return an error on some targets.
 */

import { z } from "zod"
import type { FastMCP } from "@missionsquad/fastmcp"
import type { AppConfig } from "../config.js"
import { createEtherscanClient } from "../client.js"
import { toJsonText } from "../format.js"

export function registerStatsTools(server: FastMCP, defaults: AppConfig): void {
  server.addTool({
    name: "etherscan_get_native_token_price",
    description:
      "Get the latest price of the chain's native token (the 'ethprice' stats endpoint). Some explorers or chains may not support this. Read-only.",
    parameters: z.object({}),
    execute: async (_args, context) => {
      const client = createEtherscanClient(context.extraArgs, defaults)
      const result = await client.standardCall<unknown>("stats", "ethprice", {})
      return toJsonText(result)
    },
  })
}
