# Textos Padrao - Design Spec

**Date:** 2026-03-23
**Target Version:** 1.3.5 (current: 1.3.4)
**Status:** Approved

## Overview

"Textos Padrao" is a standard text bank feature for the NotasPat browser extension. Users create titled text entries (minimum 30 characters) that can be injected into Draft.js editor fields on the INSS portal (`https://atendimento.inss.gov.br/`). The feature spans four layers: storage, content script injection, popup management, and a dedicated full-page manager.

## Target Fields

Three Draft.js rich text editors on the INSS portal:

1. **Despacho (task dispatch)** - modal `#modal-despacho-container`
2. **Despacho para atribuir status/exigencia** - modal `#modal-despacho-exigencia-container`
3. **Despacho de conclusao** - modal `#modal-despacho-conclusao-container`

All three share the same DOM structure:

```html
<div class="public-DraftEditor-content" contenteditable="true" role="textbox">
```

**Selector:** `.public-DraftEditor-content[contenteditable="true"]`

## Section 1: Storage

### Data Structure

Standard texts are stored under a single key `standard_texts` in `chrome.storage.local`:

```json
{
  "standard_texts": [
    {
      "id": "st_1679587200000_a3x7k",
      "title": "Despacho padrao de exigencia",
      "text": "Senhor(a) segurado(a), para dar andamento...",
      "createdAt": "2026-03-23T10:00:00.000Z",
      "updatedAt": "2026-03-23T10:00:00.000Z"
    }
  ]
}
```

- **id**: `"st_" + Date.now() + "_" + Math.random().toString(36).substring(2, 7)` (unique identifier, random suffix prevents collisions on rapid creation)
- **title**: User-defined title (required, non-empty after trim, max 100 characters)
- **text**: Plain text content (minimum 30 characters after trim)
- **createdAt / updatedAt**: ISO date strings

**Why a single key instead of granular keys:** Unlike notes (which can number in the thousands and caused O(N) serialization problems), standard texts are expected to remain under ~100 entries. The single-key pattern is simpler for an ordered array and avoids the complexity of managing individual keys for a small, bounded dataset. A `checkStandardTextsHealth()` function warns if the count exceeds 200.

### New Functions in `lib/storage.js`

```javascript
function getStandardTexts()                       // Returns Promise<Array> (returns [] if key absent)
function saveStandardText(title, text)            // Creates new entry, returns Promise<Object>
function updateStandardText(id, title, text)      // Updates existing entry, returns Promise<Object>
function deleteStandardText(id)                   // Removes entry, returns Promise<boolean>
function exportStandardTexts()                    // Returns Promise<string> (JSON)
function importStandardTexts(jsonString, replace) // Merge or replace, returns Promise<Array>
function checkStandardTextsHealth()               // Returns Promise<{ok, count, warning}>
```

`getStandardTexts()` defensively returns `[]` when the `standard_texts` key does not exist in storage. This handles both fresh installs and upgrades from versions before this feature.

All functions follow the existing Promise-based pattern with `chrome.runtime.lastError` handling.

### Validation Rules

- Title: required, non-empty after trim, max 100 characters
- Text: minimum 30 characters after trim
- Both validated at storage layer (functions throw on invalid input)

### Import Merge Strategy

- **Replace mode** (`replace=true`): Deletes all existing texts, imports all entries with their original IDs
- **Merge mode** (`replace=false`): Appends all imported entries with fresh IDs (`st_` + Date.now() + random suffix + index offset) to avoid collisions with existing entries. This ensures imported texts never overwrite locally modified versions.
- **Validation**: The `type` field in the JSON must equal `"standard_texts"`. If the file has `type: "notes"` or no type field, reject with an error message ("Arquivo nao e um export de textos padrao").

### Soft Limits

- Warn at 200 standard texts via `checkStandardTextsHealth()`
- No hard cap enforced, but the single-key storage pattern is designed for <500 entries

## Section 2: Content Script (Floating Button + Dropdown)

### Detection

The existing `MutationObserver` in `content.js` (which watches `#tarefas-container` or `body`) is extended to also detect Draft.js editor fields. When a `.public-DraftEditor-content[contenteditable="true"]` element appears in the DOM, a floating button is injected nearby.

### Floating Button

- **Position**: Absolutely positioned at the top-right corner of the editor's parent container (`.DraftEditor-root` or closest positioned ancestor)
- **Appearance**: Small icon button with clipboard/text icon, styled with `.inss-stdtext-*` CSS prefix
- **One button per editor**: Each detected editor gets its own button (tracked via a data attribute `data-stdtext-injected` to avoid duplicates)
- **z-index**: `1000` (same level as existing note color popups, below portal modal overlays)

### Dropdown

Clicking the floating button opens a dropdown panel below/beside the button:

- **Search field**: Text input with real-time filtering (150ms debounce) by title and text content
- **List of texts**: Shows title + first ~60 chars of text as preview
- **Click to insert**: Clicking a text entry inserts it into the associated editor (with confirmation if editor already has content, see below)
- **Empty state**: "Nenhum texto padrao cadastrado" with hint to manage texts via the extension popup
- **Open manager link**: Sends `chrome.runtime.sendMessage({action: 'openStdTextsPage'})` to background, which handles `chrome.tabs.create`
- **Close behavior**: Closes on click outside, Escape key, or after successful insertion
- **z-index**: `1001` (above floating button, below extension confirm overlays at `10001`)

### Text Injection into Draft.js

Draft.js maintains internal state separate from the DOM. Direct DOM manipulation (`innerHTML`, `textContent`) breaks state synchronization. The correct approach:

```javascript
function insertTextIntoDraftEditor(editorElement, text) {
  // Check if editor already has content
  const currentText = editorElement.textContent.trim();
  if (currentText.length > 0) {
    // Show confirmation: "O editor ja contem texto. Substituir pelo texto padrao?"
    // Only proceed if user confirms
  }
  editorElement.focus();
  document.execCommand('selectAll', false, null);
  const success = document.execCommand('insertText', false, text);
  if (!success) {
    // Fallback: dispatch InputEvent
    editorElement.dispatchEvent(new InputEvent('beforeinput', {
      inputType: 'insertText', data: text, bubbles: true, cancelable: true
    }));
  }
}
```

This uses `execCommand` which Draft.js intercepts, keeping its internal state synchronized. The `selectAll` + `insertText` sequence replaces all existing content (approved design choice: replace mode, not append).

**Confirmation before overwrite**: If the editor already contains text (non-empty `textContent`), a confirmation dialog is shown: "O editor ja contem texto. Substituir pelo texto padrao?" with Cancel/Substituir buttons. This prevents accidental loss of partially typed despachos.

### Cache

- Standard texts are loaded from storage once when first needed and cached in a module-level variable
- The existing `chrome.storage.onChanged` listener in `content.js` (which handles theme changes) is extended with an additional condition for the `standard_texts` key to invalidate the cache

### CSS

All injected styles use the `.inss-stdtext-*` prefix to avoid conflicts with the INSS portal. Styles are added to `content/content.css`.

## Section 3: Popup Integration

### HTML Structure

In `popup/popup.html`, a new section is added after the existing actions area:

```html
<!-- Inside the main container, after existing action buttons -->
<div id="stdTextsSection" class="section-stdtexts">
  <button id="btnStdTexts" class="action-btn" title="Textos Padrao">
    Textos Padrao
  </button>
</div>

<!-- Panel (hidden by default, shown when btnStdTexts is clicked) -->
<div id="stdTextsPanel" class="stdtexts-panel" style="display: none;">
  <div class="stdtexts-header">
    <h3>Textos Padrao</h3>
    <input type="text" id="stdTextsSearch" placeholder="Buscar texto...">
  </div>
  <div id="stdTextsList" class="stdtexts-list"></div>
  <div class="stdtexts-actions">
    <button id="btnAddStdText" class="btn-primary">Novo Texto</button>
    <button id="btnOpenStdTextsPage" class="btn-secondary">Gerenciar em pagina dedicada</button>
  </div>
  <!-- Inline form for add/edit (hidden by default) -->
  <div id="stdTextsForm" class="stdtexts-form" style="display: none;">
    <input type="text" id="stdTextTitle" placeholder="Titulo" maxlength="100">
    <textarea id="stdTextContent" placeholder="Conteudo (min. 30 caracteres)" rows="5"></textarea>
    <div class="stdtexts-form-footer">
      <span id="stdTextCharCount">0 caracteres</span>
      <div>
        <button id="btnSaveStdText" class="btn-primary">Salvar</button>
        <button id="btnCancelStdText" class="btn-secondary">Cancelar</button>
      </div>
    </div>
  </div>
</div>
```

The panel toggles visibility inline within the popup (collapsible section pattern, not a modal). The "Gerenciar em pagina dedicada" button opens the dedicated page via `chrome.tabs.create`.

### UI Behavior

- Standard texts section uses the same reactive pattern as the rest of the popup: Load -> Render -> Listen
- Search/filter with debounce (300ms, matching existing pattern)
- No pagination needed (standard texts are expected to be fewer than notes)
- Each text item in the list shows: title, character count, edit/delete action buttons
- Delete action shows confirmation prompt before removal

## Section 4: Dedicated Page (`stdtexts/`)

### Structure

A standalone HTML page similar to the import page (`import/import.html`):

- **File**: `stdtexts/stdtexts.html`
- **Styles**: `stdtexts/stdtexts.css`
- **Logic**: `stdtexts/stdtexts.js`
- **Loads**: `../lib/storage.js` for storage functions

### Features

- Full CRUD interface with more space than the popup
- **Search bar**: Real-time filtering by title and text content (300ms debounce)
- **Text form**: Title input (max 100 chars) + large textarea with character counter (min 30 chars)
- **Text list**: Cards showing title, preview, character count, created/updated dates
- **Edit**: Inline editing (click to edit a card)
- **Delete**: With confirmation
- **Export**: Downloads `textos-padrao.json`
- **Import**: File dialog with merge/replace options (same pattern as notes import)

### Design

- Same visual language as `import/import.html` (centered card, gradient header, dark mode support via `prefers-color-scheme`)
- Responsive layout, wider max-width than import page to accommodate text editing (~600px)
- Accessible via `chrome.runtime.getURL('stdtexts/stdtexts.html')` opened in a new tab

### Export/Import Format

```json
{
  "version": "1.0",
  "type": "standard_texts",
  "exportDate": "2026-03-23T10:00:00.000Z",
  "texts": [
    {
      "id": "st_1679587200000_a3x7k",
      "title": "...",
      "text": "...",
      "createdAt": "...",
      "updatedAt": "..."
    }
  ]
}
```

The `type: "standard_texts"` field distinguishes this from notes exports.

## Section 5: File Structure

### New Files (3)

| File | Purpose |
|------|---------|
| `stdtexts/stdtexts.html` | Dedicated management page |
| `stdtexts/stdtexts.css` | Styles for dedicated page |
| `stdtexts/stdtexts.js` | Logic for dedicated page |

### Modified Files (8)

| File | Changes |
|------|---------|
| `lib/storage.js` | Add 7 standard text functions (CRUD, export/import, health check) |
| `content/content.js` | Add floating button, dropdown, Draft.js injection, cache, confirmation dialog |
| `content/content.css` | Add `.inss-stdtext-*` styles for floating button, dropdown, and confirmation |
| `popup/popup.js` | Add "Textos Padrao" section with inline CRUD |
| `popup/popup.html` | Add button, panel, form markup for standard texts |
| `popup/popup.css` | Add styles for standard texts section, form, and list within popup |
| `background/background.js` | Add `openStdTextsPage` message handler; initialize `standard_texts: []` on install |
| `manifest.json` | Version bump to 1.3.5 |

### Cross-Browser

All changes apply identically to both `inss-notas-extensao/` (Chrome) and `inss-notas-extensao-firefox/` (Firefox). The only difference remains in `manifest.json` (service worker vs background scripts, gecko settings).

## Constraints

- **No external requests**: All data stays in `chrome.storage.local`
- **XSS prevention**: Use `textContent` for user data display, `escapeHtml()` utility for any HTML context
- **Console logging**: `[NotasPat]` prefix for all logs
- **No build system**: Vanilla JavaScript, no npm/webpack/transpilation
- **Min text length**: 30 characters (matches the portal's own minimum for despacho fields)
- **Max title length**: 100 characters
- **Soft limit**: Warn at 200 standard texts
- **Overwrite confirmation**: Always confirm before replacing existing editor content
- **`execCommand` deprecation**: While technically deprecated, `execCommand` remains the only reliable way to interact with Draft.js editors without access to their React component instances. All major browsers still support it. If `execCommand('insertText')` returns `false`, fallback to `InputEvent` dispatch.
