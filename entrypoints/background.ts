export default defineBackground(() => {
  // Open side panel when extension icon is clicked
  browser.action.onClicked.addListener(async (tab) => {
    if (tab.id) {
      await browser.sidePanel.open({ tabId: tab.id });
    }
  });

  // Handle messages from content script
  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'OPEN_SIDEPANEL') {
      if (sender.tab?.id) {
        browser.sidePanel.open({ tabId: sender.tab.id });
      }
    }
    if (message.type === 'SET_QUOTE') {
      // Store quote temporarily for sidepanel to pick up
      browser.storage.local.set({ pendingQuote: message.quote });
    }
    return true;
  });

  // Set side panel behavior
  browser.sidePanel.setPanelBehavior?.({ openPanelOnActionClick: true });
});
