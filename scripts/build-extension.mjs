import { copyFile, cp, mkdir, readdir } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const output = resolve(root, "扩展程序");
await mkdir(output, { recursive: true });
await mkdir(resolve(output, "assets"), { recursive: true });
await cp(resolve(root, "public", "icons"), resolve(output, "icons"), { recursive: true });
for (const file of ["manifest.json", "background.js", "contentScript.js", "api-client.js", "icon.svg"]) {
  await copyFile(resolve(root, "public", file), resolve(output, file));
}
await copyFile(resolve(root, "production", "index.html"), resolve(output, "index.html"));
await copyFile(resolve(root, "production", "pixel-flow-theme.css"), resolve(output, "pixel-flow-theme.css"));
await copyFile(resolve(root, "production", "keyboard-shortcuts.js"), resolve(output, "keyboard-shortcuts.js"));
await copyFile(resolve(root, "production", "generation-mode.js"), resolve(output, "generation-mode.js"));
await copyFile(resolve(root, "production", "asset-library.js"), resolve(output, "asset-library.js"));
await copyFile(resolve(root, "production", "brand-logo.png"), resolve(output, "brand-logo.png"));
for (const file of await readdir(resolve(root, "rebuild-preview", "assets"))) {
  await copyFile(resolve(root, "rebuild-preview", "assets", file), resolve(output, "assets", file));
}
console.log("Pixel Flow production build: native src entry");
