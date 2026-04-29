# Agent Guidelines

## Markdown Formatting Rules

### Headings Instead of Bold Text

- Do NOT use bold text as headings (e.g., `**Route Planning:**`)
- Always use proper nested markdown headings instead
  - Use `####` (level 4) headings for subsections within level 3 sections
  - Example: Convert `**Route Planning:**` to `#### Route Planning`
  - Remove the colon when converting to heading syntax

## Language

- Use American English spellings in all code, comments, and documentation
- Examples: color (not colour), meter (not metre), behavior (not behaviour), center (not centre)
- Exception: spec-defined attribute names such as `aria-labelledby` are fixed and must not be changed

## Collaborative Editing

- When the user is actively editing a file, do NOT overwrite changes they made after the agent's last write.
- Always re-read a file immediately before editing it to get the current state.

## Formatting

- ALWAYS run `deno task fmt` from the project root after finishing any file changes. (Plain `deno fmt .` will fail on
  SVG files in this project.)

## Code Comments

- Do NOT remove extant comments
- Move and reword them only if absolutely necessary

## Documentation

- Keep documentation clear and concise
- Use present tense when describing completed features
- Always reference relevant external resources (e.g., Grand Theft Wiki)
