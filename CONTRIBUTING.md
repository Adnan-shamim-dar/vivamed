# Contributing to VivaMed

Thank you for your interest in contributing to the AI Medical Viva Trainer!

## Getting Started

1. **Fork the repository** on GitHub
2. **Clone your fork** locally:
   ```bash
   git clone https://github.com/YOUR_USERNAME/vivamed.git
   cd vivamed
   ```

3. **Create a new branch** for your feature:
   ```bash
   git checkout -b feature/your-feature-name
   ```

4. **Install dependencies:**
   ```bash
   npm install
   ```

5. **Make your changes** and test locally:
   ```bash
   npm start
   ```

6. **Commit with clear messages:**
   ```bash
   git commit -m "Add: description of your changes"
   git commit -m "Fix: description of the bug fix"
   git commit -m "Update: description of updates"
   ```

7. **Push to your fork:**
   ```bash
   git push origin feature/your-feature-name
   ```

8. **Create a Pull Request** on GitHub describing:
   - What you changed
   - Why you changed it
   - How to test it

## Commit Message Format

```
<type>: <subject>

<body>

Fixes #<issue_number>
```

**Types:**
- `feat:` New feature
- `fix:` Bug fix
- `docs:` Documentation
- `style:` Formatting (no code change)
- `refactor:` Code restructuring
- `test:` Tests
- `chore:` Maintenance

**Example:**
```
feat: Add export to PDF functionality

Added ability to export session progress as PDF report
including scores, timestamps, and performance metrics.

Fixes #24
```

## Code Guidelines

- Use consistent indentation (2 spaces)
- Add comments for complex logic
- Test your changes before submitting
- Don't commit `.env` or `data/progress.db`
- Keep database queries efficient
- Add helpful error messages

## Testing

Before submitting a PR, make sure:
- ✅ Server starts without errors: `npm start`
- ✅ No sensitive data in commits
- ✅ All files follow project structure
- ✅ Progress tracking still works
- ✅ AI questions still generate

## Pull Request Process

1. Update README.md if needed
2. Update tests if applicable
3. GitHub Actions must pass
4. Request review from maintainers
5. Address any feedback
6. Maintainer will merge when ready

## Issues

Found a bug? Create an issue with:
- What happened (describe the bug)
- What you expected
- Steps to reproduce
- Your environment (Windows/Mac/Linux, Node version)

## Questions?

Check existing issues/discussions first, then create a new discussion if needed.

---

**Thank you for making VivaMed better!** 🚀
