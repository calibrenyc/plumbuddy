# Balance

A safety-first desktop mod manager for The Sims 4, built with Electron, React, TypeScript, and SQLite.

## Run locally

```powershell
npm install
npm run dev
```

Create a production build and launch it:

```powershell
npm run build
npm start
```

## Included in this foundation

- Three-step first-run setup with Windows and OneDrive-aware Mods folder detection
- Persistent folder and behavior settings backed by SQLite
- Responsive desktop shell with Home, Discover, My Mods, Mod Packs, Downloads, Backups, Issues, and Settings
- Recursive `.package`, `.ts4script`, and `.cfg` scanning
- SHA-256 file fingerprints and duplicate detection
- Script-mod folder-depth checks and starter category classification
- Safe ZIP backups that preserve the source folder tree
- Staged ZIP extraction with traversal, symlink, file-count, and expanded-size protections
- Automatic ZIP cleanup only after every supported Sims file installs successfully
- Local, metadata-only mod-pack manifests
- Game launching through known EA/Steam locations with a Steam protocol fallback

## Current boundaries

RAR/7Z extraction, restore, pack switching, hosted share codes, and full mod-site page integrations remain later-phase services. ZIP archives are deleted only after successful extraction; failed or suspicious archives are preserved for review. Installed mod files are never overwritten.
