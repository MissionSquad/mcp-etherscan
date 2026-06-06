import { spawn } from "node:child_process"

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
        // The timeout below reports malformed or missing protocol responses.
      }
    }
    newlineIndex = buffer.indexOf("\n")
  }
})

function send(message) {
  child.stdin.write(`${JSON.stringify(message)}\n`)
}

send({
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "smoke", version: "1.0.0" },
  },
})

setTimeout(() => {
  send({ jsonrpc: "2.0", method: "notifications/initialized" })
  send({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} })
}, 200)

setTimeout(() => {
  const initialize = responses.find((response) => response.id === 1)
  const list = responses.find((response) => response.id === 2)
  child.kill("SIGKILL")

  if (initialize?.result?.serverInfo?.name !== "etherscan-mcp-server") {
    process.stderr.write(
      `Smoke test failed during initialize: ${JSON.stringify(responses)}\n`,
    )
    process.exit(1)
  }
  if (!Array.isArray(list?.result?.tools) || list.result.tools.length === 0) {
    process.stderr.write(
      `Smoke test failed during tools/list: ${JSON.stringify(responses)}\n`,
    )
    process.exit(1)
  }

  process.stdout.write(
    `Smoke test passed with ${list.result.tools.length} tools.\n`,
  )
  process.exit(0)
}, 1200)
