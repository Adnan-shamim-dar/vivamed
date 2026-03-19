# 🚀 Quick Start: Getting OpenRouter API Key

## What You Need To Do (Right Now)

### Step 1: Get a New API Key
1. Go to **https://openrouter.io/** (or https://openrouter.ai/)
2. Click **Sign Up** or log in
3. Navigate to **Keys** section in your account
4. Click **Generate New Key**
5. Copy the entire key (looks like: `sk-or-v1-xxxxxxxxxxxxx...`)

### Step 2: Update server.js
Open `server.js` in your text editor:
- **Line 1:** Replace the old key with your new one
- Old: `const OPENROUTER_API_KEY = "sk-or-v1-154ae74c203..."`
- New: `const OPENROUTER_API_KEY = "sk-or-v1-YOUR-NEW-KEY-HERE"`

### Step 3: Restart the Server
```bash
# Stop the old server (Ctrl+C or close the terminal)
# Then start fresh:
node server.js
```

### Step 4: Test the System
1. Open the app in your browser
2. Start exam or practice mode
3. **Look at the badge next to each question:**
   - 🤖 AI = Question from OpenRouter (Good!)
   - 📝 Local = Question from local bank (Still using fallback)

### Step 5: Check the Logs
Open the terminal where the server is running. You should see:
```
🔄 CALLING OPENROUTER API
━━━━━━━━━━━━━━━━━━━━━━
✅ AI response received successfully!
```

---

## What's Currently Happening

### The Problem
The API key in the code is **INVALID** (401 User not found error)

### The Good News ✅
- The system IS trying to call the API
- It's just getting rejected
- Once you provide a valid key, everything will work
- No code changes needed - just the key!

### System Flow
```
App asks for question
    ↓
Server tries OpenRouter API
    ↓
❌ API Key Invalid (401 error)
    ↓
Falls back to local question
    ↓
Returns local question with source: 'local'
    ↓
Frontend displays badge: 📝 Local
```

Once you fix the API key:
```
App asks for question
    ↓
Server calls OpenRouter API
    ↓
✅ API returns question
    ↓
Returns AI question with source: 'ai'
    ↓
Frontend displays badge: 🤖 AI
```

---

## Skip & Back Buttons
✅ **These are working correctly**
- **Skip:** Moves to next question without submitting
- **Back to Menu:** Returns to main menu and resets progress

---

## Files Updated

| File | Change |
|------|--------|
| `server.js` | Added detailed logging, proper error handling, source field |
| `index.html` | Added fetchQuestionsFromServer(), source badge display |
| `diagnostic.js` | New tool to test API connectivity |
| `DIAGNOSTIC_REPORT.md` | Full analysis of the issue |

---

## Still Have Issues?

Run the diagnostic:
```bash
node diagnostic.js
```

This will show you exactly what's happening with the API.

---

**Contact:** If the API key is valid but still not working, check the diagnostic output for more details.
