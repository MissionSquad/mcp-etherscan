/**
 * Contract module tools: verified ABI, verified source code, and contract
 * creation (deployer + creation transaction). All read-only.
 */

import { z } from "zod"
import type { FastMCP } from "@missionsquad/fastmcp"
import type { AppConfig } from "../config.js"
import { createEtherscanClient } from "../client.js"
import { buildBoundedResponse, toJsonText } from "../format.js"
import { addressSchema, fullOutputSchema } from "../schemas.js"

export function registerContractTools(
  server: FastMCP,
  defaults: AppConfig,
): void {
  server.addTool({
    name: "etherscan_get_contract_abi",
    description:
      "Get the ABI of a verified smart contract as parsed JSON. Large ABIs are returned as a bounded structural preview by default; set fullOutput=true only when the complete ABI is required because it can consume substantial model context. Errors if the contract is not verified.",
    parameters: z.object({
      address: addressSchema.describe(
        "Verified contract address to fetch the ABI for.",
      ),
      fullOutput: fullOutputSchema,
    }),
    execute: async (args, context) => {
      const client = createEtherscanClient(context.extraArgs, defaults)
      const raw = await client.standardCall<string>("contract", "getabi", {
        address: args.address,
      })
      let abi: unknown = raw
      try {
        abi = JSON.parse(raw)
      } catch {
        // Leave the raw string in place if it is not valid JSON.
      }
      return buildBoundedResponse(
        { address: args.address, abi },
        args.fullOutput,
      )
    },
  })

  server.addTool({
    name: "etherscan_get_contract_source",
    description:
      "Get verified contract source and metadata including compiler, optimization, proxy, and constructor details. Source bundles can be extremely large, so default output is a bounded preview; set fullOutput=true only when complete source is required and sufficient model context is available. Read-only.",
    parameters: z.object({
      address: addressSchema.describe(
        "Contract address to fetch verified source and metadata for.",
      ),
      fullOutput: fullOutputSchema,
    }),
    execute: async (args, context) => {
      const client = createEtherscanClient(context.extraArgs, defaults)
      const result = await client.standardCall<Array<Record<string, unknown>>>(
        "contract",
        "getsourcecode",
        {
          address: args.address,
        },
      )

      return buildBoundedResponse(
        { address: args.address, results: result },
        args.fullOutput,
      )
    },
  })

  server.addTool({
    name: "etherscan_get_contract_creation",
    description:
      "Get the deployer address and creation transaction hash for up to 5 contracts. Read-only.",
    parameters: z.object({
      contractaddresses: z
        .array(addressSchema)
        .min(1)
        .max(5)
        .describe(
          "List of contract addresses (1-5) to look up creation info for.",
        ),
    }),
    execute: async (args, context) => {
      const client = createEtherscanClient(context.extraArgs, defaults)
      const result = await client.standardCall<unknown[]>(
        "contract",
        "getcontractcreation",
        {
          contractaddresses: args.contractaddresses.join(","),
        },
      )
      return toJsonText({
        count: Array.isArray(result) ? result.length : 0,
        results: result,
      })
    },
  })
}
