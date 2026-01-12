# Questionary

A Tauri-based study companion app with question papers and study materials.

## Features

- Browse question papers by year, class, and exam type
- PDF viewer with study tools
- Favorites and recent documents
- Flashcards and notes
- Study planner and analytics
- **Incremental Updates** - Download only changed files without reinstalling!

## Incremental Update System

The app supports **hot updates** for both content AND code:

| Update Type | Files | Requires Reload? |
|------------|-------|------------------|
| **Content** | PDFs, study materials | No |
| **CSS** | Styles, themes | No (hot-applied) |
| **JavaScript** | app.js, features | Yes (prompt shown) |

### How It Works

1. Click the **cloud download button** (☁️) in the header
2. App checks for updates to PDFs, CSS, and JS files
3. Downloads only changed files (not 400MB!)
4. CSS updates apply instantly
5. JS updates prompt you to reload

### Update Flow

```
User clicks update button
        ↓
Fetch code-manifest.json & content-manifest.json from GitHub
        ↓
Compare file hashes with local versions
        ↓
Download only changed files
        ↓
CSS → Hot-apply immediately
JS  → Store & prompt reload
PDF → Store in AppData
```

## For Developers: Publishing Updates

### Quick Update (Code Changes Only)

```bash
# 1. Make your changes to JS/CSS files
# 2. Bump version and regenerate manifests
node generate-manifest.js --bump

# 3. Commit and push
git add .
git commit -m "Update: description of changes"
git push
```

### Full Update (Including New PDFs)

```bash
# 1. Add new PDFs to src/documents/
# 2. Generate both manifests
node generate-manifest.js --bump

# 3. Commit and push
git add .
git commit -m "Add new question papers"
git push
```

### Version Bumping

```bash
node generate-manifest.js --bump           # 1.0.0 → 1.0.1 (patch)
node generate-manifest.js --bump --minor   # 1.0.1 → 1.1.0
node generate-manifest.js --bump --major   # 1.1.0 → 2.0.0
```

## File Structure

```
├── code-manifest.json      # Tracks JS/CSS versions
├── content-manifest.json   # Tracks PDF versions
├── generate-manifest.js    # Manifest generator script
├── src/
│   ├── js/
│   │   ├── hotUpdater.js      # Hot code update system
│   │   ├── contentUpdater.js  # PDF update system
│   │   └── app.js             # Main app logic
│   ├── css/
│   │   └── styles.css
│   └── documents/             # PDF files
```

## Development

### Prerequisites

- Node.js
- Rust
- Tauri CLI

### Setup

```bash
# Install dependencies
npm install

# Run in development
npm run tauri dev

# Build for production
npm run tauri build
```

## How Updates Are Stored

- **Code files**: Stored in `localStorage` and loaded on startup
- **PDF files**: Stored in `%APPDATA%/com.sayan.questionary/downloaded_documents/`

## License

MIT