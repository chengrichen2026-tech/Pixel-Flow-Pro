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
