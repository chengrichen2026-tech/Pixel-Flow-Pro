import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { build } from "vite";

const root = resolve(import.meta.dirname, "..");
const outDir = resolve(root, ".runtime", "background-build");
const target = resolve(root, "public", "background.js");
const temporary = `${target}.${process.pid}.tmp`;
const shadowOnly = process.env.PIXEL_FLOW_BACKGROUND_SHADOW === "1";

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });
await build({
  configFile: false,
  publicDir: false,
  logLevel: "warn",
  build: {
    outDir,
    emptyOutDir: true,
    minify: false,
    sourcemap: false,
    lib: {
      entry: resolve(root, "src", "background", "service-worker.ts"),
      formats: ["es"],
      fileName: () => "background.js"
    },
    rollupOptions: {
      external: id => id === "./api-client.js"
    }
  }
});

const output = await readFile(resolve(outDir, "background.js"));
const source = output.toString("utf8");
if (source.includes("require_dexie()") && !source.includes("var require_dexie")) {
  throw new Error("Generated background contains an unresolved Dexie runtime reference");
}
if (!shadowOnly) {
  await writeFile(temporary, output);
  await rename(temporary, target);
}
console.log(`Pixel Flow background build: ${output.byteLength} bytes`);
