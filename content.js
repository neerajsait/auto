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

// Only set up listeners if context is valid
if (isExtensionContextValid()) {
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (!isExtensionContextValid()) {
      console.log('Extension context invalidated, ignoring message:', request);
      sendResponse({ status: 'context_invalidated' });
      return true;
    }
    console.log('Message received in content.js:', request);

    // Decrypt data
    function decryptData(encrypted, key) {
      if (!key || !encrypted || typeof encrypted !== 'string') return encrypted;
      try {
        const bytes = CryptoJS.AES.decrypt(encrypted, key);
        return JSON.parse(bytes.toString(CryptoJS.enc.Utf8));
      } catch (e) {
        return null;
      }
    }

    // Traverse shadow DOM
    function getAllElements(root) {
      const elements = [];
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
      let node;
      while ((node = walker.nextNode())) {
        elements.push(node);
        if (node.shadowRoot) {
          elements.push(...getAllElements(node.shadowRoot));
        }
      }
      return elements;
    }

    // Check for forms in main document, iframes, and shadow DOM
    function checkForms() {
      let hasForms = document.querySelectorAll('form, input, select, textarea, [contenteditable]').length > 0;
      console.log('Main document forms:', document.querySelectorAll('form').length,
                  'Inputs:', document.querySelectorAll('input').length,
                  'Selects:', document.querySelectorAll('select').length,
                  'Textareas:', document.querySelectorAll('textarea').length);
      document.querySelectorAll('iframe').forEach((iframe) => {
        try {
          const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
          const iframeForms = iframeDoc.querySelectorAll('form, input, select, textarea, [contenteditable]').length > 0;
          console.log('Iframe forms check:', iframeForms);
          hasForms |= iframeForms;
        } catch (e) {
          console.log('Cannot access iframe:', e);
          if (window.location.href.includes('w3schools.com')) {
            console.log('Cross-origin iframe detected, attempting postMessage');
            iframe.contentWindow.postMessage({ action: 'checkForms' }, '*');
          }
        }
      });
      if (window.location.href.includes('w3schools.com')) {
        const iframe = document.querySelector('#tryitframe');
        if (iframe) {
          try {
            const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
            hasForms |= iframeDoc.querySelectorAll('form, input, select, textarea').length > 0;
            console.log('W3Schools iframe forms check:', hasForms);
          } catch (e) {
            console.log('W3Schools iframe access error:', e);
          }
        }
      }
      const shadowElements = getAllElements(document);
      hasForms |= shadowElements.some((el) => ['FORM', 'INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName) || el.isContentEditable);
      console.log('Shadow DOM forms check:', hasForms);
      return hasForms;
    }

    // Autofill action
    if (request.action === 'autofill') {
      let attempts = 0;
      const maxAttempts = 5;
      async function tryAutofill() {
        if (!isExtensionContextValid()) {
          console.log('Extension context invalidated, aborting autofill');
          sendResponse({ status: 'context_invalidated' });
          return;
        }
        try {
          const data = await getStorage('profiles');
          const profiles = data.profiles || {};
          const profileData = profiles[request.profileKey];
          if (!profileData) {
            console.log('No profile found for key:', request.profileKey);
            sendResponse({ status: 'no_profile' });
            return;
          }
          const details = decryptData(profileData, request.encryptionKey);
          if (!details) {
            console.log('Invalid encryption key');
            sendResponse({ status: 'invalid_key' });
            return;
          }

          let filled = false;
          const fields = {
            firstName: [/first\s*name/i, /fname/i, /given\s*name/i, /user.*first/i, 'first'],
            middleName: [/middle\s*name/i, /mname/i, /middle/i, /user.*middle/i],
            lastName: [/last\s*name/i, /lname/i, /surname/i, /user.*last/i, 'last'],
            age: [/age/i, /years/i, /user.*age/i, 'age_field'],
            dob: [/dob/i, /birthdate/i, /date\s*of\s*birth/i, /birth_date/i, /user.*birthdate/i, 'birthday'],
            email: [/email/i, /mail/i, /user.*email/i, /email.*address/i],
            phone: [/phone/i, /telephone/i, /tel/i, /phone.*number/i, /user.*phone/i],
            city: [/city/i, /user.*city/i, /address.*city/i],
            state: [/state/i, /user.*state/i, /address.*state/i],
            country: [/country/i, /user.*country/i, /address.*country/i],
            cgpa: [/cgpa/i, /gpa/i, /grade.*point/i, /user.*cgpa/i],
            gender: [/gender/i, /sex/i, /user.*gender/i]
          };

          // Fill text inputs
          const fillInput = (fieldType, value) => {
            if (!value) return false;
            let filledAny = false;
            fields[fieldType].forEach((pattern) => {
              const selector = `input[name*="${pattern.source || pattern}" i], input[id*="${pattern.source || pattern}" i], input[placeholder*="${pattern.source || pattern}" i], input[aria-label*="${pattern.source || pattern}" i], [role="textbox"][aria-label*="${pattern.source || pattern}" i], [contenteditable][aria-label*="${pattern.source || pattern}" i]`;
              const inputs = document.querySelectorAll(selector);
              console.log(`Field: ${fieldType}, Pattern: ${pattern.source || pattern}, Matches: ${inputs.length}`);
              inputs.forEach((element) => {
                if (element.tagName === 'INPUT' && element.type !== 'hidden' && element.type !== 'checkbox' && element.type !== 'radio') {
                  element.value = value;
                  element.dispatchEvent(new Event('input', { bubbles: true }));
                  element.dispatchEvent(new Event('change', { bubbles: true }));
                  filledAny = true;
                } else if (element.isContentEditable) {
                  element.textContent = value;
                  element.dispatchEvent(new Event('input', { bubbles: true }));
                  element.dispatchEvent(new Event('change', { bubbles: true }));
                  filledAny = true;
                }
              });
              document.querySelectorAll('iframe').forEach((iframe) => {
                try {
                  const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
                  const iframeInputs = iframeDoc.querySelectorAll(selector);
                  console.log(`Iframe Field: ${fieldType}, Pattern: ${pattern.source || pattern}, Matches: ${iframeInputs.length}`);
                  iframeInputs.forEach((element) => {
                    if (element.tagName === 'INPUT' && element.type !== 'hidden' && element.type !== 'checkbox' && element.type !== 'radio') {
                      element.value = value;
                      element.dispatchEvent(new Event('input', { bubbles: true }));
                      element.dispatchEvent(new Event('change', { bubbles: true }));
                      filledAny = true;
                    }
                  });
                } catch (e) {
                  console.log('Cannot access iframe:', e);
                  iframe.contentWindow.postMessage({ action: 'autofill', profileKey: request.profileKey, encryptionKey: request.encryptionKey }, '*');
                }
              });
              const shadowElements = getAllElements(document);
              shadowElements.forEach((element) => {
                if (element.tagName === 'INPUT' && element.type !== 'hidden' && element.type !== 'checkbox' && element.type !== 'radio' && element.matches(selector)) {
                  element.value = value;
                  element.dispatchEvent(new Event('input', { bubbles: true }));
                  element.dispatchEvent(new Event('change', { bubbles: true }));
                  filledAny = true;
                }
              });
            });
            return filledAny;
          };

          // Fill select elements
          const fillSelect = (fieldType, value) => {
            if (!value) return false;
            let filledAny = false;
            fields[fieldType].forEach((pattern) => {
              const selector = `select[name*="${pattern.source || pattern}" i], select[id*="${pattern.source || pattern}" i]`;
              const selects = document.querySelectorAll(selector);
              console.log(`Select Field: ${fieldType}, Pattern: ${pattern.source || pattern}, Matches: ${selects.length}`);
              selects.forEach((select) => {
                const option = Array.from(select.options).find(opt => opt.value.toLowerCase() === value.toLowerCase() || opt.text.toLowerCase() === value.toLowerCase());
                if (option) {
                  select.value = option.value;
                  select.dispatchEvent(new Event('change', { bubbles: true }));
                  filledAny = true;
                }
              });
              document.querySelectorAll('iframe').forEach((iframe) => {
                try {
                  const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
                  const iframeSelects = iframeDoc.querySelectorAll(selector);
                  console.log(`Iframe Select Field: ${fieldType}, Pattern: ${pattern.source || pattern}, Matches: ${iframeSelects.length}`);
                  iframeSelects.forEach((select) => {
                    const option = Array.from(select.options).find(opt => opt.value.toLowerCase() === value.toLowerCase() || opt.text.toLowerCase() === value.toLowerCase());
                    if (option) {
                      select.value = option.value;
                      select.dispatchEvent(new Event('change', { bubbles: true }));
                      filledAny = true;
                    }
                  });
                } catch (e) {}
              });
              const shadowElements = getAllElements(document);
              shadowElements.forEach((element) => {
                if (element.tagName === 'SELECT' && element.matches(selector)) {
                  const option = Array.from(element.options).find(opt => opt.value.toLowerCase() === value.toLowerCase() || opt.text.toLowerCase() === value.toLowerCase());
                  if (option) {
                    element.value = option.value;
                    element.dispatchEvent(new Event('change', { bubbles: true }));
                    filledAny = true;
                  }
                }
              });
            });
            return filledAny;
          };

          // Fill checkboxes
          const fillCheckbox = (fieldType, value) => {
            if (!value) return false;
            let filledAny = false;
            fields[fieldType].forEach((pattern) => {
              const selector = `input[type="checkbox"][name*="${pattern.source || pattern}" i], input[type="checkbox"][id*="${pattern.source || pattern}" i]`;
              const checkboxes = document.querySelectorAll(selector);
              console.log(`Checkbox Field: ${fieldType}, Pattern: ${pattern.source || pattern}, Matches: ${checkboxes.length}`);
              checkboxes.forEach((checkbox) => {
                checkbox.checked = true;
                checkbox.dispatchEvent(new Event('change', { bubbles: true }));
                filledAny = true;
              });
              document.querySelectorAll('iframe').forEach((iframe) => {
                try {
                  const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
                  const iframeCheckboxes = iframeDoc.querySelectorAll(selector);
                  console.log(`Iframe Checkbox Field: ${fieldType}, Pattern: ${pattern.source || pattern}, Matches: ${iframeCheckboxes.length}`);
                  iframeCheckboxes.forEach((checkbox) => {
                    checkbox.checked = true;
                    checkbox.dispatchEvent(new Event('change', { bubbles: true }));
                    filledAny = true;
                  });
                } catch (e) {}
              });
              const shadowElements = getAllElements(document);
              shadowElements.forEach((element) => {
                if (element.tagName === 'INPUT' && element.type === 'checkbox' && element.matches(selector)) {
                  element.checked = true;
                  element.dispatchEvent(new Event('change', { bubbles: true }));
                  filledAny = true;
                }
              });
            });
            return filledAny;
          };

          // Fill radio buttons
          const fillRadio = (fieldType, value) => {
            if (!value) return false;
            let filledAny = false;
            fields[fieldType].forEach((pattern) => {
              const selector = `input[type="radio"][name*="${pattern.source || pattern}" i], input[type="radio"][id*="${pattern.source || pattern}" i]`;
              const radios = document.querySelectorAll(selector);
              console.log(`Radio Field: ${fieldType}, Pattern: ${pattern.source || pattern}, Matches: ${radios.length}`);
              radios.forEach((radio) => {
                if (radio.value.toLowerCase() === value.toLowerCase()) {
                  radio.checked = true;
                  radio.dispatchEvent(new Event('change', { bubbles: true }));
                  filledAny = true;
                }
              });
              document.querySelectorAll('iframe').forEach((iframe) => {
                try {
                  const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
                  const iframeRadios = iframeDoc.querySelectorAll(selector);
                  console.log(`Iframe Radio Field: ${fieldType}, Pattern: ${pattern.source || pattern}, Matches: ${iframeRadios.length}`);
                  iframeRadios.forEach((radio) => {
                    if (radio.value.toLowerCase() === value.toLowerCase()) {
                      radio.checked = true;
                      radio.dispatchEvent(new Event('change', { bubbles: true }));
                      filledAny = true;
                    }
                  });
                } catch (e) {}
              });
              const shadowElements = getAllElements(document);
              shadowElements.forEach((element) => {
                if (element.tagName === 'INPUT' && element.type === 'radio' && element.matches(selector)) {
                  if (element.value.toLowerCase() === value.toLowerCase()) {
                    element.checked = true;
                    element.dispatchEvent(new Event('change', { bubbles: true }));
                    filledAny = true;
                  }
                }
              });
            });
            return filledAny;
          };

          filled |= fillInput('firstName', details.firstName);
          filled |= fillInput('middleName', details.middleName);
          filled |= fillInput('lastName', details.lastName);
          filled |= fillInput('age', details.age);
          filled |= fillInput('dob', details.dob);
          filled |= fillInput('email', details.email);
          filled |= fillInput('phone', details.phone);
          filled |= fillInput('city', details.city);
          filled |= fillInput('state', details.state);
          filled |= fillInput('country', details.country);
          filled |= fillInput('cgpa', details.cgpa);
          filled |= fillSelect('gender', details.gender);
          filled |= fillRadio('gender', details.gender);

          console.log('Autofill completed, filled:', filled);
          if (filled) {
            sendResponse({ status: 'success' });
          } else if (attempts < maxAttempts - 1) {
            attempts++;
            console.log(`Retrying autofill, attempt ${attempts + 1}`);
            setTimeout(tryAutofill, 1000);
          } else {
            sendResponse({ status: 'no_fields' });
          }
        } catch (error) {
          console.error('Autofill error:', error.message);
          sendResponse({ status: 'error', message: error.message });
        }
      }
      tryAutofill();
      return true; // Keep the message channel open for async response
    }

    // Check for forms
    if (request.action === 'checkForms') {
      const hasForms = checkForms();
      console.log('Forms check:', hasForms);
      sendResponse({ hasForms });
      return true;
    }

    // Record Mode
    if (request.action === 'toggleRecordMode') {
      if (request.enabled) {
        document.querySelectorAll('form').forEach((form) => {
          form.addEventListener('submit', () => {
            const details = {
              firstName: '',
              middleName: '',
              lastName: '',
              age: '',
              dob: '',
              email: '',
              phone: '',
              city: '',
              state: '',
              country: '',
              cgpa: '',
              gender: ''
            };
            const inputs = form.querySelectorAll('input, select, textarea');
            inputs.forEach((input) => {
              const name = input.name.toLowerCase();
              if (name.match(/first\s*name|fname|given\s*name|user.*first/i)) details.firstName = input.value;
              else if (name.match(/middle\s*name|mname|middle|user.*middle/i)) details.middleName = input.value;
              else if (name.match(/last\s*name|lname|surname|user.*last/i)) details.lastName = input.value;
              else if (name.match(/age|years|user.*age/i)) details.age = input.value;
              else if (name.match(/dob|birthdate|date\s*of\s*birth|birth_date|user.*birthdate|birthday/i)) details.dob = input.value;
              else if (name.match(/email|mail|user.*email|email.*address/i)) details.email = input.value;
              else if (name.match(/phone|telephone|tel|phone.*number|user.*phone/i)) details.phone = input.value;
              else if (name.match(/city|user.*city|address.*city/i)) details.city = input.value;
              else if (name.match(/state|user.*state|address.*state/i)) details.state = input.value;
              else if (name.match(/country|user.*country|address.*country/i)) details.country = input.value;
              else if (name.match(/cgpa|gpa|grade.*point|user.*cgpa/i)) details.cgpa = input.value;
              else if (name.match(/gender|sex|user.*gender/i)) details.gender = input.value;
            });
            console.log('Recording form data:', details);
            if (isExtensionContextValid()) {
              chrome.runtime.sendMessage({ action: 'recordData', details });
            }
          });
        });
        document.querySelectorAll('iframe').forEach((iframe) => {
          try {
            const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
            iframeDoc.querySelectorAll('form').forEach((form) => {
              form.addEventListener('submit', () => {
                const details = {
                  firstName: '',
                  middleName: '',
                  lastName: '',
                  age: '',
                  dob: '',
                  email: '',
                  phone: '',
                  city: '',
                  state: '',
                  country: '',
                  cgpa: '',
                  gender: ''
                };
                const inputs = form.querySelectorAll('input, select, textarea');
                inputs.forEach((input) => {
                  const name = input.name.toLowerCase();
                  if (name.match(/first\s*name|fname|given\s*name|user.*first/i)) details.firstName = input.value;
                  else if (name.match(/middle\s*name|mname|middle|user.*middle/i)) details.middleName = input.value;
                  else if (name.match(/last\s*name|lname|surname|user.*last/i)) details.lastName = input.value;
                  else if (name.match(/age|years|user.*age/i)) details.age = input.value;
                  else if (name.match(/dob|birthdate|date\s*of\s*birth|birth_date|user.*birthdate|birthday/i)) details.dob = input.value;
                  else if (name.match(/email|mail|user.*email|email.*address/i)) details.email = input.value;
                  else if (name.match(/phone|telephone|tel|phone.*number|user.*phone/i)) details.phone = input.value;
                  else if (name.match(/city|user.*city|address.*city/i)) details.city = input.value;
                  else if (name.match(/state|user.*state|address.*state/i)) details.state = input.value;
                  else if (name.match(/country|user.*country|address.*country/i)) details.country = input.value;
                  else if (name.match(/cgpa|gpa|grade.*point|user.*cgpa/i)) details.cgpa = input.value;
                  else if (name.match(/gender|sex|user.*gender/i)) details.gender = input.value;
                });
                console.log('Recording iframe form data:', details);
                if (isExtensionContextValid()) {
                  chrome.runtime.sendMessage({ action: 'recordData', details });
                }
              });
            });
          } catch (e) {
            console.log('Cannot access iframe:', e);
          }
        });
      }
    }
  });

  // Handle recorded data
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'recordData' && isExtensionContextValid()) {
      getStorage('profiles')
        .then((data) => {
          const profiles = data.profiles || {};
          const profileName = `Recorded_${Date.now()}`;
          profiles[profileName] = request.details;
          return new Promise((resolve, reject) => {
            chrome.storage.sync.set({ profiles }, () => {
              if (chrome.runtime.lastError) {
                reject(chrome.runtime.lastError);
              } else {
                resolve();
              }
            });
          });
        })
        .then(() => {
          console.log('Recorded profile saved:', profileName);
          chrome.runtime.sendMessage({ action: 'refreshProfiles' });
        })
        .catch((error) => {
          console.error('Error saving recorded profile:', error.message);
        });
    }
  });

  // Observe DOM changes
  const observer = new MutationObserver(() => {
    console.log('DOM changed, checking forms');
    if (isExtensionContextValid()) {
      chrome.runtime.sendMessage({ action: 'checkForms' });
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });

  // Initial form check with retry
  let formCheckAttempts = 0;
  const maxFormCheckAttempts = 10;
  function retryFormCheck() {
    if (formCheckAttempts < maxFormCheckAttempts && isExtensionContextValid()) {
      formCheckAttempts++;
      console.log(`Form check attempt ${formCheckAttempts}`);
      chrome.runtime.sendMessage({ action: 'checkForms' });
      setTimeout(retryFormCheck, 1000);
    }
  }
  retryFormCheck();

  // Listen for postMessage from cross-origin iframes
  window.addEventListener('message', (event) => {
    if (!isExtensionContextValid()) {
      console.log('Extension context invalidated, ignoring postMessage');
      return;
    }
    if (event.data.action === 'checkForms') {
      const hasForms = checkForms();
      event.source.postMessage({ action: 'checkFormsResponse', hasForms }, '*');
    } else if (event.data.action === 'autofill') {
      getStorage('profiles')
        .then((data) => {
          if (!isExtensionContextValid()) return;
          const profiles = data.profiles || {};
          const profileData = profiles[event.data.profileKey];
          if (profileData) {
            const details = decryptData(profileData, event.data.encryptionKey);
            if (details) {
              console.log('Cross-origin autofill triggered:', details);
              // Reuse fillInput, fillSelect, etc. for cross-origin iframes
              const fields = {
                firstName: [/first\s*name/i, /fname/i, /given\s*name/i, /user.*first/i, 'first'],
                middleName: [/middle\s*name/i, /mname/i, /middle/i, /user.*middle/i],
                lastName: [/last\s*name/i, /lname/i, /surname/i, /user.*last/i, 'last'],
                age: [/age/i, /years/i, /user.*age/i, 'age_field'],
                dob: [/dob/i, /birthdate/i, /date\s*of\s*birth/i, /birth_date/i, /user.*birthdate/i, 'birthday'],
                email: [/email/i, /mail/i, /user.*email/i, /email.*address/i],
                phone: [/phone/i, /telephone/i, /tel/i, /phone.*number/i, /user.*phone/i],
                city: [/city/i, /user.*city/i, /address.*city/i],
                state: [/state/i, /user.*state/i, /address.*state/i],
                country: [/country/i, /user.*country/i, /address.*country/i],
                cgpa: [/cgpa/i, /gpa/i, /grade.*point/i, /user.*cgpa/i],
                gender: [/gender/i, /sex/i, /user.*gender/i]
              };
              let filled = false;
              for (const fieldType of Object.keys(fields)) {
                filled |= fillInput(fieldType, details[fieldType]);
                if (fieldType === 'gender') {
                  filled |= fillSelect(fieldType, details[fieldType]);
                  filled |= fillRadio(fieldType, details[fieldType]);
                }
              }
              if (filled) {
                event.source.postMessage({ action: 'autofillResponse', status: 'success' }, '*');
              } else {
                event.source.postMessage({ action: 'autofillResponse', status: 'no_fields' }, '*');
              }
            } else {
              event.source.postMessage({ action: 'autofillResponse', status: 'invalid_key' }, '*');
            }
          } else {
            event.source.postMessage({ action: 'autofillResponse', status: 'no_profile' }, '*');
          }
        })
        .catch((error) => {
          console.error('Cross-origin autofill error:', error.message);
          event.source.postMessage({ action: 'autofillResponse', status: 'error', message: error.message }, '*');
        });
    }
  });
} else {
  console.log('Extension context invalidated on load, skipping initialization');
}