# Deployment Checklist: Prevent Stale Code Issues

## Before Making Code Changes
- [ ] Verify server status: `curl http://localhost:9997/health`
- [ ] Check code version matches latest: `curl http://localhost:9997/api/dev/code-version`
- [ ] Verify Adaptive Learning active: Look for `"adaptiveLoadingReady": true`

## Making Code Changes
1. Edit code files
2. **If using `npm run dev`** (with nodemon):
   - Server auto-restarts automatically on save
   - Check console for fresh startup logs
   - NO MANUAL RESTART NEEDED ✅

3. **If using regular `npm start`**:
   - Save code changes
   - Run restart: `bash scripts/restart.sh`
   - Or in VS Code: Press **Ctrl+Shift+B** → "Restart Server"

## After Code Changes (CRITICAL VERIFICATION!)
```bash
# Check that fresh code loaded
curl http://localhost:9997/api/dev/code-version

# Verify Adaptive Learning working
bash scripts/health-check.sh

# If health check fails:
# 1. Check error message
# 2. Run restart again: bash scripts/restart.sh
# 3. Try health check again
```

## If "Unable to Load Questions" Occurs
1. Check current running code:
   ```bash
   curl http://localhost:9997/api/dev/code-version
   ```

2. If features missing:
   ```bash
   bash scripts/restart.sh
   ```

3. Verify with health check:
   ```bash
   bash scripts/health-check.sh
   ```

4. If still failing: Check error logs in console

## Production Deployment
1. `git pull origin master` - Get latest code
2. `npm install` - Install new dependencies
3. `bash scripts/restart.sh` - Kill old, start new
4. `bash scripts/health-check.sh` - Verify all systems go
5. If check fails: Check logs, don't force deploy

## Quick Restart Methods (Pick One)
- **Method 1 (Easiest):** VS Code: Press `Ctrl+Shift+B`
- **Method 2:** Terminal: `bash scripts/restart.sh`
- **Method 3 (DevMode, Auto):** `npm run dev` (auto-restarts on change)

## Troubleshooting
| Symptom | Cause | Fix |
|---------|-------|-----|
| "EADDRINUSE" error | Old process holds port | `bash scripts/restart.sh` |
| Features still missing | Stale code running | Check code version, restart again |
| Health check fails | New code issue | Check logs, revert if critical |
| Adaptive Learning not showing topics | Old code deployed | Verify code hash, restart server |
| MCQ questions without topics | Stale learningService | Check health-check output |

## Development Workflow Recommendation

### For Active Development (Best Practice)
```bash
# Terminal 1: Watch for file changes and auto-restart
npm run dev

# Terminal 2: Check health anytime
bash scripts/health-check.sh

# Terminal 3: Use for other commands (git, npm install, etc)
```

### For Quick Testing
```bash
# Make your code change
# Save the file
# VS Code: Press Ctrl+Shift+B to restart
# Wait 2 seconds
# Browser: Reload and test
```

### For Deployment/Production
```bash
# Pull latest
git pull origin master

# Install any new dependencies
npm install

# Kill old, start new
bash scripts/restart.sh

# Verify everything works
bash scripts/health-check.sh

# All checks pass? Production ready!
```

## Common Issues & Solutions

### Issue: "Error: EADDRINUSE: address already in use :::9997"
**Cause:** Old Node process still holds the port
**Solution:**
```bash
bash scripts/restart.sh
# Wait 2 seconds for port to free
# Server should start fresh
```

### Issue: Features missing after code change
**Cause:** Running stale code, not your new code
**Solution:**
```bash
# Verify code version
curl http://localhost:9997/api/dev/code-version
# If hash is old, restart
bash scripts/restart.sh
# Verify again
bash scripts/health-check.sh
```

### Issue: "Unable to load questions" error
**Cause:** Server ran out of memory or old process serving stale code
**Solution:**
```bash
# Option 1: Quick restart
bash scripts/restart.sh

# Option 2: Kill and wait longer
bash scripts/restart.sh
# Wait 5 seconds
curl http://localhost:9997/health

# Option 3: Nuclear option (in Windows terminal)
taskkill /F /IM node.exe /T
# Wait 3 seconds
npm start
```

### Issue: Health check reports "Adaptive Learning not loaded"
**Cause:** Code is stale, learningService not compiled fresh
**Solution:**
```bash
# Restart
bash scripts/restart.sh

# Verify topics are in MCQ response
curl -X POST http://localhost:9997/mcq-question \
  -H "Content-Type: application/json" \
  -d '{"sessionId":"test","fileId":null,"difficulty":"medium"}' \
  | grep '"topic"'

# Should see: "topic":"SomeTopic"
```

## Health Check Verification

When you run `bash scripts/health-check.sh`, you should see:
```
🔍 Health checking server at http://localhost:9997...
✅ Server responds to /health
📋 Checking code version...
✅ Code version verified (hash: abc1234)
✅ Adaptive Learning system verified - topics feature active
📋 Checking MCQ endpoint...
✅ MCQ endpoint with adaptive topics working (topic: Cardiology)

✅ ALL HEALTH CHECKS PASSED ✅
Server is fully ready with latest code!
```

If ANY check fails, follow the troubleshooting steps above.

---

## Remember
- ✅ Always verify code is fresh after changes: `curl http://localhost:9997/api/dev/code-version`
- ✅ Use health checks to confirm deployment: `bash scripts/health-check.sh`
- ✅ If in doubt, restart: `bash scripts/restart.sh`
- ✅ For development, use `npm run dev` for auto-restart
- ✅ For production, use `bash scripts/health-check.sh` to verify

**Status:** This checklist prevents stale code issues permanently! Follow it and "unable to load questions" becomes history. 🎉
