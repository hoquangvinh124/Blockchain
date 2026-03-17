---
applyTo: "**"
---

# Summary Tracking

After completing any task or user-requested change, append an entry to `summary.md` in the workspace root (`c:\Blockchain\summary.md`).

## Entry Format

```
## [YYYY-MM-DD] <Short title of the task>

**Task:** <One sentence describing what the user asked for>

**Changes:**
- `path/to/file` — what was added, modified, or deleted and why

**Scope:** <Which files/folders/languages are affected>

**Effect:** <What behavior or rule this enforces or introduces>
```

## Writing Style

Use the `doc-coauthoring` skill when generating content into `summary.md`:
- Write clear, structured prose — not terse bullet dumps.
- Each entry must be self-contained and readable without surrounding context.
- Describe *why* a change was made, not just *what* changed.
- Use the same language the user used for that session.

## Rules

- Create `summary.md` if it does not exist yet.
- Always append — never overwrite existing entries.
- Be specific: list every file touched with a brief reason.
- If a file was deleted, note it as `deleted: path/to/file`.
- Keep each entry self-contained so it can be understood without reading the others.
- Write in the same language the user used for that session.
