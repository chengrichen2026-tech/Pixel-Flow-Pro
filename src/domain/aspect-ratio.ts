const ratioInstructions: Readonly<Record<string, string>> = {
  auto: "画面比例要求：请根据参考图、主体内容和使用场景，自动选择最合适的画面比例。",
  "1:1": "画面比例要求：请生成正方形 1:1 比例的图片。",
  "3:4": "画面比例要求：请生成竖向 3:4 比例的图片。",
  "4:3": "画面比例要求：请生成横向 4:3 比例的图片。",
  "4:5": "画面比例要求：请生成竖向 4:5 比例的图片。",
  "5:4": "画面比例要求：请生成横向 5:4 比例的图片。",
  "2:3": "画面比例要求：请生成竖向 2:3 比例的图片。",
  "3:2": "画面比例要求：请生成横向 3:2 比例的图片。",
  "9:16": "画面比例要求：请生成竖向 9:16 比例的图片。",
  "16:9": "画面比例要求：请生成横向 16:9 比例的图片。",
  "21:9": "画面比例要求：请生成超宽横向 21:9 比例的图片。"
};

export function appendAspectRatioPrompt(prompt: string, ratio: string): string {
  const instruction = ratioInstructions[ratio] ?? ratioInstructions.auto;
  const withoutExistingInstruction = prompt.replace(/(?:^|\r?\n+)画面比例要求：[^\r\n]*/g, "");
  const content = withoutExistingInstruction === prompt ? prompt : withoutExistingInstruction.trimEnd();
  return content ? `${content}\n\n${instruction}` : instruction;
}
