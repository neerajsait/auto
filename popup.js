document.addEventListener('DOMContentLoaded', () => {
  // DOM element references with null checks
  const elements = {
    profileSelect: document.getElementById('profile'),
    deleteProfileButton: document.getElementById('deleteProfile'),
    profileNameInput: document.getElementById('profileName'),
    firstNameInput: document.getElementById('firstName'),
    middleNameInput: document.getElementById('middleName'),
    lastNameInput: document.getElementById('lastName'),
    ageInput: document.getElementById('age'),
    dobInput: document.getElementById('dob'),
    emailInput: document.getElementById('email'),
    phoneInput: document.getElementById('phone'),
    cityInput: document.getElementById('city'),
    stateInput: document.getElementById('state'),
    countryInput: document.getElementById('country'),
    cgpaInput: document.getElementById('cgpa'),
    genderInput: document.getElementById('gender'),
    customInput: document.getElementById('custom'),
    encryptionKeyInput: document.getElementById('encryptionKey'),
    saveButton: document.getElementById('save'),
    fillButton: document.getElementById('fill'),
    recordModeCheckbox: document.getElementById('recordMode'),
    exportButton: document.getElementById('exportProfiles'),
    importInput: document.getElementById('importProfiles'),
    status: document.getElementById('status'),
    formStatus: document.getElementById('formStatus')
  };

  // Check for missing DOM elements
  for (const [key, element] of Object.entries(elements)) {
    if (!element) {
      console.error(`DOM element missing: ${key}`);
      document.getElementById('status').textContent = `Error: Missing element ${key}. Please check popup.html.`;
      setTimeout(() => (document.getElementById('status').textContent = ''), 5000);
      return;
    }
  }

  const {
    profileSelect, deleteProfileButton, profileNameInput, firstNameInput, middleNameInput, lastNameInput,
    ageInput, dobInput, emailInput, phoneInput, cityInput, stateInput, countryInput, cgpaInput, genderInput,
    customInput, encryptionKeyInput, saveButton, fillButton, recordModeCheckbox, exportButton, importInput,
    status, formStatus
  } = elements;

  // Check if extension context is valid
  function isExtensionContextValid() {
    return chrome.runtime && !!chrome.runtime.getManifest;
  }

  // Utility to promisify chrome.storage.sync.get with retry
  function getStorage(key, maxRetries = 3, retryDelay = 1000) {
    return new Promise((resolve, reject) => {
      let attempts = 0;
      function tryGet() {
        if (!isExtensionContextValid()) {
          reject(new Error('Extension context invalidated'));
          return;
        }
        chrome.storage.sync.get(key, (data) => {
          if (chrome.runtime.lastError) {
            console.error(`Storage get error (attempt ${attempts + 1}):`, chrome.runtime.lastError.message);
            if (attempts < maxRetries - 1) {
              attempts++;
              setTimeout(tryGet, retryDelay);
              return;
            }
            reject(chrome.runtime.lastError);
          } else {
            resolve(data);
          }
        });
      }
      tryGet();
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

  // Utility to promisify chrome.runtime.sendMessage with retry
  function sendRuntimeMessage(message, maxRetries = 3, retryDelay = 1000) {
    return new Promise((resolve, reject) => {
      let attempts = 0;
      function trySend() {
        if (!isExtensionContextValid()) {
          reject(new Error('Extension context invalidated'));
          return;
        }
        chrome.runtime.sendMessage(message, (response) => {
          if (chrome.runtime.lastError) {
            console.error(`Runtime message error (attempt ${attempts + 1}):`, chrome.runtime.lastError.message);
            if (attempts < maxRetries - 1 && chrome.runtime.lastError.message.includes('message port closed')) {
              attempts++;
              setTimeout(trySend, retryDelay);
              return;
            }
            reject(chrome.runtime.lastError);
          } else {
            resolve(response);
          }
        });
      }
      trySend();
    });
  }

  // Load profiles with retry
  async function loadProfiles() {
    if (!isExtensionContextValid()) {
      status.textContent = 'Extension context invalidated. Please reload the extension.';
      setTimeout(() => (status.textContent = ''), 5000);
      return;
    }
    try {
      const data = await getStorage('profiles');
      const profiles = data.profiles || {};
      profileSelect.innerHTML = '<option value="">Select Profile</option>';
      Object.keys(profiles).forEach((key) => {
        const option = document.createElement('option');
        option.value = key;
        option.textContent = key;
        profileSelect.appendChild(option);
      });
      const lastProfileData = await getStorage('lastProfile');
      if (lastProfileData.lastProfile && profiles[lastProfileData.lastProfile]) {
        profileSelect.value = lastProfileData.lastProfile;
        profileSelect.dispatchEvent(new Event('change'));
      }
      await sendRuntimeMessage({ action: 'refreshProfiles' });
    } catch (error) {
      console.error('Load profiles error:', error.message);
      status.textContent = 'Failed to load profiles: ' + error.message;
      setTimeout(() => (status.textContent = ''), 5000);
    }
  }

  // Load selected profile details
  profileSelect.addEventListener('change', async () => {
    if (!isExtensionContextValid()) return;
    const profileKey = profileSelect.value;
    try {
      await setStorage({ lastProfile: profileKey });
      if (!profileKey) {
        firstNameInput.value = middleNameInput.value = lastNameInput.value = '';
        ageInput.value = dobInput.value = emailInput.value = phoneInput.value = '';
        cityInput.value = stateInput.value = countryInput.value = cgpaInput.value = genderInput.value = customInput.value = '';
        encryptionKeyInput.value = '';
        return;
      }
      const data = await getStorage('profiles');
      const profiles = data.profiles || {};
      const profile = profiles[profileKey] || {};
      firstNameInput.value = profile.firstName || '';
      middleNameInput.value = profile.middleName || '';
      lastNameInput.value = profile.lastName || '';
      ageInput.value = profile.age || '';
      dobInput.value = profile.dob || '';
      emailInput.value = profile.email || '';
      phoneInput.value = profile.phone || '';
      cityInput.value = profile.city || '';
      stateInput.value = profile.state || '';
      countryInput.value = profile.country || '';
      cgpaInput.value = profile.cgpa || '';
      genderInput.value = profile.gender || '';
      customInput.value = profile.custom || '';
      encryptionKeyInput.value = '';
    } catch (error) {
      console.error('Load profile details error:', error.message);
      status.textContent = 'Failed to load profile: ' + error.message;
      setTimeout(() => (status.textContent = ''), 5000);
    }
  });

  // Delete selected profile
  deleteProfileButton.addEventListener('click', async () => {
    if (!isExtensionContextValid()) return;
    const profileKey = profileSelect.value;
    if (!profileKey) {
      status.textContent = 'Select a profile to delete.';
      setTimeout(() => (status.textContent = ''), 3000);
      return;
    }
    try {
      const data = await getStorage('profiles');
      const profiles = data.profiles || {};
      delete profiles[profileKey];
      await setStorage({ profiles, lastProfile: '' });
      loadProfiles();
      firstNameInput.value = middleNameInput.value = lastNameInput.value = '';
      ageInput.value = dobInput.value = emailInput.value = phoneInput.value = '';
      cityInput.value = stateInput.value = countryInput.value = cgpaInput.value = genderInput.value = customInput.value = '';
      profileSelect.value = '';
      status.textContent = 'Profile deleted!';
      setTimeout(() => (status.textContent = ''), 3000);
    } catch (error) {
      console.error('Delete profile error:', error.message);
      status.textContent = 'Failed to delete profile: ' + error.message;
      setTimeout(() => (status.textContent = ''), 3000);
    }
  });

  // Encrypt data
  function encryptData(data, key) {
    if (!key) return data;
    return CryptoJS.AES.encrypt(JSON.stringify(data), key).toString();
  }

  // Decrypt data
  function decryptData(encrypted, key) {
    if (!key || !encrypted) return encrypted;
    try {
      const bytes = CryptoJS.AES.decrypt(encrypted, key);
      return JSON.parse(bytes.toString(CryptoJS.enc.Utf8));
    } catch (e) {
      return null;
    }
  }

  // Save profile
  saveButton.addEventListener('click', async () => {
    if (!isExtensionContextValid()) {
      status.textContent = 'Extension context invalidated. Please reload the extension.';
      setTimeout(() => (status.textContent = ''), 3000);
      return;
    }
    const profileName = profileNameInput.value ? profileNameInput.value.trim() : '';
    if (!profileName) {
      status.textContent = 'Enter a profile name.';
      setTimeout(() => (status.textContent = ''), 3000);
      return;
    }
    const details = {
      firstName: firstNameInput.value ? firstNameInput.value.trim() : '',
      middleName: middleNameInput.value ? middleNameInput.value.trim() : '',
      lastName: lastNameInput.value ? lastNameInput.value.trim() : '',
      age: ageInput.value ? ageInput.value.trim() : '',
      dob: dobInput.value ? dobInput.value.trim() : '',
      email: emailInput.value ? emailInput.value.trim() : '',
      phone: phoneInput.value ? phoneInput.value.trim() : '',
      city: cityInput.value ? cityInput.value.trim() : '',
      state: stateInput.value ? stateInput.value.trim() : '',
      country: countryInput.value ? countryInput.value.trim() : '',
      cgpa: cgpaInput.value ? cgpaInput.value.trim() : '',
      gender: genderInput.value || '',
      custom: customInput.value ? customInput.value.trim() : ''
    };
    if (!Object.values(details).some((val) => val)) {
      status.textContent = 'Enter at least one field.';
      setTimeout(() => (status.textContent = ''), 3000);
      return;
    }
    try {
      const data = await getStorage('profiles');
      const profiles = data.profiles || {};
      const key = encryptionKeyInput.value ? encryptionKeyInput.value.trim() : '';
      profiles[profileName] = key ? encryptData(details, key) : details;
      await setStorage({ profiles, lastProfile: profileName });
      loadProfiles();
      status.textContent = 'Profile saved!';
      setTimeout(() => (status.textContent = ''), 3000);
    } catch (error) {
      console.error('Save profile error:', error.message);
      status.textContent = 'Failed to save profile: ' + error.message;
      setTimeout(() => (status.textContent = ''), 3000);
    }
  });

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

  // Trigger autofill with retries
  fillButton.addEventListener('click', async () => {
    if (!isExtensionContextValid()) {
      status.textContent = 'Extension context invalidated. Please reload the extension.';
      setTimeout(() => (status.textContent = ''), 3000);
      return;
    }
    const profileKey = profileSelect.value;
    const key = encryptionKeyInput.value ? encryptionKeyInput.value.trim() : '';
    if (!profileKey) {
      status.textContent = 'Select a profile to autofill.';
      setTimeout(() => (status.textContent = ''), 3000);
      return;
    }
    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
      if (!tabs[0]) {
        status.textContent = 'No active tab found.';
        setTimeout(() => (status.textContent = ''), 3000);
        return;
      }
      let attempts = 0;
      const maxAttempts = 5;
      async function tryFill() {
        if (!isExtensionContextValid()) {
          status.textContent = 'Extension context invalidated. Please reload the extension.';
          setTimeout(() => (status.textContent = ''), 3000);
          return;
        }
        try {
          const response = await sendTabMessage(tabs[0].id, { action: 'autofill', profileKey, encryptionKey: key }, { frameId: 0 });
          console.log('Fill button main frame response:', response);
          if (response && response.status === 'success') {
            status.textContent = 'Form filled!';
          } else if (response && response.status === 'invalid_key') {
            status.textContent = 'Invalid encryption key.';
          } else if (response && response.status === 'context_invalidated') {
            status.textContent = 'Extension context invalidated. Please reload the extension.';
          } else {
            status.textContent = 'No matching fields found.';
          }
          setTimeout(() => (status.textContent = ''), 3000);
        } catch (error) {
          console.error('Fill error:', error.message);
          if (attempts < maxAttempts - 1) {
            attempts++;
            console.log(`Retrying fill, attempt ${attempts + 1}`);
            setTimeout(tryFill, 1000);
            return;
          }
          status.textContent = 'Failed to connect to page. Try reloading.';
          setTimeout(() => (status.textContent = ''), 3000);
          return;
        }
        chrome.webNavigation.getAllFrames({ tabId: tabs[0].id }, async (frames) => {
          for (const frame of frames) {
            if (frame.frameId !== 0) {
              try {
                const response = await sendTabMessage(tabs[0].id, { action: 'autofill', profileKey, encryptionKey: key }, { frameId: frame.frameId });
                console.log(`Fill button frame ${frame.frameId} response:`, response);
                if (response && response.status === 'success') {
                  status.textContent = 'Form filled in iframe!';
                  setTimeout(() => (status.textContent = ''), 3000);
                }
              } catch (error) {
                console.log(`Iframe ${frame.frameId} error:`, error.message);
              }
            }
          }
        });
      }
      tryFill();
    });
  });

  // Toggle Record Mode
  recordModeCheckbox.addEventListener('change', async () => {
    if (!isExtensionContextValid()) return;
    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
      if (!tabs[0]) return;
      try {
        await sendTabMessage(tabs[0].id, { action: 'toggleRecordMode', enabled: recordModeCheckbox.checked }, { frameId: 0 });
      } catch (error) {
        console.log('Record mode error:', error.message);
      }
      chrome.webNavigation.getAllFrames({ tabId: tabs[0].id }, async (frames) => {
        for (const frame of frames) {
          if (frame.frameId !== 0) {
            try {
              await sendTabMessage(tabs[0].id, { action: 'toggleRecordMode', enabled: recordModeCheckbox.checked }, { frameId: frame.frameId });
            } catch (error) {
              console.log(`Iframe ${frame.frameId} record mode error:`, error.message);
            }
          }
        }
      });
    });
  });

  // Export profiles
  exportButton.addEventListener('click', async () => {
    if (!isExtensionContextValid()) return;
    try {
      const data = await getStorage('profiles');
      const blob = new Blob([JSON.stringify(data.profiles, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'profiles.json';
      a.click();
      URL.revokeObjectURL(url);
      status.textContent = 'Profiles exported!';
      setTimeout(() => (status.textContent = ''), 3000);
    } catch (error) {
      console.error('Export profiles error:', error.message);
      status.textContent = 'Failed to export profiles: ' + error.message;
      setTimeout(() => (status.textContent = ''), 3000);
    }
  });

  // Import profiles
  importInput.addEventListener('change', async (event) => {
    if (!isExtensionContextValid()) return;
    const file = event.target.files[0];
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const profiles = JSON.parse(e.target.result);
        await setStorage({ profiles });
        loadProfiles();
        status.textContent = 'Profiles imported!';
        setTimeout(() => (status.textContent = ''), 3000);
      } catch (e) {
        status.textContent = 'Invalid file format.';
        setTimeout(() => (status.textContent = ''), 3000);
      }
    };
    reader.readAsText(file);
  });

  // Check for forms with retries
  async function checkForms() {
    if (!isExtensionContextValid()) {
      formStatus.textContent = 'Extension context invalidated. Please reload the extension.';
      setTimeout(() => (formStatus.textContent = ''), 3000);
      return;
    }
    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
      if (!tabs[0]) {
        formStatus.textContent = 'No active tab found.';
        setTimeout(() => (formStatus.textContent = ''), 3000);
        return;
      }
      let attempts = 0;
      const maxAttempts = 5;
      async function tryCheckForms() {
        if (!isExtensionContextValid()) {
          formStatus.textContent = 'Extension context invalidated. Please reload the extension.';
          setTimeout(() => (formStatus.textContent = ''), 3000);
          return;
        }
        try {
          const response = await sendTabMessage(tabs[0].id, { action: 'checkForms' }, { frameId: 0 });
          console.log('Main frame form check response:', response);
          if (response && response.hasForms) {
            formStatus.textContent = 'Form detected on page.';
            return;
          }
          chrome.webNavigation.getAllFrames({ tabId: tabs[0].id }, async (frames) => {
            let checked = 0;
            let hasForms = false;
            if (frames.length === 1) {
              formStatus.textContent = 'No forms detected.';
              return;
            }
            for (const frame of frames) {
              if (frame.frameId !== 0) {
                try {
                  const response = await sendTabMessage(tabs[0].id, { action: 'checkForms' }, { frameId: frame.frameId });
                  console.log(`Iframe ${frame.frameId} form check response:`, response);
                  if (response && response.hasForms) {
                    hasForms = true;
                  }
                } catch (error) {
                  console.log(`Iframe ${frame.frameId} check forms error:`, error.message);
                }
                checked++;
                if (checked === frames.length - 1) {
                  formStatus.textContent = hasForms ? 'Form detected in iframe.' : 'No forms detected.';
                }
              } else {
                checked++;
              }
            }
          });
        } catch (error) {
          console.error('Check forms error:', error.message);
          if (attempts < maxAttempts - 1) {
            attempts++;
            console.log(`Retrying form check, attempt ${attempts + 1}`);
            setTimeout(tryCheckForms, 1000);
            return;
          }
          formStatus.textContent = 'Failed to connect to page. Try reloading.';
          setTimeout(() => (formStatus.textContent = ''), 3000);
        }
      }
      tryCheckForms();
    });
  }

  // Handle error messages
  if (isExtensionContextValid()) {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request.action === 'showError') {
        status.textContent = request.message;
        setTimeout(() => (status.textContent = ''), 5000);
      }
    });
  }

  // Load profiles and check forms
  loadProfiles();
  checkForms();
});