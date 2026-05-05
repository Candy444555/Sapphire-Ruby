// Regression guard for the recurring "bunched words" bug in Lexi mobile chat.
//
// History:
//   * May 3 fix touched the client-side Markdown renderer.
//   * The bug came back because the SERVER's `scrubUserFacingText` called
//     `.trim()` on every streamed chunk, eating leading/trailing spaces at
//     chunk boundaries (e.g. " world" -> "world"), which then concatenated
//     into "helloworld" on the client.
//
// This test simulates the same TAIL_HOLDBACK + scrubber pipeline used in
// `routes/chat.ts` and asserts the joined output preserves every space.
//
// Run with:   pnpm --filter @workspace/api-server run test:scrub

import { test } from "node:test";
import assert from "node:assert/strict";
import { scrubUserFacingText } from "../lib/text-scrub.js";

const TAIL_HOLDBACK = 96;

function streamThrough(tokens: string[]): string {
  // Mirror `flushScrubbed` from routes/chat.ts so this test fails the same
  // way production would if the boundary-whitespace contract regresses.
  let scrubTail = "";
  const emitted: string[] = [];
  const flush = (chunk: string, isFinal: boolean) => {
    scrubTail += chunk;
    let toEmit: string;
    if (isFinal) {
      toEmit = scrubTail;
      scrubTail = "";
    } else if (scrubTail.length > TAIL_HOLDBACK) {
      toEmit = scrubTail.slice(0, scrubTail.length - TAIL_HOLDBACK);
      scrubTail = scrubTail.slice(scrubTail.length - TAIL_HOLDBACK);
    } else {
      toEmit = "";
    }
    if (!toEmit) return;
    const cleaned = scrubUserFacingText(toEmit, { streaming: true });
    if (cleaned.length > 0) emitted.push(cleaned);
  };
  for (const t of tokens) flush(t, false);
  flush("", true);
  return emitted.join("");
}

test("streaming pipeline preserves boundary whitespace across chunks", () => {
  const tokens = ["hello", " ", "world", " ", "this", " is", " a ", "test"];
  const padded = ["x".repeat(TAIL_HOLDBACK + 10), ...tokens, "y".repeat(TAIL_HOLDBACK + 10)];
  const out = streamThrough(padded);
  assert.match(out, /hello world this is a test/);
});

test("streaming pipeline preserves a leading-space token mid-stream", () => {
  // The classic failure: " world" trimmed to "world" concatenates as "helloworld".
  const tokens = ["x".repeat(TAIL_HOLDBACK + 5), "hello", " world", " bar", "y".repeat(TAIL_HOLDBACK + 5)];
  const out = streamThrough(tokens);
  assert.match(out, /hello world bar/);
});

test("streaming pipeline preserves a pure-whitespace token", () => {
  const tokens = ["x".repeat(TAIL_HOLDBACK + 5), "foo", " ", "bar", "y".repeat(TAIL_HOLDBACK + 5)];
  const out = streamThrough(tokens);
  assert.match(out, /foo bar/);
});

test("streaming pipeline preserves double-space runs (markdown indents)", () => {
  // Markdown soft-wrap uses two trailing spaces. The non-streaming scrubber
  // collapses runs of spaces; the streaming scrubber must NOT.
  const tokens = ["x".repeat(TAIL_HOLDBACK + 5), "line1  ", "\nline2", "y".repeat(TAIL_HOLDBACK + 5)];
  const out = streamThrough(tokens);
  assert.match(out, /line1  \nline2/);
});

test("non-streaming scrubber still trims and collapses (unchanged contract)", () => {
  const out = scrubUserFacingText("  hello   world  ");
  assert.equal(out, "hello world");
});

test("non-streaming scrubber still strips URLs and citations", () => {
  // "see https://..." is a citation phrase the scrubber removes wholesale.
  const out = scrubUserFacingText("see https://example.com for more");
  assert.equal(out, "for more");
});
