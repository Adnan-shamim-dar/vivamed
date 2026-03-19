# Changelog

All notable changes to VivaMed will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-03-19

### Added
- ✨ Unlimited AI-generated questions via OpenRouter API
- 📊 SQLite database for persistent progress tracking
- 🎓 Practice Mode with unlimited free study questions
- 📋 Exam Mode with unlimited practice questions
- 🎤 Voice recognition for hands-free answer input
- 💾 Auto-save every submission with scores and timestamps
- 📈 Progress statistics API (view scores, attempts, performance)
- 🚀 Easy launch scripts (start.bat for Windows, start.sh for Unix)
- 🔐 Git version control with proper .gitignore
- 📝 Comprehensive documentation (README, CONTRIBUTING, SECURITY)
- ✅ GitHub Actions CI/CD pipeline
- 🔄 Session management (unique session ID per mode start)
- 🤖 AI evaluation with 0-10 scoring system
- 📌 Source attribution (AI vs Local questions)
- ⏱️ Timer and character count feedback

### Technical Details
- Framework: Express.js 4.18.2
- Database: SQLite3
- AI Model: gpt-oss-120b (free, via OpenRouter)
- Frontend: HTML5 + Tailwind CSS + Vanilla JavaScript
- Server Port: 5001

### Database Schema
```
sessions:
  - sessionId (unique)
  - mode (practice/exam)
  - startTime
  - createdAt

attempts:
  - id (auto)
  - sessionId (foreign key)
  - questionIndex
  - question
  - answer
  - score
  - source
  - timestamp
```

### API Endpoints
- `GET /question` - Get AI-generated question
- `POST /evaluate` - Evaluate submitted answer
- `GET /health` - Health check
- `GET /diagnostic` - Test AI connection
- `POST /progress/session` - Create session
- `POST /progress/save` - Save attempt
- `GET /progress/session/:id` - Get session history
- `GET /progress/stats/:id` - Get statistics

### Files
- `server.js` - Backend with database and AI integration
- `index.html` - Frontend UI with progress tracking
- `package.json` - Dependencies and scripts
- `.env` - Environment configuration
- `.gitignore` - Git exclusions
- `start.bat` / `start.sh` - Launch scripts
- `README.md` - User documentation
- `CONTRIBUTING.md` - Contribution guidelines
- `SECURITY.md` - Security policy
- `LICENSE` - MIT License
- `.github/workflows/node.js.yml` - CI/CD pipeline

### Known Limitations
- Questions must have internet connection (API-dependent)
- Free model rate limits not yet tested at scale
- No user authentication (all progress local)
- Single-user local database

### Future Roadmap
- [ ] User accounts and cloud sync
- [ ] Export progress as PDF
- [ ] Difficulty filters
- [ ] Study material upload
- [ ] Performance analytics dashboard
- [ ] Multi-user support
- [ ] Offline mode
- [ ] Mobile app

---

## Versioning

We follow [Semantic Versioning](https://semver.org/):
- **MAJOR** version for breaking changes
- **MINOR** version for new features (backward compatible)
- **PATCH** version for bug fixes

---

**Started**: March 2026
**Status**: Active Development
**License**: MIT
