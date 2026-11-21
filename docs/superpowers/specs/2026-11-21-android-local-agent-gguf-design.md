# Android Local GGUF Agent Design

## Problem

Lexi's Agent currently sends requests to the API server, where the server calls
Featherless and automatically executes `<cmd>` blocks. The user wants the
`mini-agent-v2-Q4_K_M.gguf` model to run on their Android phone, while keeping
the existing Agent tools and requiring a tap before any generated terminal
command runs.

The model file is 986,050,816 bytes (about 986 MB). The user chose cellular
downloads, Android only, and Agent-only changes. Chat and Code must remain
untouched. The saved API server URL and Featherless key must not change.

## Goals

- Download the public GGUF model to app-private phone storage, showing download
  progress and allowing cancellation and retry.
- Run local inference in Agent mode with `llama.rn`, memory-mapped weights,
  `n_ctx: 2048`, `n_threads: 2`, and `n_gpu_layers: 0`.
- Keep all current Agent tools available, including search, project completion,
  and code/skill fusion.
- Require explicit approval before every Agent-generated shell command is sent
  to the terminal.
- Limit model context to the latest six messages and trim long tool output.
- Leave Chat and Code behavior, the saved server URL, and Featherless key
  unchanged.

## Non-goals

- Running the model on iOS, the Replit server, or Expo Go.
- Making all Agent tools work offline. Local text generation is on-device, but
  server-backed tools still need network access.
- Changing or removing the existing Featherless Agent endpoint.
- Claiming a hard 3 GB process-memory ceiling without testing on the target
  phone.
- Changing the model, context size, or other approved limits without asking.

## Existing behavior and constraints

- `useAgentChat` currently calls `/api/agent`.
- `/api/agent` calls Featherless, keeps up to 12 messages in its model prompt,
  runs `<cmd>` blocks immediately, and returns terminal output capped at 4,000
  characters.
- The same route provides search context, `needs_input`, self-patching, Python
  scripts, JS skills, and project-completion events. These must remain
  available to local Agent mode.
- Terminal-session endpoints already exist. Search and project metadata logic
  are currently coupled to the server Agent route, so the local flow needs a
  model-free server tool endpoint to use those capabilities without calling
  Featherless.
- `expo-file-system` is already present in the mobile app. A native llama
  module requires a custom Android development build; it does not run in Expo
  Go.

## Proposed architecture

### Model storage and download

1. On app startup, check the app-private `FileSystem.documentDirectory` for
   `mini-agent-v2-Q4_K_M.gguf`.
2. If absent, download the exact file from the public Hugging Face repository
   at the pinned revision:
   `https://huggingface.co/F-A-I-L/mini-agent-v2-GGUF/resolve/c9385e703ecf186e2f6a8f3efe175fd1201a0c36/mini-agent-v2-Q4_K_M.gguf`.
   Cellular use is allowed.
3. Show progress, downloaded size, and a cancel action in AI Settings and in
   the Agent model-not-ready state. Do not change the Chat UI.
4. Write to a temporary file and move it into its final name only after a
   successful download. Validate the expected size of 986,050,816 bytes and
   SHA-256 `7956a3cc0ccad6789a1ddcb24e5ca33fca34e6eca0243a465e78a13f240ce116`
   before accepting the file. A partial or invalid file must never be treated
   as a usable model.
5. Report network, storage, and validation failures with a retry action. Do not
   silently fall back to Featherless for Agent inference.

### Local Agent inference

- Add `llama.rn` and its required Expo config plugin to the Android app.
- Load the model only for Agent use. Configure memory mapping, a 2,048-token
  context, two CPU threads, and zero GPU layers.
- Use a client-side Agent loop for local model generation. Chat and Code
  continue using their existing code paths.
- Keep the saved user system prompt unchanged. Send at most the latest six
  messages, trim tool output to 2,000 characters before adding it to the next
  model step, and budget the prompt against the 2,048-token context. If fixed
  instructions plus the saved Agent prompt cannot fit, show an error instead
  of silently changing the saved prompt.

### Existing Agent tools

- Add a separate API-server endpoint that exposes Agent tools without calling
  any model. Keep the current `/api/agent` behavior and its Featherless
  configuration intact.
- Use that endpoint for existing search and Tor-search behavior, project
  completion metadata, and code/skill fusion. Use the existing terminal
  session routes for approved shell commands.
- Preserve the current Agent event types and visible results so project cards,
  self-patch results, command output, and follow-up questions continue to work.

### Command confirmation

- Do not send an Agent-generated command to the terminal when it is first
  parsed.
- Show the exact command in an Agent-only confirmation panel with **Run** and
  **Cancel** actions.
- Call the terminal endpoint only after **Run**. On **Cancel**, do not execute
  the command and tell the local Agent that it was declined.
- Gate each command separately. Chat and Code mode are not modified.

## Memory and device limits

The Q4_K_M file is about 986 MB. Memory mapping, CPU-only inference, two
threads, a 2,048-token context, a six-message window, and trimmed tool output
are intended to reduce memory use. They do not guarantee a hard 3 GB ceiling:
Android system memory and native runtime overhead vary by phone.

Verify inference and memory behavior on the user's 4 GB Android phone. If the
observed process exceeds the 3 GB target or the app is killed, stop and ask
before changing the model or settings.

## Error handling

- Download interrupted: keep or discard the temporary file safely; offer retry.
- Low storage or network failure: show a specific error and do not initialize
  a partial model.
- Model initialization failure: show a retryable local-model error; do not
  call Featherless as a fallback.
- Tool endpoint unavailable: report that a server-backed tool needs a
  connection; local text generation remains available.
- Command canceled: never call the terminal endpoint for that command.

## Acceptance criteria

1. On Android, a missing model is downloaded to app-private storage with
   visible progress; canceling or interrupting the download does not leave a
   loadable partial file.
2. Agent inference uses the downloaded GGUF with the approved runtime values
   and does not call Featherless.
3. The latest six messages are used as history; long tool output is trimmed
   before the next local model step.
4. No Agent-generated command executes before **Run** is tapped; **Cancel**
   results in zero executions.
5. Search, project completion, self-patching, Python/JS skill fusion,
   `needs_input`, and normal Agent events remain available.
6. Chat and Code code paths, saved API server URL, and Featherless key are
   unchanged.
7. Type checks and relevant tests pass, and the app builds as an Android
   development client. A hard 3 GB claim is withheld until measured on the
   target device.
