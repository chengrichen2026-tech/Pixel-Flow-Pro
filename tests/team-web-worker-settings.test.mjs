import assert from "node:assert/strict";
import test from "node:test";

import { pairTeamWebWorker } from "../src/team-web-worker-settings.ts";

test("worker pairing keeps the taskbox-assigned device name", async () => {
  const stored = {};
  let requestBody;
  const originalChrome = globalThis.chrome;
  const originalFetch = globalThis.fetch;
  globalThis.chrome = {
    permissions: {
      contains: async () => true,
      request: async () => true,
    },
    runtime: {
      sendMessage: async () => undefined,
    },
    storage: {
      local: {
        set: async (value) => Object.assign(stored, value),
      },
    },
  };
  globalThis.fetch = async (_url, options) => {
    requestBody = JSON.parse(options.body);
    return {
      ok: true,
      json: async () => ({
        deviceToken: `pfw_${"a".repeat(32)}`,
        workerId: "web-test",
        device: { name: "工作室 Windows 生图机" },
      }),
    };
  };

  try {
    await pairTeamWebWorker("https://relay.example", "1234 5678");
    assert.deepEqual(requestBody, { pairingCode: "12345678" });
    assert.equal(stored.pixelFlowTeamWebWorkerName, "工作室 Windows 生图机");
  } finally {
    globalThis.chrome = originalChrome;
    globalThis.fetch = originalFetch;
  }
});
