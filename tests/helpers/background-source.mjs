import { readFile } from "node:fs/promises";

const root = new URL("../../", import.meta.url);
const sourceFiles = [
  "src/domain/queue.ts",
  "src/domain/aspect-ratio.ts",
  "src/domain/run-projection.ts",
  "src/background/task-scope.ts",
  "src/background/notification-target.ts",
  "src/background/binary.ts",
  "src/background/keyed-serial-queue.ts",
  "src/background/protocol.ts",
  "src/background/chatgpt-url.ts",
  "src/background/chatgpt-adapter-bridge.ts",
  "src/background/task-tab-grouper.ts",
  "src/background/tab-registry.ts",
  "src/background/api-worker-client.ts",
  "src/background/team-gateway-http.ts",
  "src/background/generation-projector.ts",
  "src/storage/database.ts",
  "src/storage/project-repository.ts",
  "src/background/service-worker.ts"
];

export async function readBackgroundSource() {
  return (await Promise.all(sourceFiles.map(file => readFile(new URL(file, root), "utf8")))).join("\n");
}
