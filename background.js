// Context menu
chrome.contextMenus.create({
  id: 'autofill',
  title: 'AutoFill Form',
  contexts: ['page', 'editable']
});

// Context menu click
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'autofill') {
    chrome.storage.sync.get('lastProfile', (data) => {
      const profileKey = data.lastProfile || '';
      console.log('Context menu autofill, profile:', profileKey);
      if (!profileKey) {
        console.log('No profile selected for context menu');
        return;
      }
      chrome.tabs.sendMessage(tab.id, { action: 'autofill', profileKey, encryptionKey: '' }, { frameId: 0 }, (response) => {
        console.log('Context menu main frame response:', response);
      });
      chrome.webNavigation.getAllFrames({ tabId: tab.id }, (frames) => {
        frames.forEach((frame) => {
          if (frame.frameId !== 0) {
            chrome.tabs.sendMessage(tab.id, { action: 'autofill', profileKey, encryptionKey: '' }, { frameId: frame.frameId }, (response) => {
              console.log(`Context menu frame ${frame.frameId} response:`, response);
            });
          }
        });
      });
    });
  }
});

// Keyboard shortcut
chrome.commands.onCommand.addListener((command) => {
  console.log('Command received:', command);
  if (command === 'autofill') {
    chrome.storage.sync.get('lastProfile', (data) => {
      const profileKey = data.lastProfile || '';
      console.log('Keyboard shortcut autofill, profile:', profileKey);
      if (!profileKey) {
        console.log('No profile selected for shortcut');
        return;
      }
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (!tabs[0]) {
          console.log('No active tab found');
          return;
        }
        chrome.tabs.sendMessage(tabs[0].id, { action: 'autofill', profileKey, encryptionKey: '' }, { frameId: 0 }, (response) => {
          console.log('Keyboard shortcut main frame response:', response);
        });
        chrome.webNavigation.getAllFrames({ tabId: tabs[0].id }, (frames) => {
          frames.forEach((frame) => {
            if (frame.frameId !== 0) {
              chrome.tabs.sendMessage(tabs[0].id, { action: 'autofill', profileKey, encryptionKey: '' }, { frameId: frame.frameId }, (response) => {
                console.log(`Keyboard shortcut frame ${frame.frameId} response:`, response);
              });
            }
          });
        });
      });
    });
  }
});

// Refresh profiles
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'refreshProfiles') {
    chrome.runtime.sendMessage({ action: 'refreshProfiles' });
  }
});