import { concreteBrowserConversationUrl, expectedBrowserConversationMatches, safeBrowserUrl, type BrowserProvider } from "./chatgpt-url.ts";

type TabEntry = { tabId?: number; conversationUrl: string; provider: BrowserProvider };
type TabGrouping = { group?(tabId: number): Promise<void>; managedTabs?(): Promise<chrome.tabs.Tab[]> };

export class ConversationUnavailableError extends Error {
  constructor(provider: BrowserProvider = "chatgpt") {
    super(`保存的 ${provider === "gemini" ? "Gemini" : "ChatGPT"} 对话已失效，或标签页已切换到其他对话`);
    this.name = "ConversationUnavailableError";
  }
}

export class TabRegistry {
  private readonly taskTabs = new Map<string, TabEntry>();
  private readonly tabs: typeof chrome.tabs;
  private readonly grouping?: TabGrouping;

  constructor(tabs: typeof chrome.tabs, grouping?: TabGrouping) {
    this.tabs = tabs;
    this.grouping = grouping;
  }

  private async groupTab(tabId: number): Promise<void> {
    try { await this.grouping?.group?.(tabId); } catch { /* grouping is best effort */ }
  }

  map(taskId: string, tabId?: number, conversationUrl?: string, provider: BrowserProvider = "chatgpt"): void {
    this.taskTabs.set(taskId, { tabId, conversationUrl: safeBrowserUrl(conversationUrl, provider), provider });
  }

  async restoreProject(tasks: Array<{ taskId: string; conversationUrl: string }>): Promise<void> {
    for (const task of tasks) this.taskTabs.set(task.taskId, { conversationUrl: task.conversationUrl, provider: "chatgpt" });
  }

  async ensure(taskId: string, conversationUrl?: string, requestedProvider?: BrowserProvider): Promise<{ tabId: number; conversationUrl: string }> {
    const mapped = this.taskTabs.get(taskId);
    const provider = requestedProvider ?? mapped?.provider ?? "chatgpt";
    const expectedUrl = safeBrowserUrl(conversationUrl ?? mapped?.conversationUrl, provider);
    if (mapped?.tabId !== undefined) {
      try {
        const tab = await this.tabs.get(mapped.tabId);
        const liveConversationUrl = concreteBrowserConversationUrl(tab.url, provider);
        const baseUrl = safeBrowserUrl(undefined, provider);
        if (tab.id !== undefined && expectedUrl === baseUrl && liveConversationUrl) {
          this.taskTabs.set(taskId, { tabId: tab.id, conversationUrl: liveConversationUrl, provider });
          await this.groupTab(tab.id);
          return { tabId: tab.id, conversationUrl: liveConversationUrl };
        }
        if (tab.id !== undefined && expectedBrowserConversationMatches(tab.url, expectedUrl, provider)) {
          await this.groupTab(tab.id);
          return { tabId: tab.id, conversationUrl: tab.url ?? mapped.conversationUrl };
        }
        if (tab.id !== undefined) throw new ConversationUnavailableError(provider);
      } catch (error) {
        if (error instanceof ConversationUnavailableError) throw error;
        this.taskTabs.set(taskId, { conversationUrl: mapped.conversationUrl, provider });
      }
    }
    if (this.tabs.query && expectedUrl !== safeBrowserUrl(undefined, provider)) {
      try {
        const claimedTabIds = new Set([...this.taskTabs.values()].flatMap(entry => entry.tabId === undefined ? [] : [entry.tabId]));
        const candidates = await this.tabs.query({ url: [provider === "gemini" ? "https://gemini.google.com/app*" : "https://chatgpt.com/*"] });
        const existing = candidates.find(candidate => candidate.id !== undefined && !claimedTabIds.has(candidate.id) && expectedBrowserConversationMatches(candidate.url, expectedUrl, provider));
        if (existing?.id !== undefined) {
          this.taskTabs.set(taskId, { tabId: existing.id, conversationUrl: existing.url ?? expectedUrl, provider });
          await this.groupTab(existing.id);
          return { tabId: existing.id, conversationUrl: existing.url ?? expectedUrl };
        }
      } catch { /* create a fresh tab below */ }
    }
    const tab = await this.tabs.create({ url: expectedUrl, active: false });
    if (tab.id === undefined) throw new Error("浏览器没有返回新标签页编号");
    this.taskTabs.set(taskId, { tabId: tab.id, conversationUrl: tab.url ?? expectedUrl, provider });
    await this.groupTab(tab.id);
    return { tabId: tab.id, conversationUrl: tab.url ?? expectedUrl };
  }

  async assertExpected(tabId: number, conversationUrl?: string, provider: BrowserProvider = "chatgpt"): Promise<void> {
    const tab = await this.tabs.get(tabId);
    if (tab.id !== tabId || !expectedBrowserConversationMatches(tab.url, conversationUrl, provider)) throw new ConversationUnavailableError(provider);
  }

  async open(taskId: string, conversationUrl?: string, provider: BrowserProvider = "chatgpt"): Promise<{ tabId: number; conversationUrl: string }> {
    let mapped;
    try {
      mapped = await this.ensure(taskId, conversationUrl, provider);
    } catch (error) {
      if (!(error instanceof ConversationUnavailableError)) throw error;
      const previous = this.taskTabs.get(taskId);
      this.taskTabs.set(taskId, { conversationUrl: conversationUrl ?? previous?.conversationUrl ?? safeBrowserUrl(undefined, provider), provider });
      mapped = await this.ensure(taskId, conversationUrl ?? previous?.conversationUrl, provider);
    }
    await this.tabs.update(mapped.tabId, { active: true });
    return mapped;
  }

  updateConversation(taskId: string, conversationUrl?: string, provider: BrowserProvider = "chatgpt"): void {
    const mapped = this.taskTabs.get(taskId) ?? { conversationUrl: safeBrowserUrl(undefined, provider), provider };
    this.taskTabs.set(taskId, { ...mapped, provider, conversationUrl: safeBrowserUrl(conversationUrl, provider) });
  }

  ownsTab(taskId: string, tabId?: number): boolean { return tabId !== undefined && this.taskTabs.get(taskId)?.tabId === tabId; }
  taskForTab(tabId: number): string | undefined { for (const [taskId, entry] of this.taskTabs) if (entry.tabId === tabId) return taskId; }

  async close(taskId: string): Promise<void> {
    const mapped = this.taskTabs.get(taskId);
    this.taskTabs.delete(taskId);
    if (mapped?.tabId !== undefined) await this.tabs.remove(mapped.tabId);
  }

  async hibernate(taskId: string): Promise<boolean> {
    const mapped = this.taskTabs.get(taskId);
    if (!mapped || mapped.tabId === undefined) return false;
    this.taskTabs.set(taskId, { conversationUrl: mapped.conversationUrl, provider: mapped.provider });
    try { await this.tabs.remove(mapped.tabId); return true; } catch { return false; }
  }

  pruneMappings(activeTaskIds: Set<string>): void {
    for (const taskId of this.taskTabs.keys()) if (!activeTaskIds.has(taskId)) this.taskTabs.delete(taskId);
  }

  async closeOrphanedManagedTabs(): Promise<number> {
    const managedTabs = await this.grouping?.managedTabs?.() ?? [];
    const protectedTabIds = new Set([...this.taskTabs.values()].flatMap(entry => entry.tabId === undefined ? [] : [entry.tabId]));
    const orphanIds = managedTabs.flatMap(tab => tab.id !== undefined && !protectedTabIds.has(tab.id) ? [tab.id] : []);
    if (orphanIds.length) await this.tabs.remove(orphanIds);
    return orphanIds.length;
  }
}
