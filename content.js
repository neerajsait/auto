chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
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

  // Check for forms in main document and iframes
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
      }
    });
    // W3Schools-specific check
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
    return hasForms;
  }

  // Autofill action
  if (request.action === 'autofill') {
    let attempts = 0;
    const maxAttempts = 3;
    function tryAutofill() {
      chrome.storage.sync.get('profiles', (data) => {
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
          firstName: ['firstName', 'fname', 'givenName', 'first_name', 'userFirstName', 'user_fname', 'first'],
          middleName: ['middleName', 'mname', 'middle_name', 'userMiddleName', 'middle'],
          lastName: ['lastName', 'lname', 'surname', 'last_name', 'userLastName', 'user_lname', 'last'],
          age: ['age', 'years', 'userAge', 'age_field'],
          dob: ['dob', 'birthdate', 'dateOfBirth', 'birth_date', 'userBirthdate', 'birthday'],
          email: ['email', 'mail', 'userEmail', 'emailAddress', 'email_address'],
          phone: ['phone', 'telephone', 'tel', 'phoneNumber', 'userPhone', 'phone_number'],
          custom: ['address', 'city', 'state', 'zip', 'custom', 'street', 'userAddress']
        };

        // Fill text inputs
        const fillInput = (fieldType, value) => {
          if (!value) return false;
          let filledAny = false;
          fields[fieldType].forEach((attr) => {
            const selector = `input[name*="${attr}" i], input[id*="${attr}" i], input[placeholder*="${attr}" i], input[aria-label*="${attr}" i], [role="textbox"][aria-label*="${attr}" i], [contenteditable][aria-label*="${attr}" i]`;
            const inputs = document.querySelectorAll(selector);
            console.log(`Field: ${fieldType}, Attr: ${attr}, Matches: ${inputs.length}`);
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
            // Check iframes
            document.querySelectorAll('iframe').forEach((iframe) => {
              try {
                const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
                const iframeInputs = iframeDoc.querySelectorAll(selector);
                console.log(`Iframe Field: ${fieldType}, Attr: ${attr}, Matches: ${iframeInputs.length}`);
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
              }
            });
          });
          return filledAny;
        };

        // Fill select elements
        const fillSelect = (fieldType, value) => {
          if (!value) return false;
          let filledAny = false;
          fields[fieldType].forEach((attr) => {
            const selector = `select[name*="${attr}" i], select[id*="${attr}" i]`;
            const selects = document.querySelectorAll(selector);
            console.log(`Select Field: ${fieldType}, Attr: ${attr}, Matches: ${selects.length}`);
            selects.forEach((select) => {
              select.value = value;
              select.dispatchEvent(new Event('change', { bubbles: true }));
              filledAny = true;
            });
            document.querySelectorAll('iframe').forEach((iframe) => {
              try {
                const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
                const iframeSelects = iframeDoc.querySelectorAll(selector);
                console.log(`Iframe Select Field: ${fieldType}, Attr: ${attr}, Matches: ${iframeSelects.length}`);
                iframeSelects.forEach((select) => {
                  select.value = value;
                  select.dispatchEvent(new Event('change', { bubbles: true }));
                  filledAny = true;
                });
              } catch (e) {
                console.log('Cannot access iframe:', e);
              }
            });
          });
          return filledAny;
        };

        // Fill checkboxes
        const fillCheckbox = (fieldType, value) => {
          if (!value) return false;
          let filledAny = false;
          fields[fieldType].forEach((attr) => {
            const selector = `input[type="checkbox"][name*="${attr}" i], input[type="checkbox"][id*="${attr}" i]`;
            const checkboxes = document.querySelectorAll(selector);
            console.log(`Checkbox Field: ${fieldType}, Attr: ${attr}, Matches: ${checkboxes.length}`);
            checkboxes.forEach((checkbox) => {
              checkbox.checked = true;
              checkbox.dispatchEvent(new Event('change', { bubbles: true }));
              filledAny = true;
            });
            document.querySelectorAll('iframe').forEach((iframe) => {
              try {
                const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
                const iframeCheckboxes = iframeDoc.querySelectorAll(selector);
                console.log(`Iframe Checkbox Field: ${fieldType}, Attr: ${attr}, Matches: ${iframeCheckboxes.length}`);
                iframeCheckboxes.forEach((checkbox) => {
                  checkbox.checked = true;
                  checkbox.dispatchEvent(new Event('change', { bubbles: true }));
                  filledAny = true;
                });
              } catch (e) {
                console.log('Cannot access iframe:', e);
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
        filled |= fillInput('custom', details.custom);
        filled |= fillSelect('firstName', details.firstName);
        filled |= fillSelect('middleName', details.middleName);
        filled |= fillSelect('lastName', details.lastName);
        filled |= fillSelect('age', details.age);
        filled |= fillSelect('dob', details.dob);
        filled |= fillSelect('email', details.email);
        filled |= fillSelect('phone', details.phone);
        filled |= fillSelect('custom', details.custom);
        filled |= fillCheckbox('custom', details.custom);

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
      });
    }
    tryAutofill();
    return true;
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
            custom: ''
          };
          const inputs = form.querySelectorAll('input, select, textarea');
          inputs.forEach((input) => {
            const name = input.name.toLowerCase();
            if (name.includes('firstname') || name.includes('fname') || name.includes('givenname')) details.firstName = input.value;
            else if (name.includes('middlename') || name.includes('mname')) details.middleName = input.value;
            else if (name.includes('lastname') || name.includes('lname') || name.includes('surname')) details.lastName = input.value;
            else if (name.includes('age') || name.includes('years')) details.age = input.value;
            else if (name.includes('dob') || name.includes('birthdate') || name.includes('dateofbirth')) details.dob = input.value;
            else if (name.includes('email') || name.includes('mail')) details.email = input.value;
            else if (name.includes('phone') || name.includes('tel')) details.phone = input.value;
            else if (name.includes('address') || name.includes('city') || name.includes('state') || name.includes('zip') || name.includes('custom')) {
              details.custom = input.value;
            }
          });
          console.log('Recording form data:', details);
          chrome.runtime.sendMessage({ action: 'recordData', details });
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
                custom: ''
              };
              const inputs = form.querySelectorAll('input, select, textarea');
              inputs.forEach((input) => {
                const name = input.name.toLowerCase();
                if (name.includes('firstname') || name.includes('fname') || name.includes('givenname')) details.firstName = input.value;
                else if (name.includes('middlename') || name.includes('mname')) details.middleName = input.value;
                else if (name.includes('lastname') || name.includes('lname') || name.includes('surname')) details.lastName = input.value;
                else if (name.includes('age') || name.includes('years')) details.age = input.value;
                else if (name.includes('dob') || name.includes('birthdate') || name.includes('dateofbirth')) details.dob = input.value;
                else if (include('email') || name.includes('mail')) details.email = input.value;
                else if (name.includes('phone') || name.includes('tel')) details.phone = input.value;
                else if (name.includes('address') || name.includes('city') || name.includes('state') || name.includes('zip') || name.includes('custom')) {
                  details.custom = input.value;
                }
              });
              console.log('Recording iframe form data:', details);
              chrome.runtime.sendMessage({ action: 'recordData', details });
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
  if (request.action === 'recordData') {
    chrome.storage.sync.get('profiles', (data) => {
      const profiles = data.profiles || {};
      const profileName = `Recorded_${Date.now()}`;
      profiles[profileName] = request.details;
      chrome.storage.sync.set({ profiles }, () => {
        console.log('Recorded profile saved:', profileName);
        chrome.runtime.sendMessage({ action: 'refreshProfiles' });
      });
    });
  }
});

// Observe DOM changes
const observer = new MutationObserver(() => {
  console.log('DOM changed, checking forms');
  chrome.runtime.sendMessage({ action: 'checkForms' });
});
observer.observe(document.body, { childList: true, subtree: true });

// Initial form check with retry
let formCheckAttempts = 0;
const maxFormCheckAttempts = 5;
function retryFormCheck() {
  if (formCheckAttempts < maxFormCheckAttempts) {
    formCheckAttempts++;
    console.log(`Form check attempt ${formCheckAttempts}`);
    chrome.runtime.sendMessage({ action: 'checkForms' });
    setTimeout(retryFormCheck, 1000);
  }
}
retryFormCheck();