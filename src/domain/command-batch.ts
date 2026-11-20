const READ_ONLY_COMMANDS = new Set([
  "run.list",
  "storage.inspect",
  "upscale.capabilities",
  "upscale.inspect"
]);

export function validateCommandBatch(input: unknown): Record<string, unknown>[] {
  const commands = Array.isArray(input) ? input : [input];
  if (!commands.length) throw new Error("At least one command is required.");
  if (commands.some(command => !command || typeof command !== "object" || Array.isArray(command))) {
    throw new Error("Each command must be an object.");
  }
  const typed = commands as Record<string, unknown>[];
  if (typed.length > 1 && typed.some(command => !READ_ONLY_COMMANDS.has(String(command.op || "")))) {
    throw new Error("Batch writes are not supported. Send each write as a separate requestId.");
  }
  return typed;
}
