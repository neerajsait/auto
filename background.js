// Check if extension context is valid
function isExtensionContextValid() {
  return chrome.runtime && !!chrome.runtime.getManifest;
}

// Utility to promisify chrome.storage.sync.get
function getStorage(key) {
  return new Promise((resolve, reject) => {
    if (!isExtensionContextValid()) {
      reject(new Error('Extension context invalidated'));
      return;
    }
    chrome.storage.sync.get(key, (data) => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
      } else {
        resolve(data);
      }
    });
  });
}

// Utility to promisify chrome.storage.sync.set
function setStorage(data) {
  return new Promise((resolve, reject) => {
    if (!isExtensionContextValid()) {
      reject(new Error('Extension context invalidated'));
      return;
    }
    chrome.storage.sync.set(data, () => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
      } else {
        resolve();
      }
    });
  });
}

// Utility to promisify chrome.tabs.sendMessage
function sendTabMessage(tabId, message, options = {}) {
  return new Promise((resolve, reject) => {
    if (!isExtensionContextValid()) {
      reject(new Error('Extension context invalidated'));
      return;
    }
    chrome.tabs.sendMessage(tabId, message, options, (response) => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
      } else {
        resolve(response);
      }
    });
  });
}

// Dynamic context menu for profiles
async function updateContextMenu() {
  if (!isExtensionContextValid()) {
    console.log('Extension context invalidated, skipping context menu update');
    return;
  }
  try {
    await new Promise((resolve) => chrome.contextMenus.removeAll(resolve));
    chrome.contextMenus.create({
      id: 'autofill',
      title: 'AutoFill Form',
      contexts: ['page', 'editable']
    });
    const data = await getStorage('profiles');
    const profiles = data.profiles || {};
    Object.keys(profiles).forEach((key) => {
      chrome.contextMenus.create({
        id: `autofill_${key}`,
        parentId: 'autofill',
        title: `Fill with ${key}`,
        contexts: ['page', 'editable']
      });
    });
  } catch (error) {
    console.error('Update context menu error:', error.message);
  }
}

// Initialize context menu
if (isExtensionContextValid()) {
  chrome.runtime.onInstalled.addListener(() => updateContextMenu());
  chrome.runtime.onMessage.addListener((request) => {
    if (request.action === 'refreshProfiles' && isExtensionContextValid()) {
      updateContextMenu();
    }
  });
}

// Context menu click
if (isExtensionContextValid()) {
  chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (!isExtensionContextValid()) {
      console.log('Extension context invalidated, ignoring context menu click');
      return;
    }
    if (info.menuItemId.startsWith('autofill_')) {
      const profileKey = info.menuItemId.replace('autofill_', '');
      setStorage({ lastProfile: profileKey })
        .then(() => {
          console.log('Context menu autofill, profile:', profileKey);
          let attempts = 0;
          const maxAttempts = 5;
          async function trySendMessage() {
            if (!isExtensionContextValid()) {
              console.log('Extension context invalidated, aborting context menu autofill');
              return;
            }
            try {
              const response = await sendTabMessage(tab.id, { action: 'autofill', profileKey, encryptionKey: '' }, { frameId: 0 });
              console.log('Context menu main frame response:', response);
              if (!response || response.status !== 'success') {
                chrome.runtime.sendMessage({ action: 'showError', message: response?.status === 'no_profile' ? 'Profile not found.' : response?.status === 'context_invalidated' ? 'Extension context invalidated. Please reload the extension.' : 'Failed to fill form.' });
              }
            } catch (error) {
              console.error('Context menu error:', error.message);
              if (attempts < maxAttempts - 1) {
                attempts++;
                console.log(`Retrying context menu, attempt ${attempts + 1}`);
                setTimeout(trySendMessage, 1000);
                return;
              }
              chrome.runtime.sendMessage({ action: 'showError', message: 'Failed to connect to page. Try reloading.' });
              return;
            }
            chrome.webNavigation.getAllFrames({ tabId: tab.id }, async (frames) => {
              for (const frame of frames) {
                if (frame.frameId !== 0) {
                  try {
                    const response = await sendTabMessage(tab.id, { action: 'autofill', profileKey, encryptionKey: '' }, { frameId: frame.frameId });
                    console.log(`Context menu frame ${frame.frameId} response:`, response);
                    if (response?.status === 'success') {
                      chrome.runtime.sendMessage({ action: 'showError', message: 'Form filled in iframe!' });
                    }
                  } catch (error) {
                    console.log(`Iframe ${frame.frameId} error:`, error.message);
                  }
                }
              }
            });
          }
          trySendMessage();
        })
        .catch((error) => {
          console.error('Set last profile error:', error.message);
          chrome.runtime.sendMessage({ action: 'showError', message: 'Failed to set profile: ' + error.message });
        });
    }
  });
}

// Keyboard shortcut with profile cycling
let currentProfileIndex = -1;
if (isExtensionContextValid()) {
  chrome.commands.onCommand.addListener((command) => {
    if (!isExtensionContextValid()) {
      console.log('Extension context invalidated, ignoring command');
      return;
    }
    console.log('Command received:', command);
    if (command === 'autofill') {
      getStorage(['profiles', 'lastProfile'])
        .then((data) => {
          if (!isExtensionContextValid()) {
            console.log('Extension context invalidated during storage access');
            return;
          }
          const profiles = data.profiles || {};
          const profileKeys = Object.keys(profiles);
          if (profileKeys.length === 0) {
            console.log('No profiles available');
            chrome.runtime.sendMessage({ action: 'showError', message: 'No profiles available. Please create a profile.' });
            return;
          }
          currentProfileIndex = (currentProfileIndex + 1) % profileKeys.length;
          const profileKey = profileKeys[currentProfileIndex];
          return setStorage({ lastProfile: profileKey }).then(() => ({ profileKey, tabId: null }));
        })
        .then(({ profileKey, tabId }) => {
          console.log('Keyboard shortcut autofill, profile:', profileKey);
          return new Promise((resolve, reject) => {
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
              if (!tabs[0]) {
                reject(new Error('No active tab found'));
              } else {
                resolve({ profileKey, tabId: tabs[0].id });
              }
            });
          });
        })
        .then(({ profileKey, tabId }) => {
          let attempts = 0;
          const maxAttempts = 5;
          async function trySendMessage() {
            if (!isExtensionContextValid()) {
              console.log('Extension context invalidated, aborting keyboard shortcut');
              return;
            }
            try {
              const response = await sendTabMessage(tabId, { action: 'autofill', profileKey, encryptionKey: '' }, { frameId: 0 });
              console.log('Keyboard shortcut main frame response:', response);
              if (response?.status === 'success') {
                chrome.runtime.sendMessage({ action: 'showError', message: 'Form filled!' });
              } else {
                chrome.runtime.sendMessage({ action: 'showError', message: response?.status === 'no_profile' ? 'Profile not found.' : response?.status === 'context_invalidated' ? 'Extension context invalidated. Please reload the extension.' : 'Failed to fill form.' });
              }
            } catch (error) {
              console.error('Keyboard shortcut error:', error.message);
              if (attempts < maxAttempts - 1) {
                attempts++;
                console.log(`Retrying keyboard shortcut, attempt ${attempts + 1}`);
                setTimeout(trySendMessage, 1000);
                return;
              }
              chrome.runtime.sendMessage({ action: 'showError', message: 'Failed to connect to page. Try reloading.' });
              return;
            }
            chrome.webNavigation.getAllFrames({ tabId: tabId }, async (frames) => {
              for (const frame of frames) {
                if (frame.frameId !== 0) {
                  try {
                    const response = await sendTabMessage(tabId, { action: 'autofill', profileKey, encryptionKey: '' }, { frameId: frame.frameId });
                    console.log(`Keyboard shortcut frame ${frame.frameId} response:`, response);
                    if (response?.status === 'success') {
                      chrome.runtime.sendMessage({ action: 'showError', message: 'Form filled in iframe!' });
                    }
                  } catch (error) {
                    console.log(`Iframe ${frame.frameId} error:`, error.message);
                  }
                }
              }
            });
          }
          trySendMessage();
        })
        .catch((error) => {
          console.error('Keyboard shortcut error:', error.message);
          chrome.runtime.sendMessage({ action: 'showError', message: error.message === 'No active tab found' ? 'No active tab found.' : 'Failed to process shortcut: ' + error.message });
        });
    }
  });
}