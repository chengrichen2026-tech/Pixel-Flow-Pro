import assert from "node:assert/strict";
import test from "node:test";
import { requestApiImages, sizeForRatio } from "../public/api-client.js";

const onePixel = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

test("maps canvas ratios to supported API sizes", () => {
  assert.equal(sizeForRatio("1:1"), "1024x1024");
  assert.equal(sizeForRatio("9:16"), "720x1280");
  assert.equal(sizeForRatio("16:9"), "1280x720");
  assert.equal(sizeForRatio("auto"), "1024x1024");
});

test("uses generations JSON request without reference images", async () => {
  let captured;
  const images = await requestApiImages({
    apiKey: "test-key",
    prompt: "rabbit poster",
    ratio: "1:1",
    fetchImpl: async (url, options) => {
      captured = { url, options };
      return new Response(JSON.stringify({ data: [{ b64_json: onePixel }] }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
  });
  assert.equal(captured.url, "https://aihub.rbmanon.cn/v1/images/generations");
  assert.equal(captured.options.headers.Authorization, "Bearer test-key");
  assert.deepEqual(JSON.parse(captured.options.body), { model: "gpt-image-2", prompt: "rabbit poster", size: "1024x1024", quality: "medium", output_format: "png", n: 1 });
  assert.equal(images.length, 1);
});

test("uses edits JSON request with Base64 Data URL images", async () => {
  let captured;
  const images = await requestApiImages({
    apiKey: "test-key",
    prompt: "combine references",
    ratio: "9:16",
    imageBlobs: [
      { blob: new Blob(["a"], { type: "image/png" }), name: "a.png" },
      { blob: new Blob(["b"], { type: "image/jpeg" }), name: "b.jpg" }
    ],
    fetchImpl: async (url, options) => {
      captured = { url, options };
      return new Response(JSON.stringify({ data: [{ b64_json: onePixel }, { b64_json: onePixel }] }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
  });
  assert.equal(captured.url, "https://aihub.rbmanon.cn/v1/images/edits");
  const body = JSON.parse(captured.options.body);
  assert.equal(body.model, "gpt-image-2");
  assert.equal(body.size, "720x1280");
  assert.equal(body.images.length, 2);
  assert.match(body.images[0].image_url, /^data:image\/png;base64,/);
  assert.match(body.images[1].image_url, /^data:image\/jpeg;base64,/);
  assert.equal(body.output_format, "png");
  assert.equal(body.n, 1);
  assert.equal(images.length, 2);
});

test("surfaces compatible API error messages", async () => {
  await assert.rejects(
    requestApiImages({
      apiKey: "bad-key",
      prompt: "test",
      fetchImpl: async () => new Response(JSON.stringify({ error: { message: "invalid key" } }), { status: 401, headers: { "Content-Type": "application/json" } })
    }),
    /invalid key/
  );
});

test("aborts requests that exceed the configured timeout", async () => {
  await assert.rejects(
    requestApiImages({
      apiKey: "test-key",
      prompt: "timeout",
      timeoutMs: 10,
      fetchImpl: async (_url, options) => new Promise((_resolve, reject) => {
        options.signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
      })
    }),
    /等待超过 1 分钟/
  );
});
