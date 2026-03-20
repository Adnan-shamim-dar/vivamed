# 🧪 PDF-Based Question Generation - Testing Guide

## ✅ Quick Start Test

### Prerequisites
- Server running on `http://localhost:8888`
- Any PDF file with medical content (minimum 2-3 pages recommended)
- Browser with Developer Tools (F12)

### Step-by-Step Test

#### 1. **Open Browser Console**
   - Press `F12` to open Developer Tools
   - Go to **Console** tab
   - This is where you'll see all the logs

#### 2. **Open the App**
   - Go to `http://localhost:8888`
   - You should see the VivaMed main screen with mode selection

#### 3. **Upload a PDF**
   - Click the **"📤 Upload PDF"** button
   - Select a medical PDF (pathology, anatomy, physiology, etc.)
   - **Watch the Console**:
     ```
     📤 Uploading PDF: filename.pdf
     ✅ PDF uploaded successfully: {fileId, chunks, ...}
     ```
   - You should see a **"Processing PDF... Extracting key concepts"** message
   - After 5-15 seconds, the processing indicator disappears
   - You'll see the **filename and chunk count** displayed

#### 4. **Start Practice Mode**
   - Click **"🎓 Practice Mode"**
   - **Watch the Console** for:
     ```
     ✅ Session created, now fetching questions with PDF context...
     📝 Session Creation Request:
        sessionId: session_XXXX
        mode: practice
        fileId: pdf_XXXX  ← This should NOT be NONE if PDF uploaded!
     ✅ Session created
        Mode: practice
        PDF: ✅ Linked to pdf_XXXX
     ```

#### 5. **Fetch Questions - Watch Console**
   - The question will load
   - **Look for these logs:**
     ```
     🔍 Checking session for PDF...
        Session found: YES
        fileId: pdf_XXXX
     ✅ USING PDF! Generating PDF-based question from pdf_XXXX
     📡 OpenRouter API Response Status: 200
     ✅ AI Question Generated Successfully: ...
     ```
   - **Then you'll see:**
     ```
     ✅ Fetched 1 questions. Sources: ['pdf-ai']
     📋 PDF-Based Questions: ['✅ PDF']
     🔖 Chunk Indexes: [0]
     📄 Using PDF: filename.pdf (24 chunks)
     ```

#### 6. **Question Should Show PDF Badge**
   - The question should display with a **"📄 PDF-Based"** badge (purple)
   - NOT a generic "🤖 AI" badge

#### 7. **Submit Answer**
   - Answer the question
   - Click **Submit**
   - The progress counter should increment
   - In console: `📊 Progress saved (1)`

#### 8. **Next Question - Should Also Be PDF-Based**
   - Click **Next Question**
   - Watch the console again
   - You should see the **chunk rotation**:
     ```
     🔄 Rotating from chunk 0 to 1 (of 24)
     ✅ USING PDF! Generating PDF-based question from pdf_XXXX
     ```
   - Different chunk index (1, 2, 3... rotating through all 24)
   - Question should reference different content from the PDF

---

## 🔍 What to Look For

### ✅ **Success Signs** (PDF-Based Questions Working)
```
✅ USING PDF! Generating PDF-based question
📋 PDF-Based Questions: ['✅ PDF']
🔖 Chunk Indexes: [0], [1], [2], ...  (rotating)
📄 PDF-Based badge showing on question
Questions contain specific content from your PDF
Questions reference exact examples/mechanisms from material
```

### ❌ **Problem Signs** (PDF Not Being Used)
```
❌ No PDF linked to session, falling back to generic question
🤖 Generating generic AI question (no session or no PDF)
📋 PDF-Based Questions: ['❌ Generic']
🔖 Chunk Indexes: [null, null, null]
📄 Questions show "🤖 AI" badge instead of "📄 PDF-Based"
Questions are generic (could apply to any topic)
```

---

##  **Debugging Checklist**

### If PDF Shows But Questions Are Generic:

1. **Check Session Creation**
   - Open console BEFORE clicking mode button
   - Look for "Session Creation Request" - does fileId show?
   - Should say "✅ Linked to pdf_XXXX" NOT "❌ No PDF"

2. **Verify PDF Upload Success**
   - After uploading PDF, check for:
     ```
     ✅ PDF uploaded successfully
     📄 [filename] (24 chunks extracted)
     ```

3. **Check if sessionId is Passed to Server**
   - Open Network tab in Developer Tools (F12)
   - Look for GET request to `/question`
   - URL should include: `?sessionId=session_XXXX`
   - If missing, questions won't know which session to use

4. **Verify Database**
   - Questions should show different chunk indexes rotating
   - If all questions show `chunkIndex: null`, PDF isn't being used

### If PDF Upload Fails:

1. **Check File Size**
   - Must be less than 10MB
   - If larger, system will reject

2. **Check File Format**
   - Must be actual PDF (not scanned image if possible)
   - Text-based PDFs work best

3. **Check Console Errors**
   - Look for error messages in browser console
   - Server console might show PDF parsing error

4. **Try Again**
   - Sometimes first upload takes longer
   - Click "Remove" and re-upload

---

## 📊 **Example Console Output (Working Correctly)**

```javascript
// ===== Upload PDF =====
📤 Uploading PDF: Pathology_Neoplasia.pdf
✅ PDF uploaded successfully:
   fileId: pdf_1740025317_a1b2c3d4
   totalChunks: 24
   filename: Pathology_Neoplasia.pdf

// ===== Start Practice Mode =====
✅ Session created, now fetching questions with PDF context...

📝 Session Creation Request:
   sessionId: session_1740025330_e5f6g7h8
   mode: practice
   fileId: pdf_1740025317_a1b2c3d4  ← PDF LINKED!

✅ Session created
   Mode: practice
   PDF: ✅ Linked to pdf_1740025317_a1b2c3d4

// ===== First Question =====
🔍 Checking session session_1740025330_e5f6g7h8 for PDF...
   Session found: YES
   fileId: pdf_1740025317_a1b2c3d4
✅ USING PDF! Generating PDF-based question from pdf_1740025317_a1b2c3d4

🔄 Rotating from chunk 0 to 1 (of 24)
📡 OpenRouter API Response Status: 200
✅ AI Question Generated Successfully: Explain the role of p53 mutation in...

✅ Fetched 1 questions. Sources: ['pdf-ai']
📋 PDF-Based Questions: ['✅ PDF']
🔖 Chunk Indexes: [0]
📄 Using PDF: Pathology_Neoplasia.pdf (24 chunks)

// ===== Answer Submitted =====
📊 Progress saved (1)

// ===== Next Question =====
🔍 Checking session session_1740025330_e5f6g7h8 for PDF...
   Session found: YES
   fileId: pdf_1740025317_a1b2c3d4
✅ USING PDF! Generating PDF-based question from pdf_1740025317_a1b2c3d4

🔄 Rotating from chunk 1 to 2 (of 24)  ← DIFFERENT CHUNK!
✅ AI Question Generated Successfully: Describe the mechanisms by which...
✅ Fetched 1 questions. Sources: ['pdf-ai']
```

---

## 🎯 **Expected Behavior**

### Without PDF (Default):
- Questions are generic medical topics
- Badge shows "🤖 AI"
- Questions don't reference any specific material
- Can answer with general medical knowledge

###With PDF Upload:
- Questions reference specific content from your PDF
- Badge shows "📄 PDF-Based"
- Each question pulls from a different section (chunk rotation)
- Must use the actual PDF to answer correctly
- Questions test practical knowledge of YOUR material

---

## 📱 **Mobile Testing**

### Browser Console on Phone:
- Chrome/Firefox: Long press page → **Inspect** (or Inspecct Element)
- Scroll to **Console** tab
- Same logs visible there

---

## 🐛 **Report These Issues**

If you see:
- PDF uploads but questions are still generic
- Session shows "❌ No PDF" even after upload
- chunkIndex stuck at 0 or null
- Repeated error messages in console

**Create a GitHub issue with:**
1. Screenshot of browser console
2. What PDF you used
3. Steps to reproduce
4. Browser and OS version

---

## ✨ **Success Confirmation**

You'll know it's working when:
1. ✅ PDF uploads successfully (see fileId notification)
2. ✅ Session shows "✅ Linked to pdf_XXXX" in console
3. ✅ Questions show "📄 PDF-Based" badge
4. ✅ Chunk indexes rotate: 0 → 1 → 2 → 3...
5. ✅ Questions reference specific content from YOUR PDF
6. ✅ Each answer is saved with PDF metadata
7. ✅ Progress survives app restart (in database)

---

**Questions? Check the console logs first - they tell you exactly what's happening!** 🎓
