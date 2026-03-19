# 🏥 AI Medical Viva Trainer

An AI-powered medical education platform that generates unlimited practice questions using OpenRouter's AI models. All your progress is automatically saved to a persistent database.

## ✨ Features

- **Unlimited AI-Generated Questions**: Fresh questions every time, powered by gpt-oss-120b model
- **Progress Tracking**: All attempts automatically saved to local database
- **Two Modes**:
  - 🎓 **Practice Mode**: Unlimited questions for free study
  - 📋 **Exam Mode**: Train with unlimited questions in exam format
- **Voice Recognition**: Answer questions using voice input
- **Auto-Evaluation**: AI scores your answers instantly
- **Statistics Dashboard**: Track your performance over time
- **Persistent Storage**: Database persists across sessions

## 🚀 Quick Start

### Installation
```bash
npm install
```

### Launch the Server
```bash
npm start
```

The server will start on `http://localhost:5001`

### First Run
1. Open http://localhost:5001 in your browser
2. Choose Practice or Exam mode
3. Start answering questions - your progress is automatically saved!

## 📊 Data & Progress

All progress is stored in `data/progress.db`:
- **Sessions**: Each mode activation creates a session
- **Attempts**: Every submitted answer is recorded with score and feedback
- **Statistics**: View your average score, max score, and attempt history

### View Your Stats
Access the progress API:
- `GET /progress/session/:sessionId` - Load session history
- `GET /progress/stats/:sessionId` - View statistics

## 🛠️ Configuration

### Environment Variables (`.env`)
```
OPENROUTER_API_KEY=your_api_key_here
```

**Get your API key:**
1. Visit https://openrouter.ai/
2. Sign up / Login
3. Get your free API key from dashboard
4. Add to `.env` file

### Server Port
Default: **5000**
To change: Edit `server.js` line 325

## 📁 Project Structure

```
vivamed/
├── server.js           # Express backend with AI integration
├── index.html          # Frontend UI with progress tracking
├── package.json        # Dependencies
├── .env                # API configuration (keep secret!)
├── .gitignore          # Git exclusions
├── data/
│   └── progress.db     # Persistent SQLite database
└── README.md           # This file
```

## 🔄 How Progress Saving Works

1. **Session Creation**: When you start Practice/Exam mode, a unique session ID is created
2. **Auto-Save**: Every submitted answer is saved with:
   - Question content
   - Your answer
   - AI score (0-10)
   - Question source (AI or Local)
   - Timestamp
3. **Persistent**: Data survives app restarts, browser closes, etc.
4. **Queryable**: View your history anytime via API

## 🚨 Troubleshooting

### Port Already in Use
If port 5000 is busy:
```bash
netstat -ano | findstr :5000
taskkill /PID <process_id> /F
```

Then restart the server.

### Database Reset
To start fresh (delete all progress):
```bash
rm data/progress.db
```

Database tables will auto-recreate on next launch.

### Missing API Key
Error: "API key not configured"
- Add `OPENROUTER_API_KEY` to `.env`
- Restart the server

## 💡 Tips

- **Backup Progress**: Copy `data/progress.db` to backup
- **New Session**: Each mode start creates a new session with unique ID
- **Offline Practice**: Questions are AI-generated in real-time - internet required
- **Voice Input**: Click 🎤 and speak your answer for hands-free practice

## 📈 Next Features Coming

- [x] Progress tracking
- [x] Statistics dashboard
- [ ] Study material upload
- [ ] Question difficulty filters
- [ ] Performance analytics
- [ ] Export reports as PDF

## 🤝 Support

If something breaks:
1. Check the browser console for errors (F12)
2. Check server logs in terminal
3. Verify `.env` file has your API key
4. Try deleting `data/progress.db` and restarting

## 📝 License

MIT - Feel free to modify and use!

---

**Powered by OpenRouter AI | Built for Medical Education**
