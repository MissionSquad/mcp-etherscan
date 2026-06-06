# MCP Etherscan Production Readiness

## Checklist

- [x] Verify repository instructions, current worktree state, package manager, FastMCP declarations, and all tool registrations.
- [x] Compare package scripts, metadata, CI, and distribution settings with `mcp-hyperliquid-pro`.
- [x] Audit every tool and input field description for LLM usability, defaults, constraints, output shape, and expensive/full-output warnings.
- [x] Define one shared bounded-output policy with full output disabled by default.
- [x] Apply the output policy to paginated lists and potentially large singleton payloads without duplicating logic.
- [x] Add tests for response bounding, explicit full-output behavior, schema descriptions, hidden-secret exclusion, and tool registration.
- [x] Add production scripts and test/build configuration using project-local dependencies.
- [x] Update README and package metadata to document output controls and supported usage.
- [x] Run format checks, tests, type checking/build, smoke/schema audit, and package-content validation.
- [x] Review the final diff for scope, correctness, DRYness, and accidental secret exposure.

## Review

- Added a shared 25,000-character default response budget and a `fullOutput` opt-in for all 14 tools capable of returning large payloads.
- Paginated responses now distinguish fetched and returned counts, preserve pagination metadata, and never truncate silently.
- Added a 10 MiB upstream body cap, timeout-safe streaming reads, URL/chain validation, query preservation, and malformed-envelope handling.
- Improved LLM-facing tool and field descriptions, including explicit volume warnings, block/tag formats, topic-pair semantics, and cross-field validation.
- Added 14 unit tests, a 26-tool schema audit, an MCP stdio smoke test, test type checking, Prettier configuration, and CI formatting checks.
- Completed npm metadata, declarations, executable CLI build, Node 20 requirement, public publish configuration, MIT license, and documented scripts.
- Verification passed: `yarn prepublishOnly`, `yarn smoke`, `npm pack --dry-run --json`, executable-bit check, and declaration-file check.
- Package dry run contains only `dist`, `README.md`, `LICENSE`, `missionsquad.server.json`, and package metadata; `dist/index.js` is mode `0755`.

## Coverage Expansion

- [x] Record the baseline report and identify production files with no execution coverage.
- [x] Add a typed tool-registration harness using the verified FastMCP `Tool` contract.
- [x] Execute all registered tools with deterministic mocked explorer responses.
- [x] Cover tool validation failures, client error branches, config resolution, and formatting helpers.
- [x] Configure coverage to measure production source while excluding separately executed CLI integration scripts and the process entry point.
- [x] Enforce at least 80% statements, branches, functions, and lines in Vitest.
- [x] Run coverage, typecheck, tests, schema audit, smoke test, formatting, and build.
- [x] Record final coverage percentages and review results.

### Coverage Review

- Baseline: 19.46% statements, 62.13% branches, 50% functions, and 19.46% lines.
- Final: 98.74% statements, 95.47% branches, 98.33% functions, and 98.74% lines.
- Production `src` coverage is 96.64% statements/lines, 93.79% branches, and 95.65% functions.
- Every module under `src/tools` is at 100% for statements, branches, functions, and lines.
- Added a real FastMCP registration harness that executes all 26 tools against deterministic mocked explorer responses.
- Added validation tests for empty transfer/log filters, invalid topic operators, malformed ABI and contract-creation responses, resolver input errors, client transport/API failures, and output-formatting edge cases.
- Coverage excludes only `src/index.ts`, which is the process entry point covered by `yarn smoke`; `scripts/schema-audit.mjs` and `scripts/smoke.mjs` are executable integration checks and are run directly by the release verification.
- Vitest now fails below 80% in any global metric, and the standard `yarn test` command runs the thresholded coverage suite.
- Verification passed: `yarn test`, `yarn smoke`, `yarn build`, and `yarn format`.

## Explorer Response Cache

- [x] Verify the installed `superlru` version, exports, constructor options, and async method signatures.
- [x] Add typed cache configuration with safe defaults and environment overrides.
- [x] Build a shared process-local SuperLRU wrapper with TTL expiration and per-entry size limits.
- [x] Generate stable hashed keys from endpoint, chain, module, action, and normalized parameters without API keys.
- [x] Assign short TTLs to live data, medium TTLs to historical/list data, and long TTLs to immutable contract metadata.
- [x] Coalesce concurrent identical requests and cache only successful validated explorer envelopes.
- [x] Add tests for hits, misses, expiry, page isolation, API-key exclusion, failures, disabled caching, size limits, and request coalescing.
- [x] Document cache scope, configuration, invalidation behavior, and paging interaction.
- [x] Run coverage, typecheck, schema audit, smoke, build, and formatting.

### Cache Review

- Verified `superlru` 1.4.0 from its installed declarations: `SuperLRU<K,V>`, required `maxSize`, asynchronous `get`/`set`/`unset`/`clear`, and optional compression. The implementation uses in-memory mode with compression disabled.
- Added a shared process-local cache used by all per-tool `EtherscanClient` instances.
- Cache keys are MD5 hashes of normalized base URL, chain ID, module, action, and sorted non-empty parameters. API keys are excluded.
- Distinct `page` and `offset` combinations produce distinct entries; the first request for a page calls the explorer and repeated requests within TTL reuse it.
- TTLs: 10 seconds for live/open-ended data, 10 minutes for fixed historical ranges, and 6 hours for contract metadata and transaction-by-hash/status data.
- Concurrent identical misses are coalesced through one in-flight promise.
- Only validated successful responses and documented empty-list responses are stored. Errors, malformed responses, transport failures, and entries over the byte limit are not stored.
- Defaults: enabled, 1,000 entries, maximum 2 MiB per cached entry. Environment overrides are `ETHERSCAN_CACHE_ENABLED`, `ETHERSCAN_CACHE_MAX_ENTRIES`, and `ETHERSCAN_CACHE_MAX_ENTRY_BYTES`.
- The cache is local to one process, bounded by SuperLRU entry count, and cleared on restart. It does not provide cross-replica persistence.
- Verification passed with 43 tests: 98.59% statements/lines, 95.03% branches, and 97.33% functions. `yarn test`, schema audit, stdio smoke test, build, and formatting all pass.
