# Security Policy

## Reporting Security Issues

**Do NOT** create a public GitHub issue for security vulnerabilities!

If you discover a security vulnerability, please email: `security@vivamed.local`

Please include:
- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

We will respond within 48 hours and work on a fix.

## Security Best Practices

### For Users
1. **Keep your API key secret** - Never share your `.env` file
2. **Use HTTPS** in production (not localhost)
3. **Backup `data/progress.db`** regularly
4. **Keep Node.js updated** - Security patches are important
5. **Verify API key source** - Only use official OpenRouter keys

### For Contributors
1. **Never commit `.env`** - It's in .gitignore, keep it that way
2. **Validate user input** - Always sanitize data
3. **Use parameterized queries** - SQLite queries use ? placeholders
4. **Check dependencies** - Run `npm audit` before submitting PRs
5. **Report vulns privately** - Don't disclose publicly

### For Deployment
- Use environment variables for configuration
- Enable HTTPS on production
- Set secure SQLite permissions
- Use rate limiting on API endpoints
- Monitor error logs

## Known Issues

None currently known. Please report responsibly!

## Version Support

We support:
- Node.js 18.x and above
- Latest Express.js stable
- SQLite 3.x
- All modern browsers

Security patches will be backported to:
- Current version (always)
- Previous major version (6 months)

## Dependencies Security

We use `npm audit` to check for vulnerabilities. All pull requests must pass security checks.

---

**Safe and Secure AI Education for All** 🔐
