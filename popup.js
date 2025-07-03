document.addEventListener('DOMContentLoaded', () => {
  const profileSelect = document.getElementById('profile');
  const deleteProfileButton = document.getElementById('deleteProfile');
  const profileNameInput = document.getElementById('profileName');
  const firstNameInput = document.getElementById('firstName');
  const middleNameInput = document.getElementById('middleName');
  const lastNameInput = document.getElementById('lastName');
  const ageInput = document.getElementById('age');
  const dobInput = document.getElementById('dob');
  const emailInput = document.getElementById('email');
  const phoneInput = document.getElementById('phone');
  const customInput = document.getElementById('custom');
  const encryptionKeyInput = document.getElementById('encryptionKey');
  const saveButton = document.getElementById('save');
  const fillButton = document.getElementById('fill');
  const recordModeCheckbox = document.getElementById('recordMode');
  const status = document.getElementById('status');
  const formStatus = document.getElementById('formStatus');

  // Load profiles
  function loadProfiles() {
    chrome.storage.sync.get('profiles', (data) => {
      const profiles = data.profiles || {};
      profileSelect.innerHTML = '<option value="">Select Profile</option>';
      Object.keys(profiles).forEach((key) => {
        const option = document.createElement('option');
        option.value = key;
        option.textContent = key;
        profileSelect.appendChild(option);
      });
      chrome.storage.sync.get('lastProfile', (data) => {
        if (data.lastProfile && profiles[data.lastProfile]) {
          profileSelect.value = data.lastProfile;
          profileSelect.dispatchEvent(new Event('change'));
        }
      });
    });
  }

  // Load selected profile details
  profileSelect.addEventListener('change', () => {
    const profileKey = profileSelect.value;
    chrome.storage.sync.set({ lastProfile: profileKey });
    if (!profileKey) {
      firstNameInput.value = middleNameInput.value = lastNameInput.value = '';
      ageInput.value = dobInput.value = emailInput.value = phoneInput.value = customInput.value = '';
      return;
    }
    chrome.storage.sync.get('profiles', (data) => {
      const profiles = data.profiles || {};
      const profile = profiles[profileKey] || {};
      firstNameInput.value = profile.firstName || '';
      middleNameInput.value = profile.middleName || '';
      lastNameInput.value = profile.lastName || '';
      ageInput.value = profile.age || '';
      dobInput.value = profile.dob || '';
      emailInput.value = profile.email || '';
      phoneInput.value = profile.phone || '';
      customInput.value = profile.custom || '';
      encryptionKeyInput.value = '';
    });
  });

  // Delete selected profile
  deleteProfileButton.addEventListener('click', () => {
    const profileKey = profileSelect.value;
    if (!profileKey) {
      status.textContent = 'Select a profile to delete.';
      setTimeout(() => (status.textContent = ''), 3000);
      return;
    }
    chrome.storage.sync.get('profiles', (data) => {
      const profiles = data.profiles || {};
      delete profiles[profileKey];
      chrome.storage.sync.set({ profiles, lastProfile: '' }, () => {
        loadProfiles();
        firstNameInput.value = middleNameInput.value = lastNameInput.value = '';
        ageInput.value = dobInput.value = emailInput.value = phoneInput.value = customInput.value = '';
        profileSelect.value = '';
        status.textContent = 'Profile deleted!';
        setTimeout(() => (status.textContent = ''), 3000);
      });
    });
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
  saveButton.addEventListener('click', () => {
    const profileName = profileNameInput.value.trim();
    if (!profileName) {
      status.textContent = 'Enter a profile name.';
      setTimeout(() => (status.textContent = ''), 3000);
      return;
    }
    const details = {
      firstName: firstNameInput.value.trim(),
      middleName: middleNameInput.value.trim(),
      lastName: lastNameInput.value.trim(),
      age: ageInput.value.trim(),
      dob: dobInput.value.trim(),
      email: emailInput.value.trim(),
      phone: phoneInput.value.trim(),
      custom: customInput.value.trim()
    };
    if (!Object.values(details).some((val) => val)) {
      status.textContent = 'Enter at least one field.';
      setTimeout(() => (status.textContent = ''), 3000);
      return;
    }
    chrome.storage.sync.get('profiles', (data) => {
      const profiles = data.profiles || {};
      const key = encryptionKeyInput.value.trim();
      profiles[profileName] = key ? encryptData(details, key) : details;
      chrome.storage.sync.set({ profiles, lastProfile: profileName }, () => {
        loadProfiles();
        status.textContent = 'Profile saved!';
        setTimeout(() => (status.textContent = ''), 3000);
      });
    });
  });

  // Trigger autofill
  fillButton.addEventListener('click', () => {
    const profileKey = profileSelect.value;
    const key = encryptionKeyInput.value.trim();
    if (!profileKey) {
      status.textContent = 'Select a profile to autofill.';
      setTimeout(() => (status.textContent = ''), 3000);
      return;
    }
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs[0]) {
        status.textContent = 'No active tab found.';
        setTimeout(() => (status.textContent = ''), 3000);
        return;
      }
      chrome.tabs.sendMessage(tabs[0].id, { action: 'autofill', profileKey, encryptionKey: key }, { frameId: 0 }, (response) => {
        console.log('Fill button main frame response:', response);
        if (response && response.status === 'success') {
          status.textContent = 'Form filled!';
        } else if (response && response.status === 'invalid_key') {
          status.textContent = 'Invalid encryption key.';
        } else {
          status.textContent = 'No matching fields found.';
        }
        setTimeout(() => (status.textContent = ''), 3000);
      });
      chrome.webNavigation.getAllFrames({ tabId: tabs[0].id }, (frames) => {
        frames.forEach((frame) => {
          if (frame.frameId !== 0) {
            chrome.tabs.sendMessage(tabs[0].id, { action: 'autofill', profileKey, encryptionKey: key }, { frameId: frame.frameId }, (response) => {
              console.log(`Fill button frame ${frame.frameId} response:`, response);
              if (response && response.status === 'success') {
                status.textContent = 'Form filled in iframe!';
                setTimeout(() => (status.textContent = ''), 3000);
              }
            });
          }
        });
      });
    });
  });

  // Toggle Record Mode
  recordModeCheckbox.addEventListener('change', () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs[0]) return;
      chrome.tabs.sendMessage(tabs[0].id, { action: 'toggleRecordMode', enabled: recordModeCheckbox.checked }, { frameId: 0 });
      chrome.webNavigation.getAllFrames({ tabId: tabs[0].id }, (frames) => {
        frames.forEach((frame) => {
          if (frame.frameId !== 0) {
            chrome.tabs.sendMessage(tabs[0].id, { action: 'toggleRecordMode', enabled: recordModeCheckbox.checked }, { frameId: frame.frameId });
          }
        });
      });
    });
  });

  // Check for forms
  function checkForms() {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs[0]) return;
      chrome.tabs.sendMessage(tabs[0].id, { action: 'checkForms' }, { frameId: 0 }, (response) => {
        console.log('Main frame form check response:', response);
        if (response && response.hasForms) {
          formStatus.textContent = 'Form detected on page.';
          return;
        }
        chrome.webNavigation.getAllFrames({ tabId: tabs[0].id }, (frames) => {
          let checked = 0;
          let hasForms = false;
          if (frames.length === 1) {
            formStatus.textContent = 'No forms detected.';
            return;
          }
          frames.forEach((frame) => {
            if (frame.frameId !== 0) {
              chrome.tabs.sendMessage(tabs[0].id, { action: 'checkForms' }, { frameId: frame.frameId }, (response) => {
                console.log(`Iframe ${frame.frameId} form check response:`, response);
                if (response && response.hasForms) {
                  hasForms = true;
                }
                checked++;
                if (checked === frames.length - 1) {
                  formStatus.textContent = hasForms ? 'Form detected in iframe.' : 'No forms detected.';
                }
              });
            } else {
              checked++;
            }
          });
        });
      });
    });
  }

  // Load profiles and check forms
  loadProfiles();
  checkForms();
});