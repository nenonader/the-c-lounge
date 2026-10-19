// Made By Eng Nayer Nader
import assert from "node:assert/strict";
import test from "node:test";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

// This case exercises the optional Vite/Worker build, not the Render
// deployment. Running it without `npm run build` used to abort the whole suite
// with MODULE_NOT_FOUND, which made `node --test tests/*.mjs` look broken on a
// clean checkout. Skip cleanly instead; the build step still runs it in CI.
const workerPath = fileURLToPath(new URL("../dist/server/index.js", import.meta.url));

test("redirects the app root to the canonical static homepage", { skip: !existsSync(workerPath) && "dist/server/index.js not built — run `npm run build` first" }, async () => {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  const response = await worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );

  assert.equal(response.status, 307);
  assert.equal(response.headers.get("location"), "http://localhost/index.html");
});
