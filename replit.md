# Project Engineering & Efficiency Rules

## Execution Style
- Complete tasks in a single, clean pass whenever possible.
- Read existing files before editing to understand current architecture and naming conventions.
- Modify only the files directly required for the task; never rewrite unrelated working code.
- Keep solutions modular, minimal, and free of redundant dependencies.

## Code Quality & Reliability
- Validate all inputs on both client and server sides.
- Handle loading, empty, and error states explicitly on every UI view.
- Never hardcode secrets, API keys, or mock credentials; use environment variables.
- When fixing a bug, identify the root cause first and apply the smallest surgical fix.

## Verification
- Run the app/tests after changes to confirm zero runtime or build errors before finishing.
