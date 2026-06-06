# MCP Etherscan

A read-only MCP server for the Etherscan API. The base URL and chain ID are configurable, so the same server can target Etherscan V2 or a compatible explorer such as Blockscout, Routescan, or a self-hosted deployment.

The server never signs messages or submits transactions.

## Requirements

- Node.js 20 or newer
- Yarn 1.x for the checked-in lockfile and package scripts

## Why a configurable base URL

Two things are configurable per request: the **base URL** and the **chain ID**. That gives you two ways to point the server at a chain.

**Mode 1: Etherscan V2 unified endpoint.** Etherscan V1 was deprecated on August 15, 2025. V2 uses `https://api.etherscan.io/v2/api` plus a `chainid` query parameter, and one Etherscan API key works across supported chains. Set `baseUrl` to the default and set `chainId` to the target chain.

**Mode 2: standalone explorer.** Point `baseUrl` at the explorer's API endpoint and leave `chainId` empty. The server sends `chainid` only when a chain ID is configured.

## HyperEVM example

HyperEVM is chain ID `999`. You have two working options:

- **Etherscan V2:** `baseUrl = https://api.etherscan.io/v2/api`, `chainId = 999`. HyperEVMScan is operated by Etherscan and is served from the V2 unified endpoint.
- **Standalone:** `baseUrl = <explorer>/api`, `chainId` empty. Use this for a Blockscout-based HyperEVM explorer or a self-hosted node.

## Configuration

On Mission Squad, connection settings are injected per user as hidden values and are not exposed in any tool schema. They are declared in `missionsquad.server.json`:

| Hidden field | Required | Purpose                                                                                                |
| ------------ | -------- | ------------------------------------------------------------------------------------------------------ |
| `apiKey`     | no       | Explorer API key. Optional — leave empty for explorers that need no key.                               |
| `baseUrl`    | no       | API base URL. Defaults to `https://api.etherscan.io/v2/api`.                                           |
| `chainId`    | no       | Chain ID for the V2 unified endpoint (e.g. `1`, `8453`, `999`). Leave empty for a standalone explorer. |

Hidden values always take precedence. When a hidden value is absent, the server falls back to these environment variables, which exist for standalone or single-tenant use:

- `ETHERSCAN_API_KEY`
- `ETHERSCAN_BASE_URL`
- `ETHERSCAN_CHAIN_ID`
- `ETHERSCAN_CACHE_ENABLED` (`true` by default)
- `ETHERSCAN_CACHE_MAX_ENTRIES` (`1000` by default)
- `ETHERSCAN_CACHE_MAX_ENTRY_BYTES` (`2097152`, or 2 MiB, by default)

`baseUrl` must be an absolute HTTP or HTTPS URL without embedded credentials. `chainId`, when present, must be a positive decimal integer. The server starts without making network calls.

## Build and run

```bash
yarn
yarn build
yarn test
yarn smoke
yarn start
```

Useful scripts:

| Script               | Purpose                                                               |
| -------------------- | --------------------------------------------------------------------- |
| `yarn dev`           | Run the TypeScript entry point in watch mode.                         |
| `yarn inspect`       | Open the FastMCP inspector for the source entry point.                |
| `yarn typecheck`     | Type-check source, tests, and test configuration without emitting.    |
| `yarn test`          | Type-check, enforce coverage, build, and audit published MCP schemas. |
| `yarn test:unit`     | Run unit tests without collecting coverage.                           |
| `yarn test:coverage` | Run unit tests and enforce 80% coverage in every metric.              |
| `yarn format`        | Check formatting with the project-local Prettier version.             |
| `yarn smoke`         | Build, initialize the stdio server, and verify `tools/list`.          |
| `yarn pack:check`    | Show the files that would be included in the npm package.             |

The server speaks MCP over stdio.

## Explorer response cache

Successful explorer responses are cached in process memory with `superlru`. This reduces repeated API calls and coalesces concurrent identical requests.

- Cache identity includes the normalized base URL, chain ID, module, action, and sorted request parameters.
- API keys are deliberately excluded from cache identity because explorer data is public and keys affect quota rather than response ownership.
- Every API page is a separate entry. Repeating page 1 can hit the cache; requesting page 2 still makes its own upstream request the first time.
- Live data such as balances, latest blocks, gas, prices, and open-ended ranges has a 10-second TTL.
- Fixed historical block ranges have a 10-minute TTL.
- Contract metadata and transaction-by-hash/status results have a 6-hour TTL.
- Simultaneous identical misses share one in-flight request.
- Only successful responses and documented empty-list responses are cached. API errors, transport failures, malformed responses, and entries exceeding the configured byte limit are not cached.
- LRU eviction limits the number of entries. The cache is local to one server process and is cleared on restart; it is not shared across replicas.

Set `ETHERSCAN_CACHE_ENABLED=false` to disable caching. Adjust `ETHERSCAN_CACHE_MAX_ENTRIES` and `ETHERSCAN_CACHE_MAX_ENTRY_BYTES` to fit the deployment's memory budget.

## Response size controls

Potentially large tools expose `fullOutput`:

- `fullOutput: false` is the default. Responses larger than 25,000 characters are converted into valid JSON previews with `truncated`, `full_output_available`, `original_characters`, and a warning explaining how to request the complete result.
- `fullOutput: true` returns the complete explorer result up to the server's 10 MiB upstream response safety limit. Use it only when the full payload is required because it can consume substantial model context.

Paginated tools also return `fetched_count`, `returned_count`, `page`, `offset`, `has_more`, and `truncated`. Prefer a narrow block range, a smaller `offset`, or the next page before enabling full output.

Large-output controls apply to transaction and transfer lists, event logs, internal calls by hash, contract ABI/source, blocks, transaction/receipt proxy results, `eth_call`, and deployed bytecode. `eth_get_block_by_number` separately defaults `fullTransactions` to `false`; set it to `true` only when every full transaction object is necessary.

## Tools

**Accounts:** `etherscan_get_balance`, `etherscan_get_balance_multi`, `etherscan_get_normal_transactions`, `etherscan_get_internal_transactions`, `etherscan_get_internal_transactions_by_hash`, `etherscan_get_erc20_transfers`, `etherscan_get_erc721_transfers`, `etherscan_get_erc1155_transfers`, `etherscan_get_erc20_token_balance`, `etherscan_get_address_funded_by`

**Contracts:** `etherscan_get_contract_abi`, `etherscan_get_contract_source`, `etherscan_get_contract_creation`

**Transactions:** `etherscan_get_transaction_execution_status`, `etherscan_get_transaction_receipt_status`

**Logs:** `etherscan_get_event_logs`. Search by address and/or topics. `fromBlock` and `toBlock` accept integer block numbers or `latest`, not hex quantities.

**Blocks:** `etherscan_get_block_by_timestamp`

**Proxy (JSON-RPC):** `eth_block_number`, `eth_get_block_by_number`, `eth_get_transaction_by_hash`, `eth_get_transaction_receipt`, `eth_get_transaction_count`, `eth_gas_price`, `eth_call`, `eth_get_code`

**Stats:** `etherscan_get_native_token_price`. Not every explorer or chain implements this endpoint.

## Notes

- `apiKey` is optional. Explorers that do not require a key work without one; the `apikey` parameter is simply omitted.
- Explorer capabilities and maximum page sizes vary. The schema permits `offset` values from 1 to 10,000, but callers should use the smallest practical page size.
- Upstream response bodies are capped at 10 MiB even when `fullOutput` is enabled, preventing an explorer from forcing unbounded memory use.

## References

- [Etherscan V2 migration](https://docs.etherscan.io/etherscan-v2)
- [Event logs endpoint](https://docs.etherscan.io/api-reference/endpoint/getlogs-topics)
- [Get block number by timestamp](https://docs.etherscan.io/api-reference/endpoint/getblocknobytime)
- [Geth/Parity proxy endpoints](https://docs.etherscan.io/api-reference/endpoint/ethblocknumber)
