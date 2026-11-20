import { copyFile, mkdir, rename } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const targets = [
  ["src/adapters/chatgpt-content-script.js", "public/contentScript.js"],
  ["src/adapters/gemini-content-script.js", "public/geminiContentScript.js"]
];

await mkdir(resolve(root, "public"), { recursive: true });
for (const [sourcePath, targetPath] of targets) {
  const source = resolve(root, sourcePath);
  const target = resolve(root, targetPath);
  const temporary = `${target}.${process.pid}.tmp`;
  await copyFile(source, temporary);
  await rename(temporary, target);
}
console.log("Pixel Flow content scripts: type-checked sources published");
