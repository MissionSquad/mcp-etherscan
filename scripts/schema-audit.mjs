import { spawn } from "node:child_process"

const LARGE_TOOLS = new Set([
  "etherscan_get_normal_transactions",
  "etherscan_get_internal_transactions",
  "etherscan_get_internal_transactions_by_hash",
  "etherscan_get_erc20_transfers",
  "etherscan_get_erc721_transfers",
  "etherscan_get_erc1155_transfers",
  "etherscan_get_contract_abi",
  "etherscan_get_contract_source",
  "etherscan_get_event_logs",
  "eth_get_block_by_number",
  "eth_get_transaction_by_hash",
  "eth_get_transaction_receipt",
  "eth_call",
  "eth_get_code",
])

const SECRET_KEYS = new Set([
  "apiKey",
  "apikey",
  "baseUrl",
  "chainId",
  "chainid",
])
const child = spawn("node", ["dist/index.js"], {
  stdio: ["pipe", "pipe", "inherit"],
})
const responses = []
let buffer = ""

child.stdout.on("data", (chunk) => {
  buffer += chunk.toString()
  let newlineIndex = buffer.indexOf("\n")
  while (newlineIndex >= 0) {
    const line = buffer.slice(0, newlineIndex).trim()
    buffer = buffer.slice(newlineIndex + 1)
    if (line.length > 0) {
      try {
        responses.push(JSON.parse(line))
      } catch {
        // Ignore non-protocol output; the final timeout reports a useful failure.
      }
    }
    newlineIndex = buffer.indexOf("\n")
  }
})

function send(message) {
  child.stdin.write(`${JSON.stringify(message)}\n`)
}

function fail(message) {
  process.stderr.write(`Schema audit failed: ${message}\n`)
  child.kill("SIGKILL")
  process.exit(1)
}

send({
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "schema-audit", version: "1.0.0" },
  },
})

setTimeout(() => {
  send({ jsonrpc: "2.0", method: "notifications/initialized" })
  send({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} })
}, 200)

setTimeout(() => {
  const listResponse = responses.find((response) => response.id === 2)
  const tools = listResponse?.result?.tools
  if (!Array.isArray(tools)) {
    fail(`tools/list did not return tools: ${JSON.stringify(responses)}`)
  }

  const problems = []
  const toolNames = new Set(tools.map((tool) => tool.name))
  for (const expected of LARGE_TOOLS) {
    if (!toolNames.has(expected)) {
      problems.push(`missing expected large-output tool ${expected}`)
    }
  }

  for (const tool of tools) {
    if (
      typeof tool.description !== "string" ||
      tool.description.trim().length < 20
    ) {
      problems.push(`${tool.name} has an inadequate tool description`)
    }

    const properties = tool.inputSchema?.properties ?? {}
    for (const [name, schema] of Object.entries(properties)) {
      if (SECRET_KEYS.has(name)) {
        problems.push(
          `${tool.name}.${name} exposes a hidden connection setting`,
        )
      }
      if (
        typeof schema?.description !== "string" ||
        schema.description.trim().length === 0
      ) {
        problems.push(`${tool.name}.${name} has no field description`)
      }
    }

    if (LARGE_TOOLS.has(tool.name)) {
      const fullOutput = properties.fullOutput
      if (fullOutput?.default !== false) {
        problems.push(`${tool.name}.fullOutput must exist and default to false`)
      }
      if (!String(tool.description).includes("fullOutput")) {
        problems.push(`${tool.name} does not warn about fullOutput`)
      }
    }
  }

  child.kill("SIGKILL")
  if (problems.length > 0) {
    fail(problems.join("\n"))
  }

  process.stdout.write(`Schema audit passed for ${tools.length} tools.\n`)
  process.exit(0)
}, 1200)
