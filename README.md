# PDF Compressor — 100% Client-Side

A privacy-first, zero-server PDF compression tool. All processing happens in the browser via Ghostscript compiled to WebAssembly. No files are ever uploaded to any server.

## Motivation

- **Privacy**: PDFs never leave your machine
- **Speed**: No network round-trips
- **Availability**: Works offline after first load (Ghostscript WASM is cached)
- **Cost**: Free — your CPU does the work

## Tech Stack

| Layer | Choice | Why |
|-------|--------|-----|
| Framework | React 18+ (Vite) | Fast dev, fast builds |
| PDF Engine | Ghostscript WASM | Battle-tested, AGPL |
| Styling | Tailwind CSS v4 | Utility-first, fast iteration |
| State | React hooks + useReducer | Simple, no external deps |
| Caching | Service Worker + Cache API | Offline + instant reloads |

## Core Performance Requirements

- **First load (cold)**: Download ~5MB Ghostscript WASM gzipped + ~200KB app bundle
- **Subsequent loads**: Instant — all assets served from Cache API
- **Compression**: A 30-page scanned textbook from ~30MB → ~3-5MB in under 30 seconds on a modern laptop
- **Memory**: WASM heap ~100-200MB during compression, freed after

