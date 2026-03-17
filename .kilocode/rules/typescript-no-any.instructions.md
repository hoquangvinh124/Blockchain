# typescript-no-any.instructions.md

---
applyTo: "**/*.{ts,tsx}"
---

# TypeScript Type Safety

## No `any`
Never use the `any` type. Every value must have an explicit or inferred concrete type.

## Alternatives to `any`

| Situation | Use instead |
|---|---|
| Type is truly unknown at runtime | `unknown` — forces type narrowing before use |
| Multiple possible types | Union: `string \| number \| MyType` |
| Object with arbitrary string keys | `Record<string, ValueType>` |
| Generic function/class | Type parameter: `function foo<T>(arg: T): T` |
| Third-party lib with no types | Declare a minimal interface or use `@ts-expect-error` with a comment explaining why |

## Examples

```ts
// BAD
function parse(data: any): any { ... }

// GOOD
function parse(data: unknown): ParsedResult {
  if (typeof data !== "object" || data === null) throw new Error("Invalid input");
  ...
}
```

```ts
// BAD
const cache: any = {};

// GOOD
const cache: Record<string, CacheEntry> = {};
```
