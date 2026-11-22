import assert from "node:assert/strict";
import { once } from "node:events";
import { after, before, test } from "node:test";
import express from "express";

import agentRouter from "../routes/agent";

const app = express();
app.use(express.json({ limit: "1mb" }));
app.use(agentRouter);

const server = app.listen(0);
const listening = once(server, "listening");
let endpoint = "";

before(async () => {
  await listening;
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  endpoint = `http://127.0.0.1:${address.port}/agent/local-tools`;
});

after(async () => {
  server.close();
  await once(server, "close");
});

test("local Agent tool endpoint rejects shell command blocks", async () => {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages: [{ role: "user", content: "test" }],
      response: "<cmd>echo this must not run</cmd>",
      includeSearch: false,
    }),
  });

  assert.equal(response.status, 400);
  const body = (await response.json()) as { error: string };
  assert.match(body.error, /not accepted/i);
});

test("local Agent tool endpoint returns plain text without a model call", async () => {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages: [{ role: "user", content: "test" }],
      response: "Local answer.",
      includeSearch: false,
    }),
  });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    text: "Local answer.",
    events: [],
    searchContext: "",
  });
});
