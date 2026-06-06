/**
 * Account module tools: native balances, transaction history, internal
 * transactions, token transfer events (ERC-20/721/1155), token balances, and
 * fund-origin tracing. All read-only.
 */

import { z } from "zod"
import { UserError } from "@missionsquad/fastmcp"
import type { FastMCP } from "@missionsquad/fastmcp"
import type { AppConfig } from "../config.js"
import { createEtherscanClient } from "../client.js"
import {
  buildBoundedResponse,
  buildListEnvelope,
  formatUnits,
  toJsonText,
} from "../format.js"
import {
  addressSchema,
  balanceTagSchema,
  endBlockSchema,
  fullOutputSchema,
  offsetSchema,
  pageSchema,
  sortSchema,
  startBlockSchema,
  txHashSchema,
} from "../schemas.js"

const NATIVE_DECIMALS = 18

interface MultiBalanceEntry {
  account: string
  balance: string
}

export function registerAccountTools(
  server: FastMCP,
  defaults: AppConfig,
): void {
  server.addTool({
    name: "etherscan_get_balance",
    description:
      "Get the native token balance (e.g. ETH, HYPE) of a single address. Returns the balance in wei and as a decimal value.",
    parameters: z.object({
      address: addressSchema.describe("Address to query the balance for."),
      tag: balanceTagSchema,
    }),
    execute: async (args, context) => {
      const client = createEtherscanClient(context.extraArgs, defaults)
      const wei = await client.standardCall<string>("account", "balance", {
        address: args.address,
        tag: args.tag,
      })
      return toJsonText({
        address: args.address,
        tag: args.tag,
        balanceWei: wei,
        balance: formatUnits(String(wei), NATIVE_DECIMALS),
      })
    },
  })

  server.addTool({
    name: "etherscan_get_balance_multi",
    description:
      "Get native token balances for up to 20 addresses in one call. Returns each balance in wei and as a decimal value.",
    parameters: z.object({
      addresses: z
        .array(addressSchema)
        .min(1)
        .max(20)
        .describe("List of addresses (1-20) to query balances for."),
      tag: balanceTagSchema,
    }),
    execute: async (args, context) => {
      const client = createEtherscanClient(context.extraArgs, defaults)
      const entries = await client.standardCall<MultiBalanceEntry[]>(
        "account",
        "balancemulti",
        {
          address: args.addresses.join(","),
          tag: args.tag,
        },
      )
      const balances = entries.map(function withDecimal(entry) {
        return {
          account: entry.account,
          balanceWei: entry.balance,
          balance: formatUnits(String(entry.balance), NATIVE_DECIMALS),
        }
      })
      return toJsonText({ tag: args.tag, balances })
    },
  })

  server.addTool({
    name: "etherscan_get_normal_transactions",
    description:
      "List normal (externally originated) transactions for an address. Use block bounds and pagination to keep results focused. Oversized responses are previewed by default; fullOutput=true can consume substantial model context. Read-only.",
    parameters: z.object({
      address: addressSchema.describe(
        "Address whose transaction history to retrieve.",
      ),
      startblock: startBlockSchema,
      endblock: endBlockSchema,
      page: pageSchema,
      offset: offsetSchema,
      sort: sortSchema,
      fullOutput: fullOutputSchema,
    }),
    execute: async (args, context) => {
      const client = createEtherscanClient(context.extraArgs, defaults)
      const result = await client.standardCall<unknown[]>(
        "account",
        "txlist",
        {
          address: args.address,
          startblock: args.startblock,
          endblock: args.endblock,
          page: args.page,
          offset: args.offset,
          sort: args.sort,
        },
        { allowEmpty: true },
      )
      return buildListEnvelope(result, args.page, args.offset, args.fullOutput)
    },
  })

  server.addTool({
    name: "etherscan_get_internal_transactions",
    description:
      "List internal transactions (contract-created calls and value transfers) for an address. Use block bounds and pagination to keep results focused. Oversized responses are previewed by default; fullOutput=true can consume substantial model context. Read-only.",
    parameters: z.object({
      address: addressSchema.describe(
        "Address whose internal transactions to retrieve.",
      ),
      startblock: startBlockSchema,
      endblock: endBlockSchema,
      page: pageSchema,
      offset: offsetSchema,
      sort: sortSchema,
      fullOutput: fullOutputSchema,
    }),
    execute: async (args, context) => {
      const client = createEtherscanClient(context.extraArgs, defaults)
      const result = await client.standardCall<unknown[]>(
        "account",
        "txlistinternal",
        {
          address: args.address,
          startblock: args.startblock,
          endblock: args.endblock,
          page: args.page,
          offset: args.offset,
          sort: args.sort,
        },
        { allowEmpty: true },
      )
      return buildListEnvelope(result, args.page, args.offset, args.fullOutput)
    },
  })

  server.addTool({
    name: "etherscan_get_internal_transactions_by_hash",
    description:
      "List internal calls and value transfers executed within one transaction. Oversized responses are previewed by default; fullOutput=true can consume substantial model context. Read-only.",
    parameters: z.object({
      txhash: txHashSchema.describe(
        "Transaction hash to inspect for internal transactions.",
      ),
      fullOutput: fullOutputSchema,
    }),
    execute: async (args, context) => {
      const client = createEtherscanClient(context.extraArgs, defaults)
      const result = await client.standardCall<unknown[]>(
        "account",
        "txlistinternal",
        { txhash: args.txhash },
        { allowEmpty: true },
      )
      return buildBoundedResponse(
        { txhash: args.txhash, count: result.length, results: result },
        args.fullOutput,
      )
    },
  })

  server.addTool({
    name: "etherscan_get_erc20_transfers",
    description:
      "List ERC-20 transfer events. Provide a holder address, token contract, or both; use block bounds and pagination to narrow results. Oversized responses are previewed by default; fullOutput=true can consume substantial model context. Read-only.",
    parameters: z.object({
      address: addressSchema
        .optional()
        .describe("Holder address to filter transfers by."),
      contractaddress: addressSchema
        .optional()
        .describe("ERC-20 token contract to filter transfers by."),
      startblock: startBlockSchema,
      endblock: endBlockSchema,
      page: pageSchema,
      offset: offsetSchema,
      sort: sortSchema,
      fullOutput: fullOutputSchema,
    }),
    execute: async (args, context) => {
      requireAddressOrContract(args.address, args.contractaddress)
      const client = createEtherscanClient(context.extraArgs, defaults)
      const result = await client.standardCall<unknown[]>(
        "account",
        "tokentx",
        {
          address: args.address,
          contractaddress: args.contractaddress,
          startblock: args.startblock,
          endblock: args.endblock,
          page: args.page,
          offset: args.offset,
          sort: args.sort,
        },
        { allowEmpty: true },
      )
      return buildListEnvelope(result, args.page, args.offset, args.fullOutput)
    },
  })

  server.addTool({
    name: "etherscan_get_erc721_transfers",
    description:
      "List ERC-721 NFT transfer events. Provide a holder address, token contract, or both; use block bounds and pagination to narrow results. Oversized responses are previewed by default; fullOutput=true can consume substantial model context. Read-only.",
    parameters: z.object({
      address: addressSchema
        .optional()
        .describe("Holder address to filter transfers by."),
      contractaddress: addressSchema
        .optional()
        .describe("ERC-721 token contract to filter transfers by."),
      startblock: startBlockSchema,
      endblock: endBlockSchema,
      page: pageSchema,
      offset: offsetSchema,
      sort: sortSchema,
      fullOutput: fullOutputSchema,
    }),
    execute: async (args, context) => {
      requireAddressOrContract(args.address, args.contractaddress)
      const client = createEtherscanClient(context.extraArgs, defaults)
      const result = await client.standardCall<unknown[]>(
        "account",
        "tokennfttx",
        {
          address: args.address,
          contractaddress: args.contractaddress,
          startblock: args.startblock,
          endblock: args.endblock,
          page: args.page,
          offset: args.offset,
          sort: args.sort,
        },
        { allowEmpty: true },
      )
      return buildListEnvelope(result, args.page, args.offset, args.fullOutput)
    },
  })

  server.addTool({
    name: "etherscan_get_erc1155_transfers",
    description:
      "List ERC-1155 multi-token transfer events. Provide a holder address, token contract, or both; use block bounds and pagination to narrow results. Oversized responses are previewed by default; fullOutput=true can consume substantial model context. Read-only.",
    parameters: z.object({
      address: addressSchema
        .optional()
        .describe("Holder address to filter transfers by."),
      contractaddress: addressSchema
        .optional()
        .describe("ERC-1155 token contract to filter transfers by."),
      startblock: startBlockSchema,
      endblock: endBlockSchema,
      page: pageSchema,
      offset: offsetSchema,
      sort: sortSchema,
      fullOutput: fullOutputSchema,
    }),
    execute: async (args, context) => {
      requireAddressOrContract(args.address, args.contractaddress)
      const client = createEtherscanClient(context.extraArgs, defaults)
      const result = await client.standardCall<unknown[]>(
        "account",
        "token1155tx",
        {
          address: args.address,
          contractaddress: args.contractaddress,
          startblock: args.startblock,
          endblock: args.endblock,
          page: args.page,
          offset: args.offset,
          sort: args.sort,
        },
        { allowEmpty: true },
      )
      return buildListEnvelope(result, args.page, args.offset, args.fullOutput)
    },
  })

  server.addTool({
    name: "etherscan_get_erc20_token_balance",
    description:
      "Get the ERC-20 token balance held by an address for a specific token contract. Returns the raw integer balance (token base units).",
    parameters: z.object({
      contractaddress: addressSchema.describe("ERC-20 token contract address."),
      address: addressSchema.describe(
        "Holder address to query the token balance for.",
      ),
      tag: balanceTagSchema,
    }),
    execute: async (args, context) => {
      const client = createEtherscanClient(context.extraArgs, defaults)
      const balance = await client.standardCall<string>(
        "account",
        "tokenbalance",
        {
          contractaddress: args.contractaddress,
          address: args.address,
          tag: args.tag,
        },
      )
      return toJsonText({
        contractaddress: args.contractaddress,
        address: args.address,
        tag: args.tag,
        balance,
      })
    },
  })

  server.addTool({
    name: "etherscan_get_address_funded_by",
    description:
      "Get the address and transaction that first funded a given externally owned account. Useful for tracing fund origins. Not available for contract addresses.",
    parameters: z.object({
      address: addressSchema.describe(
        "Externally owned account to trace the first funding source of.",
      ),
    }),
    execute: async (args, context) => {
      const client = createEtherscanClient(context.extraArgs, defaults)
      const result = await client.standardCall<unknown>("account", "fundedby", {
        address: args.address,
      })
      return toJsonText({ address: args.address, fundedBy: result })
    },
  })
}

function requireAddressOrContract(
  address: string | undefined,
  contractaddress: string | undefined,
): void {
  if (!address && !contractaddress) {
    throw new UserError(
      "Provide at least one of 'address' or 'contractaddress'.",
    )
  }
}
