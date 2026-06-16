# Publish to GitHub Pages

This folder contains the public legal pages for **Last Stand Tower Defense**.

## Create the repository (one-time)

1. Go to https://github.com/new
2. Repository name: `last-stand-privacy`
3. Visibility: **Public**
4. Do **not** add a README, .gitignore, or license (this folder already has files)
5. Click **Create repository**

## Push from this machine

```bash
cd privacy-site
git remote add origin https://github.com/jshugart90-png/last-stand-privacy.git
git push -u origin main
```

## Enable GitHub Pages

1. Open https://github.com/jshugart90-png/last-stand-privacy/settings/pages
2. **Build and deployment** → Source: **Deploy from a branch**
3. Branch: `main` / folder: `/ (root)`
4. Save

Pages will be live in 1–3 minutes at:

- **Privacy Policy:** https://jshugart90-png.github.io/last-stand-privacy/
- **Support:** https://jshugart90-png.github.io/last-stand-privacy/support.html

## App Store Connect

| Field | URL |
|-------|-----|
| Privacy Policy URL | `https://jshugart90-png.github.io/last-stand-privacy/` |
| Support URL | `https://jshugart90-png.github.io/last-stand-privacy/support.html` |
| Copyright | `© 2026 Horseshoe Round Me Gaming` |
