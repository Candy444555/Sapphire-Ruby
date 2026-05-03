# Lexi JS Skills

This directory holds **permanent JavaScript skill modules** that Lexi has learned
and fused into her own source tree. Each skill is a real CommonJS module exporting
`{ name, description, run(input) }`. They are auto-discovered on server start by
`loadAllJsSkills()` in `../routes/self-patch.ts` and become callable via the skill
router (`POST /api/js-skills/:slug/call`).

When the agent acquires a new skill it emits a `[SELF_PATCH_JS_SKILL]` block —
that block is intercepted server-side, written here as a real `.js` file, added
to `manifest.json`, and immediately registered without a restart.

> Existing Python scripts under `lexi-python-scripts/` keep working for backward
> compatibility, but **new** learning lands here as JS.
