/**
 * Transaction module tools: contract execution status and transaction receipt
 * status. All read-only.
 */

import { z } from "zod"
import type { FastMCP } from "@missionsquad/fastmcp"
import type { AppConfig } from "../config.js"
import { createEtherscanClient } from "../client.js"
import { toJsonText } from "../format.js"
import { txHashSchema } from "../schemas.js"

export function registerTransactionTools(
  server: FastMCP,
  defaults: AppConfig,
): void {
  server.addTool({
    name: "etherscan_get_transaction_execution_status",
    description:
      "Get the execution status of a transaction by hash. Returns an error flag and, when the transaction reverted, an error description. Read-only.",
    parameters: z.object({
      txhash: txHashSchema.describe(
        "Transaction hash to check the execution status of.",
      ),
    }),
    execute: async (args, context) => {
      const client = createEtherscanClient(context.extraArgs, defaults)
      const result = await client.standardCall<Record<string, unknown>>(
        "transaction",
        "getstatus",
        {
          txhash: args.txhash,
        },
      )
      return toJsonText({ txhash: args.txhash, status: result })
    },
  })

  server.addTool({
    name: "etherscan_get_transaction_receipt_status",
    description:
      "Get the receipt status of a transaction by hash (1 = success, 0 = failed). Post-Byzantium transactions only. Read-only.",
    parameters: z.object({
      txhash: txHashSchema.describe(
        "Transaction hash to check the receipt status of.",
      ),
    }),
    execute: async (args, context) => {
      const client = createEtherscanClient(context.extraArgs, defaults)
      const result = await client.standardCall<Record<string, unknown>>(
        "transaction",
        "gettxreceiptstatus",
        {
          txhash: args.txhash,
        },
      )
      return toJsonText({ txhash: args.txhash, receiptStatus: result })
    },
  })
}
