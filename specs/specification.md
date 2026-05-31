---
title: PDF Compressor — Specification
version: 1.0
author: Hermes
---

# PDF Compressor — Full Specification

## 1. Application Overview

A single-page React application that lets users:
1. **Upload** a PDF file (drag-and-drop or click)
2. **Adjust** target maximum file size via a slider (range: 0.1 MB to the original file size)
3. **Compress** — runs Ghostscript WASM locally in the browser
4. **Download** the compressed PDF

No backend server. No data leaves the browser.

---

## 2. UI / UX Specification

### 2.1 Layout (Desktop-first, mobile-responsive)

```
┌──────────────────────────────────────────────────────────┐
│  🗜 PDF Compressor                                       │
│  Compress PDFs entirely in your browser — private & fast │
│                                                          │
│  ┌──────────────────────────────────────────────────────┐│
│  │                                                      ││
│  │          📄 Drop your PDF here                       ││
│  │               or click to browse                     ││
│  │                                                      ││
│  │     [ Browse Files ]                                 ││
│  │                                                      ││
│  │  Supported: PDF · Max: 200MB                         ││
│  └──────────────────────────────────────────────────────┘│
│                                                          │
│  ┌──────────────────────────────────────────────────────┐│
│  │  filename.pdf  •  12.3 MB                            ││
│  │                                                      ││
│  │  Target size                                        ││
│  │  0.1 MB ──────────────●────────── 12.3 MB           ││
│  │                    3.5 MB                            ││
│  │                                                      ││
│  │  [ ⚡ Compress ]                                     ││
│  └──────────────────────────────────────────────────────┘│
│                                                          │
│  ┌──────────────────────────────────────────────────────┐│
│  │  [Progress bar / status text]                        ││
│  │                                                      ││
│  │  Compressed: filename_compressed.pdf · 3.1 MB        ││
│  │  [ ⬇ Download ]  [ ↻ Compress again ]               ││
│  └──────────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────────┘
```

### 2.2 Color Palette & Typography

**Theme**: Clean, dark-friendly (prefers-color-scheme aware)

| Token | Light | Dark |
|-------|-------|------|
| `--bg-primary` | `#ffffff` | `#0f172a` (slate-900) |
| `--bg-card` | `#f8fafc` (slate-50) | `#1e293b` (slate-800) |
| `--bg-dropzone` | `#f1f5f9` (slate-100) | `#334155` (slate-700) |
| `--border` | `#e2e8f0` (slate-200) | `#475569` (slate-600) |
| `--text-primary` | `#0f172a` (slate-900) | `#f1f5f9` (slate-100) |
| `--text-muted` | `#64748b` (slate-500) | `#94a3b8` (slate-400) |
| `--accent` | `#6366f1` (indigo-500) | `#818cf8` (indigo-400) |
| `--success` | `#22c55e` (green-500) | `#4ade80` (green-400) |
| `--error` | `#ef4444` (red-500) | `#f87171` (red-400) |

**Font**: Inter (system font stack fallback). Weights 400, 500, 600.

**Border radius**: `12px` for cards, `8px` for buttons, `6px` for slider track.

### 2.3 States & Transitions

The page must handle these visual states:

| # | State | What the user sees |
|---|-------|-------------------|
| 1 | **Idle (empty)** | Dropzone, no file loaded |
| 2 | **Idle (file loaded)** | File info + slider + Compress button |
| 3 | **Ghostscript loading** | Info banner on first cold load: "Loading compression engine… (≈5MB)" |
| 4 | **Compressing** | Indeterminate progress bar + "Compressing…" + elapsed time counter |
| 5 | **Complete** | Download button + compressed file info + "Compress again" |
| 6 | **Error** | Error message with details and retry option |

### 2.4 Drag & Drop

- **Drag over**: Dropzone border turns accent color, background gets a subtle overlay
- **Drag leave**: Returns to idle state
- **Drop (valid)**: Accepts file. Max file size: **200MB** (browser memory limit guardrail)
- **Drop (invalid)**: Shows `toast` ("Only PDF files are accepted") for 3 seconds
- **Drop (oversized)**: Shows `toast` ("File too large. Max 200MB.")

### 2.5 The Slider

- Range: **0.1 MB** (minimum) to **file size** (maximum, in MB)
- Step: **0.1 MB**
- The thumb shows the **current value** as a tooltip while dragging
- Slider snaps to the **original file's size** as a reference point marker (non-interactive tick mark below the track)
- Real-time label on the right: "Target: 3.5 MB"

### 2.6 Loading / Ghostscript Boot Sequence

On the **first ever visit** (cold cache):

```
Status banner at the top of the card:
  "⚙️ Loading compression engine… (≈5MB download)"
  [Progress bar showing download of ghostscript.wasm]
```

This download is **one-time**. Subsequent visits load instantly from the Cache API.

While Ghostscript WASM is downloading, the user can still:
- Drop/select a file
- Adjust the slider
- **But cannot click "Compress"** — the button is disabled, shows "Loading engine…" until ready

Once cached, subsequent visits are immediate — no download, no banner.

### 2.7 Compression Progress

Since Ghostscript WASM runs synchronously on the main thread (single-threaded), we cannot show real-time progress from the WASM process itself. Instead:

1. Before starting: `performance.now()` timestamp
2. Run GS WASM (blocking)
3. On completion: show elapsed time as `"Compressed in 2.3s"`

As a UX compromise, show an **indeterminate animated progress bar** during the blocking call, along with `⏳ Compressing… (elapsed: 0s)` — update the elapsed counter every 500ms via a `useRef` + `setInterval` pattern that remains responsive because React batches the re-render cheaply.

### 2.8 Error Handling

| Scenario | User Message |
|----------|-------------|
| File not a valid PDF | `"❌ The selected file doesn't appear to be a valid PDF."` |
| Corrupt / malformed PDF | `"❌ Ghostscript was unable to process this PDF. The file may be corrupted."` |
| Target too aggressive | `"⚠️ The target size may be too small for this PDF. The result will be lower quality."` (warning, not blocking) |
| Output exceeds target | Show actual compressed size with a note: `"The smallest possible size was {n} MB"` |
| WASM init failure | `"❌ Failed to initialize the compression engine. Try refreshing the page."` |
| Memory error | `"❌ Not enough memory to process this file. Try a smaller PDF."` |

---

## 3. Architecture

### 3.1 File Structure

```
pdf-compressor/
├── index.html
├── vite.config.ts
├── tsconfig.json
├── package.json
├── tailwind.config.ts
├── public/
│   ├── manifest.json
│   ├── favicon.svg
│   ├── sw.js                  # Service Worker (registration in main.tsx)
│   └── ghostscript.wasm       # Copied from node_modules at build
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── index.css              # Tailwind directives + CSS vars
│   ├── components/
│   │   ├── Dropzone.tsx
│   │   ├── FileInfo.tsx
│   │   ├── SizeSlider.tsx
│   │   ├── CompressButton.tsx
│   │   ├── ProgressCard.tsx
│   │   ├── ResultCard.tsx
│   │   ├── ErrorBanner.tsx
│   │   └── Toast.tsx
│   ├── hooks/
│   │   ├── useGhostscript.ts   # Load GS WASM, track status
│   │   ├── useCompress.ts      # Orchestrate compression
│   │   └── useElapsedTime.ts   # Tick counter during compression
│   ├── lib/
│   │   ├── ghostscript.ts      # WASM wrapper functions
│   │   └── wasm-cache.ts       # Cache-first WASM loader
│   └── types/
│       └── index.ts            # FileState, CompressState, etc.
└── specs/
    └── specification.md        # This file
```

### 3.2 Data Flow

```
┌──────────┐    File    ┌──────────┐    Slider    ┌────────────┐
│ Dropzone │ ──────────→│   App   │ ←───────────│ SizeSlider │
└──────────┘            │ (state) │              └────────────┘
                        │         │
┌──────────┐            │         │    Click      ┌────────────┐
│ Result   │ ←─────────│         │ ←─────────────│  Compress   │
│ Card     │   result   │         │               │   Button   │
└──────────┘            └─────────┘              └────────────┘
                              │
                              │  useCompress()
                              ▼
                     ┌──────────────────┐
                     │  Ghostscript WASM │
                     │  (in-memory FS)   │
                     └──────────────────┘
```

### 3.3 Ghostscript WASM Integration

Ghostscript WASM (`gs.wasm`) provides a C API compiled to WebAssembly. The browser calls it via:

1. **Load** — `WebAssembly.instantiateStreaming(fetch('/ghostscript.wasm'), imports)`
2. **Init** — Set up in-memory filesystem (Emscripten's MEMFS) — copy input PDF bytes into the virtual FS
3. **Run** — Call `gs.main(['-dNOPAUSE', '-dBATCH', '-sDEVICE=pdfwrite', '-dPDFSETTINGS=/screen', ...])`
4. **Read** — Extract output bytes from MEMFS
5. **Cleanup** — Tear down MEMFS

The `-dPDFSETTINGS` level is dynamically determined by how close to the target size we need to get:

| Target Size vs Original | PDFSETTINGS Pass 1 | Fallback |
|------------------------|-------------------|----------|
| > 70% | `/prepress` | — |
| 40–70% | `/printer` | — |
| 20–40% | `/ebook` | — |
| < 20% | `/screen` | If still > target, do 2nd pass with `/screen` + downscale |

This heuristic gives good first-attempt results without needing a binary search loop (which would be slow client-side).

### 3.4 Ghostscript WASM Caching Strategy

#### 3.4.1 Service Worker

A `public/sw.js` service worker intercepts requests to `/ghostscript.wasm` and implements a **Cache-First** strategy:

```js
self.addEventListener('fetch', (event) => {
  if (event.request.url.includes('ghostscript.wasm')) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        return cached || fetchAndCache(event.request);
      })
    );
  }
});
```

On first visit:
1. SW installs and pre-caches the app shell (`index.html`, `assets/*.js`, `assets/*.css`)
2. On first Compress click, `/ghostscript.wasm` is fetched and cached by the SW
3. Subsequent clicks serve directly from cache — **zero network requests**

#### 3.4.2 Cache Busting

The WASM binary is content-addressed (hash in build output). On upgrade:
- New build produces `ghostscript.<hash>.wasm`
- SW installs new version, old cache entry is evicted
- Zero stale-cache issues

#### 3.4.3 User Experience During Cache

No loading spinner on second+ use. "Compress" is immediately clickable. GS WASM initializes in <100ms from cache.

---

## 4. Component Specifications

### 4.1 `App.tsx` (State Container)

```typescript
interface AppState {
  phase: 'idle' | 'ready' | 'loading-gs' | 'compressing' | 'complete' | 'error';
  file: File | null;
  fileSizeMB: number;
  targetSizeMB: number;
  resultBlob: Blob | null;
  resultSizeMB: number;
  elapsedMs: number;
  errorMessage: string | null;
  gsStatus: 'unloaded' | 'loading' | 'ready' | 'error';
  gsProgress: number; // 0–100, download progress of WASM
}
```

App holds all state. Child components are pure presentational (props down, callbacks up). The `useReducer` pattern manages transitions.

### 4.2 `Dropzone.tsx`

**Props**: `onFileSelected(file: File): void`, `isActive: boolean`

**Behaviour**:
- Renders a bordered dashed rectangle
- Accepts `onDrop` / `onDragOver` / `onDragLeave` / `onClick` -> hidden `<input type="file" accept=".pdf">`
- Visual feedback: border color change on drag over
- Shows a file icon (emoji or SVG) + instruction text
- Max file: 200MB check

### 4.3 `SizeSlider.tsx`

**Props**: `min: number` (0.1), `max: number` (fileSizeMB), `value: number`, `onChange(v: number): void`

**Behaviour**:
- Native `<input type="range">` with custom styling (Tailwind)
- Step: 0.1
- Tooltip showing current value while dragging (CSS `::after` or JS absolute positioned)
- Vertical tick marks at 25%, 50%, 75%, 100%
- Label: `"Target: {value.toFixed(1)} MB"`

### 4.4 `CompressButton.tsx`

**Props**: `disabled: boolean`, `label: string`, `onClick(): void`

Disable states:
- No file loaded → `disabled`, label: `"Select a file first"`
- GS still loading → `disabled`, label: `"Loading engine…"`
- Compressing → `disabled`, label: `"⏳ Compressing…"`
- Error → `disabled`, label: `"Fix error and retry"`
- Ready → `enabled`, label: `"⚡ Compress"`

### 4.5 `ResultCard.tsx`

**Props**: `fileSizeMB: number`, `compressedSizeMB: number`, `compressionRatio: number`, `onDownload(): void`, `onCompressAgain(): void`

Shows:
- ✅ Checkmark icon
- Original size → Compressed size
- Ratio: "Compressed to {ratio}% of original"
- Download button (generates `<a download>` with object URL)
- "Compress again" button (resets state to idle)

### 4.6 `Toast.tsx`

**Props**: `message: string`, `type: 'error' | 'warning' | 'info'`, `duration: number`, `onDismiss(): void`

Auto-dismisses after `duration` ms. Renders fixed-position at top-right.

### 4.7 `ProgressCard.tsx`

**Props**: `elapsedMs: number`, `compressing: boolean`

Shows:
- Animated indeterminate progress bar (CSS animation)
- "⏳ Compressing… (0.0s)" — updates every 500ms

---

## 5. Ghostscript Arguments

The WASM call passes these GS arguments:

```
-dNOPAUSE
-dBATCH
-sDEVICE=pdfwrite
-dCompatibilityLevel=1.7
-sOutputFile=output.pdf
-dPDFSETTINGS=/ebook              # heuristic-selected
-dDownsampleColorImages=true
-dDownsampleGrayImages=true
-dDownsampleMonoImages=true
-dColorImageResolution=150
-dGrayImageResolution=150
-dMonoImageResolution=150
-dAutoRotatePages=/None
-dPrinted=false
-dUseCIEColor
```

The `PDFSETTINGS` and DPI values vary based on target size vs original:

| PDFSETTINGS | Color DPI | Gray DPI | Mono DPI | Typical compression |
|-------------|-----------|----------|----------|---------------------|
| `/prepress` | 300 | 300 | 300 | 80–95% of original |
| `/printer` | 300 | 300 | 300 | 60–80% |
| `/ebook` | 150 | 150 | 300 | 30–60% |
| `/screen` | 72 | 72 | 300 | 10–30% |

### Tier Selection Logic

```typescript
function selectTier(originalBytes: number, targetBytes: number): GSArgs {
  const ratio = targetBytes / originalBytes;
  if (ratio >= 0.8)  return argsFor('/prepress');
  if (ratio >= 0.5)  return argsFor('/printer');
  if (ratio >= 0.2)  return argsFor('/ebook');
  return argsFor('/screen');
}
```

### Binary Search (Fallback, When Single Pass > Target)

If first pass output > target, run a binary search on DPI between 300 (max) and 36 (min), using `/screen` preset, to find the highest DPI that still undershoots the target. Max iterations: 7 (log₂(300/36) ≈ 3 → safety margin 7). Result delivered ≤ target or at minimum DPI.

---

## 6. Edge Cases & Error Handling

| # | Edge Case | Behaviour |
|---|-----------|-----------|
| 1 | File is already very small (< target) | Show "File is already smaller than target" — offer to skip compression |
| 2 | Target set to 0.1 MB | Maximum compression (/screen, 36 DPI binary search if needed) |
| 3 | Target set to exactly file size | Show "That's the same as the original!" — user probably wants to go lower |
| 4 | Target > file size | Clamp slider to file size |
| 5 | Empty PDF (0 bytes) | "❌ The PDF appears to be empty." |
| 6 | Password-protected PDF | "❌ Cannot process password-protected PDFs." |
| 7 | File with 1000+ pages | Warn: "Large file — compression may take a while." Proceed anyway |
| 8 | Mobile browser (small screen) | Responsive layout — single column, full-width dropzone |
| 9 | Safari private mode | SW may not register. GS WASM still works via direct fetch |
| 10 | WASM not supported | Detect via `typeof WebAssembly === 'object'` — show fallback message |
| 11 | Multiple rapid drops | Last file wins. Previous file is discarded |
| 12 | File retaken (choose different) | State resets, new file loaded |

---

## 7. Build & Deployment

### 7.1 Build Commands

```bash
# Development
pnpm install
pnpm run dev

# Production
pnpm run build
# Output: dist/
# Serve: any static file server (nginx, Vercel, Netlify, Cloudflare Pages)
```

### 7.2 Build Output (Vite)

```
dist/
├── index.html
├── assets/
│   ├── index-abc123.js        # App bundle (React + Tailwind)
│   ├── index-abc123.css       # Styles
│   └── ghostscript-abc123.wasm # GS binary (copied at build)
└── manifest.json
```

### 7.3 Bundle Budget

| Asset | Size (gzipped) |
|-------|---------------|
| React + app JS | ~40–60 KB |
| CSS | ~8 KB |
| Ghostscript WASM | **~5 MB** |
| **Total cold visit** | **≈5.1 MB** |
| **Subsequent visits** | **0 KB** ✅ |

The large WASM download is the trade-off for full offline capability.

### 7.4 Deployment Targets

- **Vercel** (recommended): `vercel --prod`. Configure `public/sw.js` as a static asset.
- **Netlify**: Drop `dist/` folder.
- **Cloudflare Pages**: `pnpm run build && wrangler pages deploy dist/`.
- **GitHub Pages**: `pnpm run build && gh-pages -d dist/`.
- **iPhone Shortcut / PWA**: Auto-available via `manifest.json` + SW.

---

## 8. Testing

| Test Type | What |
|-----------|------|
| Unit (Vitest) | Tier selection logic, binary search iteration count, size formatting |
| Component (Vitest + Testing Library) | Dropzone click, drag states, slider values, button disabled states |
| E2E (Playwright) | Full flow: drop PDF → set slider → compress → download → verify result is smaller |
| Manual | 10 real-world PDFs (scanned textbook, text-only, mixed, image-heavy, form, 1 page, 500+ pages) |
| Performance | Time-to-interactive with and without SW cache, WASM init time |

---

## 9. Accessibility

- All inputs have visible labels
- Dropzone has `role="button"` and `tabindex="0"` with Enter/Space handlers
- Slider uses native `<input type="range">` — accessible by default
- Color contrast ratios meet WCAG AA (4.5:1 text, 3:1 large text)
- Error messages have `role="alert"`
- Loading state announced via `aria-live="polite"`
- Focus management: after compression completes, focus moves to Download button

---

## 10. Future Considerations (Not in Scope v1)

- Web Workers for Ghostscript WASM (currently single-threaded; GS compiled with pthreads for multi-thread)
- Batch processing (multiple PDFs)
- Split/merge PDFs
- Image-to-PDF
- PWA install prompt customization
- Chinese / Hebrew / RTL support
- Electron desktop app
