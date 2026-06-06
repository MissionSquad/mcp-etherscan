/**
 * Logs module tool: event log search.
 *
 * Mirrors the Etherscan Event Log API, an alternative to the native
 * eth_getLogs. fromBlock/toBlock take integer block numbers (NOT hex) or the
 * string "latest"; earliest/pending are not supported. Topics are 32-byte hex
 * values, and an address and/or at least one topic is required. Pair operators
 * are optional because compatible explorers default them to "and".
 */

import { z } from "zod"
import { UserError } from "@missionsquad/fastmcp"
import type { FastMCP } from "@missionsquad/fastmcp"
import type { AppConfig } from "../config.js"
import { createEtherscanClient } from "../client.js"
import { buildListEnvelope } from "../format.js"
import {
  addressSchema,
  fullOutputSchema,
  offsetSchema,
  pageSchema,
} from "../schemas.js"

const blockBoundSchema = z
  .union([z.number().int().min(0), z.literal("latest")])
  .describe(
    "Block number (integer, not hex) or 'latest'. earliest/pending are not supported.",
  )

const topicSchema = z
  .string()
  .regex(
    /^0x[0-9a-fA-F]{64}$/,
    "A topic must be a 0x-prefixed 32-byte (64-hex-character) value.",
  )

const topicOperatorSchema = z
  .enum(["and", "or"])
  .describe(
    "Optional operator combining a specific topic pair. Omit for the explorer's default 'and' behavior; use 'or' only when either topic may match.",
  )

export function registerLogTools(server: FastMCP, defaults: AppConfig): void {
  server.addTool({
    name: "etherscan_get_event_logs",
    description:
      "Search EVM event logs by contract address and/or indexed topics. Provide an address, at least one topic, or both. Topic-pair operators are optional and default to the explorer's 'and' behavior; set an operator to request 'or'. Narrow the block range and offset to control volume. Oversized responses are previewed by default; fullOutput=true can consume substantial model context. Read-only.",
    parameters: z.object({
      address: addressSchema
        .optional()
        .describe("Contract address whose logs to retrieve."),
      fromBlock: blockBoundSchema.default(0),
      toBlock: blockBoundSchema.default("latest"),
      topic0: topicSchema
        .optional()
        .describe("First topic, typically the event signature hash."),
      topic1: topicSchema.optional().describe("Second topic."),
      topic2: topicSchema.optional().describe("Third topic."),
      topic3: topicSchema.optional().describe("Fourth topic."),
      topic0_1_opr: topicOperatorSchema
        .optional()
        .describe("How topic0 and topic1 are combined."),
      topic1_2_opr: topicOperatorSchema
        .optional()
        .describe("How topic1 and topic2 are combined."),
      topic2_3_opr: topicOperatorSchema
        .optional()
        .describe("How topic2 and topic3 are combined."),
      topic0_2_opr: topicOperatorSchema
        .optional()
        .describe("How topic0 and topic2 are combined."),
      topic0_3_opr: topicOperatorSchema
        .optional()
        .describe("How topic0 and topic3 are combined."),
      topic1_3_opr: topicOperatorSchema
        .optional()
        .describe("How topic1 and topic3 are combined."),
      page: pageSchema,
      offset: offsetSchema,
      fullOutput: fullOutputSchema,
    }),
    execute: async (args, context) => {
      validateLogFilter(args)
      const client = createEtherscanClient(context.extraArgs, defaults)
      const result = await client.standardCall<unknown[]>(
        "logs",
        "getLogs",
        {
          address: args.address,
          fromBlock: args.fromBlock,
          toBlock: args.toBlock,
          topic0: args.topic0,
          topic1: args.topic1,
          topic2: args.topic2,
          topic3: args.topic3,
          topic0_1_opr: args.topic0_1_opr,
          topic1_2_opr: args.topic1_2_opr,
          topic2_3_opr: args.topic2_3_opr,
          topic0_2_opr: args.topic0_2_opr,
          topic0_3_opr: args.topic0_3_opr,
          topic1_3_opr: args.topic1_3_opr,
          page: args.page,
          offset: args.offset,
        },
        { allowEmpty: true },
      )
      return buildListEnvelope(result, args.page, args.offset, args.fullOutput)
    },
  })
}

interface LogFilter {
  address?: string
  topic0?: string
  topic1?: string
  topic2?: string
  topic3?: string
  topic0_1_opr?: "and" | "or"
  topic1_2_opr?: "and" | "or"
  topic2_3_opr?: "and" | "or"
  topic0_2_opr?: "and" | "or"
  topic0_3_opr?: "and" | "or"
  topic1_3_opr?: "and" | "or"
}

function validateLogFilter(filter: LogFilter): void {
  const hasTopic =
    filter.topic0 !== undefined ||
    filter.topic1 !== undefined ||
    filter.topic2 !== undefined ||
    filter.topic3 !== undefined
  if (filter.address === undefined && !hasTopic) {
    throw new UserError("Provide an 'address', at least one topic, or both.")
  }

  const pairs = [
    ["topic0", "topic1", "topic0_1_opr"],
    ["topic1", "topic2", "topic1_2_opr"],
    ["topic2", "topic3", "topic2_3_opr"],
    ["topic0", "topic2", "topic0_2_opr"],
    ["topic0", "topic3", "topic0_3_opr"],
    ["topic1", "topic3", "topic1_3_opr"],
  ] as const

  for (const [left, right, operator] of pairs) {
    const hasLeft = filter[left] !== undefined
    const hasRight = filter[right] !== undefined
    const hasOperator = filter[operator] !== undefined
    if (hasOperator && (!hasLeft || !hasRight)) {
      throw new UserError(
        `'${operator}' requires both '${left}' and '${right}'.`,
      )
    }
  }
}
