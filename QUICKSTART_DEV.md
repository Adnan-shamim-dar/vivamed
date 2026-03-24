# ⚡ QUICK START: Safe Development

## 🚀 Start Dev Server (Choose One)

### Option 1: Safe Restart (RECOMMENDED) ⭐
```bash
npm run dev-safe
# OR
bash scripts/dev-safe.sh
```
**Pros:** Cleans up old processes automatically
**When to use:** After making code changes, if you get "port in use" errors

### Option 2: Normal Dev
```bash
npm run dev
```
**Pros:** Standard nodemon behavior
**When to use:** First time, or when you know port is free

### Option 3: Clear Then Dev
```bash
taskkill /F /IM node.exe 2>/dev/null
npm run dev
```
**Pros:** Manual control
**When to use:** Debugging port issues

---

## ✅ Verify Server is Fresh

After starting, check one of these to verify you have the latest code:

```bash
# Quick health check
curl http://localhost:9997/health

# Check code version (shows exact startup time)
curl http://localhost:9997/api/dev/code-version

# Test questions load
curl http://localhost:9997/question?sessionId=test
```

---

## 🔴 If You See "Failed to Load Questions"

This means old code is running. Fix it:

```bash
# Kill all Node processes
taskkill /F /IM node.exe /T

# Wait then restart
npm run dev
```

---

## 📋 What's Fixed

✅ **Before:** "Address already in use" crashes → users hit stale code
✅ **Now:** Automatic cleanup + clear error messages + safe restart

---

**See full guide:** `STALE_CODE_FIX.md`
