import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const cli = fileURLToPath(new URL("../plugins/tokenresearch-image-gen/skills/tokenresearch-image-gen/scripts/generate.mjs", import.meta.url));
const fixture = `
globalThis.fetch = async (url, options) => {
  if (url !== "https://ciyuanzhiyan.com/v1/models") throw new Error("Unexpected request");
  const key = options.headers.Authorization;
  if (key === "Bearer test-invalid-key") return new Response(null, { status: 401 });
  const ids = {
    "Bearer test-no-images": ["text-model"],
    "Bearer test-default-key": ["gpt-image-2", "text-model"],
    "Bearer test-other-group": ["gemini-3-pro-image", "gemini-3.1-flash-image"],
  }[key];
  if (!ids) throw new Error("Unexpected credential");
  return new Response(JSON.stringify({ data: ids.map((id) => ({ id })) }));
};
`;

function createTestClient(t) {
  const directory = mkdtempSync(join(tmpdir(), "tokenresearch-setup-"));
  const configPath = join(directory, "image-gen.json");
  const preload = join(directory, "gateway.cjs");
  writeFileSync(preload, fixture);
  const env = { ...process.env, TOKENRESEARCH_CONFIG_DIR: directory, TOKENRESEARCH_CATALOG_URL: "", TOKENRESEARCH_KEY: "" };
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  function start(args, envOverrides = {}) {
    const child = spawn(process.execPath, ["--require", preload, cli, ...args], {
      env: { ...env, ...envOverrides },
      stdio: ["ignore", "pipe", "pipe"],
    });
    const lines = createInterface({ input: child.stdout });
    let output = "";
    let url;
    const ready = new Promise((resolve) => {
      lines.on("line", (line) => {
        output += line + "\n";
        if (line.startsWith("SETUP_URL: ")) {
          url = new URL(line.slice("SETUP_URL: ".length));
          resolve(url);
        }
      });
    });
    child.stderr.on("data", (chunk) => { output += chunk.toString("utf8"); });
    const exited = new Promise((resolve, reject) => {
      child.once("error", reject);
      child.once("close", (code) => resolve({ code, output }));
    });
    t.after(() => { if (child.exitCode === null) child.kill(); });
    return {
      get ready() {
        return Promise.race([ready, exited.then(({ output }) => { throw new Error(output); })]);
      },
      exited,
      post(data, origin = url.origin) {
        return fetch(url, {
          method: "POST",
          headers: { Origin: origin, "Content-Type": "application/json" },
          body: JSON.stringify(data),
        });
      },
    };
  }
  return { configPath, start, read: () => JSON.parse(readFileSync(configPath, "utf8")) };
}

test("first use validates the Key, saves it locally and exposes the group in the next process", { timeout: 10_000 }, async (t) => {
  const client = createTestClient(t);
  const setup = client.start(["--setup"]);
  const url = await setup.ready;
  assert.equal(url.hostname, "127.0.0.1");
  const page = await fetch(url);
  assert.equal(page.headers.get("cache-control"), "no-store");
  assert.match(await page.text(), /type="password"/);
  assert.equal((await setup.post({ action: "verify", key: "test-default-key" }, "https://outside.example")).status, 403);
  assert.equal((await setup.post({ action: "verify", key: "test-invalid-key" })).status, 502);
  assert.equal((await setup.post({ action: "verify", key: "test-no-images" })).status, 422);
  assert.equal(existsSync(client.configPath), false);

  const response = await setup.post({ action: "verify", key: "test-default-key" });
  assert.deepEqual(await response.json(), { model: "gpt-image-2" });
  const exit = await setup.exited;
  assert.equal(exit.code, 0);
  assert.match(exit.output, /SETUP_COMPLETE: Default model gpt-image-2/);
  assert.doesNotMatch(exit.output, /test-default-key|test-invalid-key/);
  assert.equal(client.read().workers[0].apiKey, "test-default-key");
  if (process.platform !== "win32") assert.equal(statSync(client.configPath).mode & 0o777, 0o600);

  const list = await client.start(["--list-models"]).exited;
  assert.equal(list.code, 0);
  assert.deepEqual(JSON.parse(list.output).models.filter(({ available }) => available).map(({ id }) => id), ["gpt-image-2"]);
  assert.match((await client.start(["--setup"]).exited).output, /SETUP_SKIPPED/);
});

test("replacing a Key preserves the old configuration until the user chooses an available model", { timeout: 10_000 }, async (t) => {
  const client = createTestClient(t);
  await client.start(["--set-key", "test-default-key"]).exited;
  assert.match((await client.start(["--setup", "--replace-key"], { TOKENRESEARCH_KEY: "test-env-key" }).exited).output, /SETUP_SKIPPED: TOKENRESEARCH_KEY/);
  const setup = client.start(["--setup", "--replace-key"]);
  await setup.ready;
  const response = await setup.post({ action: "verify", key: "test-other-group" });
  assert.deepEqual(await response.json(), { models: ["gemini-3.1-flash-image", "gemini-3-pro-image"] });
  assert.equal((await setup.post({ action: "save", model: "gpt-image-2" })).status, 400);
  assert.equal(client.read().workers[0].apiKey, "test-default-key");
  const saved = await setup.post({ action: "save", model: "gemini-3-pro-image" });
  assert.deepEqual(await saved.json(), { model: "gemini-3-pro-image" });
  assert.equal((await setup.exited).code, 0);
  assert.equal(client.read().model, "gemini-3-pro-image");
  assert.equal(client.read().workers[0].apiKey, "test-other-group");
});
