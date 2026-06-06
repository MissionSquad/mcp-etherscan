/**
 * Block module tool: resolve a block number from a Unix timestamp.
 *
 * Useful for turning a wall-clock time into a starting block for the account
 * and logs tools.
 */

import { z } from "zod"
import type { FastMCP } from "@missionsquad/fastmcp"
import type { AppConfig } from "../config.js"
import { createEtherscanClient } from "../client.js"
import { toJsonText } from "../format.js"

export function registerBlockTools(server: FastMCP, defaults: AppConfig): void {
  server.addTool({
    name: "etherscan_get_block_by_timestamp",
    description:
      "Get the block number mined at or near a Unix timestamp. 'closest' selects the block just before or just after the timestamp. Read-only.",
    parameters: z.object({
      timestamp: z.number().int().min(0).describe("Unix timestamp in seconds."),
      closest: z
        .enum(["before", "after"])
        .default("before")
        .describe(
          "Whether to return the closest block before or after the timestamp.",
        ),
    }),
    execute: async (args, context) => {
      const client = createEtherscanClient(context.extraArgs, defaults)
      const blockNumber = await client.standardCall<string>(
        "block",
        "getblocknobytime",
        {
          timestamp: args.timestamp,
          closest: args.closest,
        },
      )
      return toJsonText({
        timestamp: args.timestamp,
        closest: args.closest,
        blockNumber,
      })
    },
  })
}
