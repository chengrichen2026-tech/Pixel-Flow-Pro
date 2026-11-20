export const safeChatGptUrl = (url?: string): string =>
  url?.startsWith("https://chatgpt.com/") ? url : "https://chatgpt.com/";

const comparableChatGptUrl = (url?: string): string => {
  const parsed = new URL(safeChatGptUrl(url));
  const pathname = parsed.pathname.replace(/\/+$/, "") || "/";
  return `${parsed.origin}${pathname}`;
};

export const expectedChatGptConversationMatches = (actualUrl?: string, expectedUrl?: string): boolean =>
  actualUrl?.startsWith("https://chatgpt.com/") === true
  && comparableChatGptUrl(actualUrl) === comparableChatGptUrl(expectedUrl);

export type BrowserProvider = "chatgpt" | "gemini";

export const safeGeminiUrl = (url?: string): string =>
  url?.startsWith("https://gemini.google.com/app") ? url : "https://gemini.google.com/app";

const comparableGeminiUrl = (url?: string): string => {
  const parsed = new URL(safeGeminiUrl(url));
  const pathname = parsed.pathname.replace(/\/+$/, "") || "/app";
  return `${parsed.origin}${pathname}`;
};

export const expectedGeminiConversationMatches = (actualUrl?: string, expectedUrl?: string): boolean => {
  if (!actualUrl?.startsWith("https://gemini.google.com/app")) return false;
  const expected = comparableGeminiUrl(expectedUrl);
  return expected === "https://gemini.google.com/app" || comparableGeminiUrl(actualUrl) === expected;
};

export function concreteGeminiConversationUrl(url?: string): string | undefined {
  if (!url?.startsWith("https://gemini.google.com/app/")) return undefined;
  try {
    const parsed = new URL(url);
    return /^\/app\/[^/?#]+\/?$/.test(parsed.pathname) ? `${parsed.origin}${parsed.pathname}` : undefined;
  } catch {
    return undefined;
  }
}

export const safeBrowserUrl = (url: string | undefined, provider: BrowserProvider): string =>
  provider === "gemini" ? safeGeminiUrl(url) : safeChatGptUrl(url);

export const expectedBrowserConversationMatches = (actualUrl: string | undefined, expectedUrl: string | undefined, provider: BrowserProvider): boolean =>
  provider === "gemini" ? expectedGeminiConversationMatches(actualUrl, expectedUrl) : expectedChatGptConversationMatches(actualUrl, expectedUrl);

export const concreteBrowserConversationUrl = (url: string | undefined, provider: BrowserProvider): string | undefined =>
  provider === "gemini" ? concreteGeminiConversationUrl(url) : concreteChatGptConversationUrl(url);

export function concreteChatGptConversationUrl(url?: string): string | undefined {
  if (!url?.startsWith("https://chatgpt.com/")) return undefined;
  try {
    const parsed = new URL(url);
    return /^\/c\/[^/]+\/?$/.test(parsed.pathname) ? `${parsed.origin}${parsed.pathname}` : undefined;
  } catch {
    return undefined;
  }
}

export function resolveTaskConversationUrl(
  message: { type: string; reason?: string; conversationUrl?: string },
  senderUrl?: string
): string | undefined {
  if (message.type === "TASK_ERROR" && message.reason === "conversation_unavailable") return undefined;
  return concreteChatGptConversationUrl(message.conversationUrl)
    ?? concreteChatGptConversationUrl(senderUrl)
    ?? (senderUrl?.startsWith("https://chatgpt.com/") ? senderUrl : message.conversationUrl);
}

export function resolveBrowserTaskConversationUrl(
  message: { type: string; reason?: string; conversationUrl?: string },
  senderUrl: string | undefined,
  provider: BrowserProvider
): string | undefined {
  if (provider === "chatgpt") return resolveTaskConversationUrl(message, senderUrl);
  if (message.type === "TASK_ERROR" && message.reason === "conversation_unavailable") return undefined;
  return concreteGeminiConversationUrl(message.conversationUrl)
    ?? concreteGeminiConversationUrl(senderUrl)
    ?? (senderUrl?.startsWith("https://gemini.google.com/app") ? senderUrl : message.conversationUrl);
}
