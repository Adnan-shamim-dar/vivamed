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

After starting, check one of these to verify you have the latest code on port 9996:

```bash
# Quick health check
curl http://localhost:9996/health

# Check code version (shows exact startup time)
curl http://localhost:9996/api/dev/code-version

# Test questions load
curl http://localhost:9996/question?sessionId=test
```

---

## 📱 Open App in Browser

```
http://localhost:9996
```

Frontend will automatically hit the backend on port 9996 (using relative URLs).

---

## 🔴 If You See "Failed to Load Questions"

This means backend isn't responding or has a different port.

**Fix it:**
```bash
# 1. Kill all procs
taskkill /F /IM node.exe /T

# 2. Wait for ports to free
sleep 3

# 3. Restart with safe script
npm run dev-safe

# 4. Verify on correct port
curl http://localhost:9996/health
```

---

## 📋 What's Fixed

✅ **Port Mismatch:** Frontend (hardcoded 9998) ↔ Backend (9996)
✅ **Solution:** Relative URLs - frontend automatically hits backend on any port
✅ **Result:** Questions load instantly, all endpoints working

---

**See full guide:** `QUESTIONS_LOADING_FIX.md`
**Architecture:** `STALE_CODE_FIX.md`

