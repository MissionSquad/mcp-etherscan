/**
 * Proxy module tools: Geth/Parity JSON-RPC pass-through.
 *
 * These call the node directly through the explorer and return JSON-RPC shaped
 * results. Hex quantity results (block number, nonce, gas price) are also
 * decoded to a decimal string for convenience; structured results (blocks,
 * transactions, receipts, call output, bytecode) are returned unchanged.
 */

import { z } from "zod"
import type { FastMCP } from "@missionsquad/fastmcp"
import type { AppConfig } from "../config.js"
import { createEtherscanClient } from "../client.js"
import {
  buildBoundedResponse,
  hexToDecimalString,
  toJsonText,
} from "../format.js"
import {
  addressSchema,
  fullOutputSchema,
  hexBlockTagSchema,
  txHashSchema,
} from "../schemas.js"

const hexDataSchema = z
  .string()
  .regex(/^0x[0-9a-fA-F]*$/, "Data must be a 0x-prefixed hex string.")

export function registerProxyTools(server: FastMCP, defaults: AppConfig): void {
  server.addTool({
    name: "eth_block_number",
    description: "Get the number of the most recent block. Read-only.",
    parameters: z.object({}),
    execute: async (_args, context) => {
      const client = createEtherscanClient(context.extraArgs, defaults)
      const result = await client.proxyCall<unknown>("eth_blockNumber", {})
      return toJsonText({
        blockNumberHex: result,
        blockNumber: hexToDecimalString(result),
      })
    },
  })

  server.addTool({
    name: "eth_get_block_by_number",
    description:
      "Get a block by hex number or named tag. Keep fullTransactions=false for transaction hashes only; fullTransactions=true can create a very large upstream result. Oversized responses are previewed unless fullOutput=true, which can consume substantial model context. Read-only.",
    parameters: z.object({
      tag: hexBlockTagSchema.describe(
        "Block number as a hex string (e.g. 0x10d4f) or a named tag.",
      ),
      fullTransactions: z
        .boolean()
        .default(false)
        .describe(
          "When false (default), include transaction hashes only. When true, include every full transaction object; this can be extremely large and should be used only when those objects are required.",
        ),
      fullOutput: fullOutputSchema,
    }),
    execute: async (args, context) => {
      const client = createEtherscanClient(context.extraArgs, defaults)
      const result = await client.proxyCall<unknown>("eth_getBlockByNumber", {
        tag: args.tag,
        boolean: args.fullTransactions,
      })
      return buildBoundedResponse(result, args.fullOutput)
    },
  })

  server.addTool({
    name: "eth_get_transaction_by_hash",
    description:
      "Get a transaction by hash, including its input data. Contract-creation or calldata-heavy transactions may be large, so oversized responses are previewed unless fullOutput=true. Read-only.",
    parameters: z.object({
      txhash: txHashSchema.describe("Transaction hash to look up."),
      fullOutput: fullOutputSchema,
    }),
    execute: async (args, context) => {
      const client = createEtherscanClient(context.extraArgs, defaults)
      const result = await client.proxyCall<unknown>(
        "eth_getTransactionByHash",
        {
          txhash: args.txhash,
        },
      )
      return buildBoundedResponse(result, args.fullOutput)
    },
  })

  server.addTool({
    name: "eth_get_transaction_receipt",
    description:
      "Get a transaction receipt by hash, including execution status and emitted logs. Receipts with many logs may be large, so oversized responses are previewed unless fullOutput=true. Read-only.",
    parameters: z.object({
      txhash: txHashSchema.describe(
        "Transaction hash to fetch the receipt for.",
      ),
      fullOutput: fullOutputSchema,
    }),
    execute: async (args, context) => {
      const client = createEtherscanClient(context.extraArgs, defaults)
      const result = await client.proxyCall<unknown>(
        "eth_getTransactionReceipt",
        {
          txhash: args.txhash,
        },
      )
      return buildBoundedResponse(result, args.fullOutput)
    },
  })

  server.addTool({
    name: "eth_get_transaction_count",
    description:
      "Get the number of transactions sent from an address (its nonce). Read-only.",
    parameters: z.object({
      address: addressSchema.describe(
        "Address to get the transaction count for.",
      ),
      tag: hexBlockTagSchema
        .default("latest")
        .describe("Block state to read at (hex block number or named tag)."),
    }),
    execute: async (args, context) => {
      const client = createEtherscanClient(context.extraArgs, defaults)
      const result = await client.proxyCall<unknown>(
        "eth_getTransactionCount",
        {
          address: args.address,
          tag: args.tag,
        },
      )
      return toJsonText({
        address: args.address,
        tag: args.tag,
        nonceHex: result,
        nonce: hexToDecimalString(result),
      })
    },
  })

  server.addTool({
    name: "eth_gas_price",
    description: "Get the current gas price in wei. Read-only.",
    parameters: z.object({}),
    execute: async (_args, context) => {
      const client = createEtherscanClient(context.extraArgs, defaults)
      const result = await client.proxyCall<unknown>("eth_gasPrice", {})
      return toJsonText({
        gasPriceHex: result,
        gasPriceWei: hexToDecimalString(result),
      })
    },
  })

  server.addTool({
    name: "eth_call",
    description:
      "Execute an ABI-encoded read-only contract call without creating a transaction. Returns raw hex data that must be ABI-decoded by the caller. Large return data is previewed unless fullOutput=true. Read-only.",
    parameters: z.object({
      to: addressSchema.describe("Contract address to call."),
      data: hexDataSchema.describe("ABI-encoded call data (0x-prefixed hex)."),
      tag: hexBlockTagSchema
        .default("latest")
        .describe(
          "Block state to execute against (hex block number or named tag).",
        ),
      fullOutput: fullOutputSchema,
    }),
    execute: async (args, context) => {
      const client = createEtherscanClient(context.extraArgs, defaults)
      const result = await client.proxyCall<unknown>("eth_call", {
        to: args.to,
        data: args.data,
        tag: args.tag,
      })
      return buildBoundedResponse({ to: args.to, result }, args.fullOutput)
    },
  })

  server.addTool({
    name: "eth_get_code",
    description:
      "Get deployed contract bytecode at an address. A result of 0x means no code is present, as with a wallet. Bytecode can be large, so oversized responses are previewed unless fullOutput=true. Read-only.",
    parameters: z.object({
      address: addressSchema.describe("Address to read the code from."),
      tag: hexBlockTagSchema
        .default("latest")
        .describe("Block state to read at (hex block number or named tag)."),
      fullOutput: fullOutputSchema,
    }),
    execute: async (args, context) => {
      const client = createEtherscanClient(context.extraArgs, defaults)
      const result = await client.proxyCall<unknown>("eth_getCode", {
        address: args.address,
        tag: args.tag,
      })
      return buildBoundedResponse(
        { address: args.address, code: result },
        args.fullOutput,
      )
    },
  })
}
