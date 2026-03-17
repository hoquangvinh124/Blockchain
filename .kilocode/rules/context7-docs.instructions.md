# context7-docs.instructions.md

---
applyTo: "**/*.{js,ts,jsx,tsx,sol,py,go,vue}"
---

# Context7 MCP Server — Documentation-First Coding

## Rule

Before writing or modifying code that uses any third-party library, framework, or protocol,
you MUST first consult the official documentation via the Context7 MCP server.

This ensures every implementation follows the library's current recommended conventions,
not outdated patterns or hallucinated APIs.

## Mandatory Workflow

1. **Resolve the library ID** — call `mcp_context7_resolve-library-id` with the library name.
2. **Query the relevant docs** — call `mcp_context7_query-docs` with a focused topic query (e.g., `"wagmi useWriteContract hook"`, `"hardhat ignition deploy"`, `"viem getContract"`).
3. **Implement from the documentation** — write code that matches the API signatures, types, and patterns returned by the docs query.

## Scope

Apply to every library that has a Context7 entry, including but not limited to:

| Domain | Libraries |
|---|---|
| Blockchain / EVM | `wagmi`, `viem`, `ethers`, `hardhat`, `openzeppelin-contracts` |
| Frontend | `react`, `react-router`, `tanstack-query`, `tailwindcss`, `shadcn-ui` |
| Build tooling | `vite`, `typescript` |

## When to Skip

- Internal utility code with no external library dependency.
- Pure business logic that does not call any library API.
- Cases where the library has no Context7 entry (document that fact in a comment).

## Example

```ts
// Task: use wagmi to send a transaction

// REQUIRED — before writing any code:
// 1. mcp_context7_resolve-library-id("wagmi")
// 2. mcp_context7_query-docs(libraryId, "useWriteContract send transaction")
// Then write code matching the returned API:

import { useWriteContract } from "wagmi";
```

## Why

Library APIs evolve. Without checking docs, implementations drift toward stale patterns
(e.g., deprecated `usePrepareContractWrite` instead of `useWriteContract`).
Context7 provides version-pinned, accurate references that prevent these mistakes.
