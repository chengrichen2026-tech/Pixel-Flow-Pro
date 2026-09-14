import { KeyedSerialQueue } from "./keyed-serial-queue.ts";

export const TASK_TAB_GROUP_TITLE = "GPT 节点任务";

export class TaskTabGrouper {
  private readonly windowWrites = new KeyedSerialQueue();
  private readonly tabs: typeof chrome.tabs;
  private readonly tabGroups: typeof chrome.tabGroups;

  constructor(tabs: typeof chrome.tabs, tabGroups: typeof chrome.tabGroups) {
    this.tabs = tabs;
    this.tabGroups = tabGroups;
  }

  async group(tabId: number): Promise<void> {
    const tab = await this.tabs.get(tabId);
    await this.windowWrites.run(String(tab.windowId), async () => {
      const matchingGroups = await this.tabGroups.query({ windowId: tab.windowId, title: TASK_TAB_GROUP_TITLE });
      const existing = matchingGroups[0];
      const groupId = await this.tabs.group(existing ? { groupId: existing.id, tabIds: tabId } : { tabIds: tabId });
      await this.tabGroups.update(groupId, { title: TASK_TAB_GROUP_TITLE, color: "blue", collapsed: false });
    });
  }

  async managedTabs(): Promise<chrome.tabs.Tab[]> {
    const groups = await this.tabGroups.query({ title: TASK_TAB_GROUP_TITLE });
    return (await Promise.all(groups.map(group => this.tabs.query({ groupId: group.id })))).flat();
  }
}
