# 🧠 AutoFill Chrome Extension

**AutoFill** is a simple and smart Chrome extension designed for personal use to auto-fill forms instantly with saved profile data. Whether you're filling job applications, college forms, or surveys, this tool saves time by eliminating repetitive typing.

---

## 🌟 Features

- 🔹 Save and manage multiple form profiles
- 🔒 Optional encryption using a custom key (CryptoJS)
- ⚡ One-click auto-fill functionality
- 🔄 Export/Import profiles (JSON support)
- 🧠 Record mode for dynamic field detection
- 🗑️ Delete saved profiles anytime
- 📦 Supports text, email, date, phone, select, and number fields

---

## 📁 Project Structure

autofill-extension/
├── manifest.json # Chrome Extension metadata
├── popup.html # Main interface for profile handling
├── popup.js # Logic to handle form filling and profile actions
├── styles.css # Basic CSS styling for popup.html
├── background.js # (Optional) Background scripts if needed
├── crypto-js.min.js # Library used for optional encryption
├── tet.html # Test HTML page for trying the extension




---

## 🧪 How to Use

1. Click the extension icon to open the popup.
2. Create a new profile with your form data (Name, Email, DOB, etc.)
3. Optionally enter an encryption key to protect sensitive data.
4. Save your profile.
5. Select a profile and click **Fill Form** — your fields are auto-filled.
6. Use **Record Mode** to detect and save new fields automatically.
7. Export or Import profiles using JSON for easy backup.

---

## 🛠️ Installation (Manual for Development)

1. Clone or download this repository:
   ```bash
   git clone https://github.com/neerajsait/auto.git
