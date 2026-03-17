---
applyTo: "**/*.{js,ts,jsx,tsx,py,go,java,c,cpp,cs,rb,php,swift,kt,rs,vue,dart,lua,sh,bash}"
---

# Code Comment Rules

## No Emoji
Never use emoji in code comments. Comments must contain only plain text.

## Concise and Precise
- Each comment must state exactly what the code does — no more, no less.
- Avoid filler words: "This function...", "Here we...", "Simply...", "Just...".
- Omit comments that restate the code literally (e.g., `i++ // increment i`).

## What a Good Comment Explains
- **Why** the code exists (non-obvious business logic, workarounds, constraints).
- **What** a function/block does when the name alone is insufficient.
- **Preconditions or invariants** that the reader must know.

## Format
- One sentence per comment when possible.
- No trailing punctuation required for single-sentence inline comments.
- Block comments for functions/classes must describe behavior, not implementation steps.
- Comment đúng chuẩn convention của ngôn ngữ.

## Bad vs Good Examples

```
// BAD: emoji, vague, restates code
// 🚀 Loop through all the items and do stuff
for (const item of items) { ... }

// GOOD: concise, precise
// Skip items without a valid price before applying discount
for (const item of items) { ... }
```

```
// BAD: obvious restatement
const x = a + b; // add a and b

// GOOD: omit entirely, or explain why
const total = subtotal + tax; // tax already includes regional surcharge
```
