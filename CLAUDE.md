# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**NotasPat** is a browser extension (Chrome + Firefox) that adds sticky note functionality to the Brazilian INSS task portal at `https://atendimento.inss.gov.br/`. It allows workers to attach color-coded notes to protocol numbers with tags, reminders, and templates.

## Development Workflow

**No build system** — vanilla JavaScript with no npm, webpack, or transpilation.

### Loading the extension for development
1. Open `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked" → select `inss-notas-extensao/`

After code changes, click the refresh icon on the extension card at `chrome://extensions/` and reload the INSS portal tab.

### Releasing a new version
1. Increment `version` in `inss-notas-extensao/manifest.json` (and Firefox version too)
2. ZIP the contents of `inss-notas-extensao/` (not the folder itself)
3. Upload ZIP to Chrome Web Store Developer Dashboard
4. See `GUIA-ATUALIZACAO-CHROMESTORE.md` for full release steps

## Codebase Structure

Two parallel builds exist:
- `inss-notas-extensao/` — Chrome (Manifest V3 with service worker)
- `inss-notas-extensao-firefox/` — Firefox (same structure, different manifest)

Key differences between Chrome and Firefox versions:
- Chrome: `"background": { "service_worker": "background/background.js" }`
- Firefox: `"background": { "scripts": ["background/background.js"] }` + `browser_specific_settings.gecko`

### Key files
- [lib/quota.js](inss-notas-extensao/lib/quota.js) — `chrome.storage.sync` quota limits and pre-write size checks; loaded before storage.js everywhere (content script, popup, stdtexts, import) and via `importScripts` in the service worker
- [lib/storage.js](inss-notas-extensao/lib/storage.js) — Notes and standard-texts CRUD across **both** `chrome.storage.sync` and `chrome.storage.local`; loaded first as content script dependency
- [content/content.js](inss-notas-extensao/content/content.js) — DOM injection into INSS portal tables
- [background/background.js](inss-notas-extensao/background/background.js) — Service worker: reminders, alarms, badge count, migration to sync
- [popup/popup.js](inss-notas-extensao/popup/popup.js) — Full popup UI: list, search, filter, edit, templates, export/import

## Architecture

### Storage layer (`lib/storage.js`) — syncs across computers (since v1.4.0)
Notes and standard texts live in `chrome.storage.sync` (syncs between the user's computers via their Google/Firefox account), with `chrome.storage.local` as a **fallback** for whatever doesn't fit sync's hard quotas (100 KB total, 8 KB/item, 512 items, 120 writes/min). Notes use **granular keys** (`note_<protocolo>`) — one entry per note. This replaced the old monolithic `{ notes: {...all notes} }` pattern that caused O(N) serialization on every write.

- `getAllNotes()` / `getNote(protocolo)` / `getNotesForProtocolos(array)` — read **both** namespaces and merge by most-recent `updatedAt`; a note stuck in local fallback is auto-promoted to sync in the background as soon as it fits
- `saveNote()`, `deleteNote()`, `updateNoteColor()`, `updateNoteTags()`, `setNoteReminder()` — write to sync first, confirm, only then remove any local copy (**grava → confirma → remove**, never leave a note nowhere); on quota rejection, the note is saved to local instead and marked `_syncFallback: true`, and the caller gets a typed `QUOTA_EXCEEDED` error (`isQuotaError()`/`err.limitType` from `lib/quota.js`) — the note is *never* silently dropped
- `checkStorageHealth()` — now measured in **sync bytes**, not note count; warns at 70% of the 100 KB sync quota
- `exportNotes()` / `importNotes()` / `countNotes()` / `getNotesWithReminders()` already go through `getAllNotes()`, so they see both namespaces

### Migration to sync (`background/background.js`)
`migrateNotesToSync()` runs on `onInstalled` (with a user notification) and again on every service-worker cold start (silently — MV3 recycles the worker often). It's queued (a `migrateNotesToSync()` wrapper serializes concurrent calls; the real work is in `executarMigracaoParaSync()`) and writes the whole batch of migratable notes in a **single** `chrome.storage.sync.set` (not one write per note — a 60-note user would otherwise blow the 120-writes/min limit on every update). Standard texts are merged by id (not overwritten) **once**, on the first post-upgrade run only, guarded by a `textosPadraoMigrados1_4_0` flag — this must stay one-time, or a text the user deleted after upgrading would keep coming back on every cold start. A one-time `premigracao_1_4_0` snapshot (guarded by `premigracao_1_4_0_criado`, capped at 3 MB, expires after 30 days) is written before any migration for manual recovery — console-only, no UI.

### Content script (`content/content.js`)
- Scans 4 target table IDs for task rows; extracts protocol numbers via regex `/^\d{5,}$/` (5+ digits, no upper bound — PAT protocols grew from 11 to 12 digits) from the 3rd column
- Injects sticky note UI into the 5th column (`Interessado`)
- All injected elements use `.inss-*` CSS class prefix to avoid conflicts
- `MutationObserver` on `#tarefas-container` (fallback: body) with 300ms debounce
- `processingRows` Set prevents race conditions in `processRow()`
- Storage calls wrapped in 5s timeout to prevent page freeze

### Background service worker (`background/background.js`)
- Runs `migrateToGranularStorage()` on install/update (old format → granular) and `migrateNotesToSync()` (see above)
- `setupReminders()` at startup; `chrome.storage.onChanged` listener reconciles alarms against the **merged** sync+local state (`reconciliarAlarmes()`), not per-event old/new values — a note moving from local to sync fires two separate change events for the same protocolo, and comparing each in isolation used to look like a delete and clear the just-created alarm
- `onAlarm` listener fires browser notifications
- Updates badge count (number of notes with active reminders)

### Popup (`popup/popup.js`)
- Pagination: `PAGE_SIZE = 50`, "Load More" button
- Debounced search (300ms) and filter (150ms) to reduce re-renders
- Reactive pattern: Load → Render → Listen (no external state library)

## Important Conventions

- **XSS prevention**: Always use `element.textContent = text` (never `innerHTML` with user data). Use the `escapeHtml()` utility for any display.
- **No external requests**: All data stays in the user's own `chrome.storage.sync`/`chrome.storage.local` (synced via their Google/Firefox account, never sent to any NotasPat server). No analytics, no third-party servers.
- **Console logging**: Use `[NotasPat]` prefix for all `console.log` calls.
- **Sync changes to both browsers**: When modifying shared logic, update both `inss-notas-extensao/` and `inss-notas-extensao-firefox/`. The manifest and background declaration differ; `content.js` also differs (~58 lines: Firefox uses `browser.storage`, a different dropdown/clipboard flow for inserting text into the portal's Draft.js editor) — never blindly overwrite one build's `content.js` with the other's.
- **No automated tests in the shipped extension**: QA is manual, by loading the unpacked extension on the INSS portal. There *is* a manual console-paste test suite under `test/` for the sync feature (`verify-1.4.0-sw.js` in the service-worker console, `verify-1.4.0-ui.js` in the popup console, plus `seed-upgrade-1.3.7.js`/`verify-upgrade-readonly.js` for a real-upgrade smoke test) — none of it ships in the release ZIP. **Never run `NotasPatTest.reset()` (or any suite that calls it) in a profile with real data**: it calls `chrome.storage.sync.clear()`, which wipes sync on every computer signed into that account.
