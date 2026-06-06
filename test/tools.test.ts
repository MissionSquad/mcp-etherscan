import { afterEach, describe, expect, it, vi } from "vitest"
import { FastMCP, type Context, type Tool } from "@missionsquad/fastmcp"
import type { AppConfig } from "../src/config.js"
import { registerAllTools } from "../src/tools/index.js"

const ADDRESS = `0x${"1".repeat(40)}`
const CONTRACT = `0x${"2".repeat(40)}`
const TX_HASH = `0x${"3".repeat(64)}`
const TOPIC = `0x${"4".repeat(64)}`

const defaults: AppConfig = {
  defaultApiKey: "test-key",
  defaultBaseUrl: "https://example.com/api",
  defaultChainId: "1",
  cacheEnabled: false,
  cacheMaxEntries: 1000,
  cacheMaxEntryBytes: 2 * 1024 * 1024,
}

const context: Context<undefined> = {
  session: undefined,
  extraArgs: undefined,
  reportProgress: async () => undefined,
  log: {
    debug: () => undefined,
    error: () => undefined,
    info: () => undefined,
    warn: () => undefined,
  },
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe("registered tools", () => {
  it("registers and executes all 26 tools with their documented request shapes", async () => {
    const { tools } = captureTools()
    const requestedActions: string[] = []

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const url = new URL(String(input))
        const action = url.searchParams.get("action")
        if (action === null) {
          throw new Error("Missing action")
        }
        requestedActions.push(action)
        return Response.json(responseForAction(action))
      }),
    )

    const inputs: Record<string, Record<string, unknown>> = {
      etherscan_get_balance: { address: ADDRESS },
      etherscan_get_balance_multi: { addresses: [ADDRESS, CONTRACT] },
      etherscan_get_normal_transactions: { address: ADDRESS },
      etherscan_get_internal_transactions: { address: ADDRESS },
      etherscan_get_internal_transactions_by_hash: { txhash: TX_HASH },
      etherscan_get_erc20_transfers: { address: ADDRESS },
      etherscan_get_erc721_transfers: { contractaddress: CONTRACT },
      etherscan_get_erc1155_transfers: {
        address: ADDRESS,
        contractaddress: CONTRACT,
      },
      etherscan_get_erc20_token_balance: {
        contractaddress: CONTRACT,
        address: ADDRESS,
      },
      etherscan_get_address_funded_by: { address: ADDRESS },
      etherscan_get_contract_abi: { address: CONTRACT },
      etherscan_get_contract_source: { address: CONTRACT },
      etherscan_get_contract_creation: {
        contractaddresses: [CONTRACT],
      },
      etherscan_get_transaction_execution_status: { txhash: TX_HASH },
      etherscan_get_transaction_receipt_status: { txhash: TX_HASH },
      etherscan_get_event_logs: {
        address: CONTRACT,
        topic0: TOPIC,
      },
      etherscan_get_block_by_timestamp: { timestamp: 1_700_000_000 },
      eth_block_number: {},
      eth_get_block_by_number: { tag: "latest" },
      eth_get_transaction_by_hash: { txhash: TX_HASH },
      eth_get_transaction_receipt: { txhash: TX_HASH },
      eth_get_transaction_count: { address: ADDRESS },
      eth_gas_price: {},
      eth_call: { to: CONTRACT, data: "0x1234" },
      eth_get_code: { address: CONTRACT },
      etherscan_get_native_token_price: {},
    }

    expect(tools).toHaveLength(26)
    for (const tool of tools) {
      const input = inputs[tool.name]
      if (input === undefined) {
        throw new Error(`Missing test input for ${tool.name}`)
      }
      const output = await executeTool(tool, input)
      expect(typeof output).toBe("string")
      expect(() => JSON.parse(output)).not.toThrow()
    }

    expect(requestedActions).toHaveLength(26)
    expect(new Set(requestedActions)).toEqual(
      new Set([
        "balance",
        "balancemulti",
        "txlist",
        "txlistinternal",
        "tokentx",
        "tokennfttx",
        "token1155tx",
        "tokenbalance",
        "fundedby",
        "getabi",
        "getsourcecode",
        "getcontractcreation",
        "getstatus",
        "gettxreceiptstatus",
        "getLogs",
        "getblocknobytime",
        "eth_blockNumber",
        "eth_getBlockByNumber",
        "eth_getTransactionByHash",
        "eth_getTransactionReceipt",
        "eth_getTransactionCount",
        "eth_gasPrice",
        "eth_call",
        "eth_getCode",
        "ethprice",
      ]),
    )
  })

  it("rejects transfer filters that omit both address fields", async () => {
    const tool = getTool(captureTools().tools, "etherscan_get_erc20_transfers")

    await expect(executeTool(tool, {})).rejects.toThrow(
      "Provide at least one of 'address' or 'contractaddress'.",
    )
  })

  it("rejects a log operator without both referenced topics", async () => {
    const tool = getTool(captureTools().tools, "etherscan_get_event_logs")

    await expect(
      executeTool(tool, {
        topic0: TOPIC,
        topic0_1_opr: "or",
      }),
    ).rejects.toThrow("'topic0_1_opr' requires both 'topic0' and 'topic1'.")
  })

  it("rejects an empty log filter", async () => {
    const tool = getTool(captureTools().tools, "etherscan_get_event_logs")

    await expect(executeTool(tool, {})).rejects.toThrow(
      "Provide an 'address', at least one topic, or both.",
    )
  })

  it("preserves a non-JSON ABI response", async () => {
    const tool = getTool(captureTools().tools, "etherscan_get_contract_abi")
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({ status: "1", message: "OK", result: "not-json" }),
      ),
    )

    const output = await executeTool(tool, { address: CONTRACT })

    expect(JSON.parse(output)).toEqual({
      address: CONTRACT,
      abi: "not-json",
    })
  })

  it("defensively handles a malformed contract creation result", async () => {
    const tool = getTool(
      captureTools().tools,
      "etherscan_get_contract_creation",
    )
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          status: "1",
          message: "OK",
          result: { unexpected: true },
        }),
      ),
    )

    const output = await executeTool(tool, {
      contractaddresses: [CONTRACT],
    })

    expect(JSON.parse(output)).toEqual({
      count: 0,
      results: { unexpected: true },
    })
  })
})

function captureTools(): { tools: Tool<undefined>[] } {
  const server = new FastMCP({
    name: "test-server",
    version: "1.0.0",
  })
  const addTool = vi.spyOn(server, "addTool")

  registerAllTools(server, defaults)

  return {
    tools: addTool.mock.calls.map(([tool]) => tool),
  }
}

function getTool(tools: Tool<undefined>[], name: string): Tool<undefined> {
  const tool = tools.find((candidate) => candidate.name === name)
  if (tool === undefined) {
    throw new Error(`Tool not registered: ${name}`)
  }
  return tool
}

async function executeTool(
  tool: Tool<undefined>,
  input: Record<string, unknown>,
): Promise<string> {
  const args = tool.parameters?.parse(input)
  const result = await tool.execute(args, context)
  if (typeof result !== "string") {
    throw new Error(`Expected ${tool.name} to return JSON text`)
  }
  return result
}

function responseForAction(action: string): Record<string, unknown> {
  if (action.startsWith("eth_")) {
    const proxyResults: Record<string, unknown> = {
      eth_blockNumber: "0x10",
      eth_getBlockByNumber: { number: "0x10", transactions: [TX_HASH] },
      eth_getTransactionByHash: { hash: TX_HASH, input: "0x" },
      eth_getTransactionReceipt: {
        transactionHash: TX_HASH,
        status: "0x1",
        logs: [],
      },
      eth_getTransactionCount: "0x2",
      eth_gasPrice: "0x3b9aca00",
      eth_call: "0x1234",
      eth_getCode: "0x6000",
    }
    return { jsonrpc: "2.0", id: 1, result: proxyResults[action] }
  }

  const standardResults: Record<string, unknown> = {
    balance: "1000000000000000000",
    balancemulti: [
      { account: ADDRESS, balance: "1000000000000000000" },
      { account: CONTRACT, balance: "0" },
    ],
    txlist: [{ hash: TX_HASH }],
    txlistinternal: [{ hash: TX_HASH, type: "call" }],
    tokentx: [{ hash: TX_HASH, tokenSymbol: "TKN" }],
    tokennfttx: [{ hash: TX_HASH, tokenID: "1" }],
    token1155tx: [{ hash: TX_HASH, tokenID: "1", tokenValue: "2" }],
    tokenbalance: "42",
    fundedby: { funderAddress: CONTRACT, txHash: TX_HASH },
    getabi: JSON.stringify([{ type: "function", name: "balanceOf" }]),
    getsourcecode: [{ SourceCode: "contract Test {}" }],
    getcontractcreation: [
      { contractAddress: CONTRACT, contractCreator: ADDRESS },
    ],
    getstatus: { isError: "0", errDescription: "" },
    gettxreceiptstatus: { status: "1" },
    getLogs: [{ address: CONTRACT, topics: [TOPIC] }],
    getblocknobytime: "123456",
    ethprice: { ethusd: "3000.00" },
  }
  return { status: "1", message: "OK", result: standardResults[action] }
}
