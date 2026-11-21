---
name: Local Agent boundaries
description: User-approved scope for adding an Android on-device GGUF model to Lexi.
---

Keep local GGUF support Android-only and Agent-only. Preserve all current Agent
tools. Do not modify Chat or Code mode. Do not change the saved server URL or
Featherless key. Cellular model downloads are allowed.

**Why:** The user explicitly chose on-phone inference for Agent mode, while
requiring Chat and Code to remain untouched and the current Agent capabilities
to remain available.

**How to apply:** Keep future local-model work inside Agent and its AI Settings
controls. Preserve the existing server configuration and ask before expanding
scope into Chat, Code, iOS, or a different model/runtime.
