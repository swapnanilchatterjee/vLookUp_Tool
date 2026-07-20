# VMerge & Concat Studio 🚀

**VMerge & Concat Studio** is a local-first web application designed to merge, concatenate, map, and transform multi-file Excel (`.xlsx`, `.xls`) and CSV datasets directly within the browser.

Built with React 19, TypeScript, and Vite, it operates 100% locally in your browser memory as a high-performance relational joining & row-stacking engine, ensuring absolute data privacy and zero-server data uploads.

---

## Key Features 🌟

### 🔄 Dual Operation Modes
- **Merge Mode (Relational Join)**: Perform sequential relational joins across 2 or more datasets with customizable match keys and join strategies.
- **Concat Mode (Row Stacking)**: Stack rows from multiple datasets sequentially into a single unified dataset with automatic header alignment or custom column remapping.

### 📁 Dynamic N-File Management & Batch Drop
- **Unlimited File Support**: Load 2, 3, 4, or 10+ files simultaneously.
- **Batch Drag & Drop**: Drag and drop 10+ files at once into any drop zone — the app automatically creates slots for `File 1`, `File 2`, ..., `File N`.
- **Batch File Picker**: Browse and select multiple files simultaneously in the native file picker.
- **Dynamic Slot Removal**: Click the circular minus (`-`) button on any additional file card (File 3+) to remove unneeded file slots seamlessly.

### 🔗 Multi-Table Relational Chaining Engine
- **Relational Chaining**: Each secondary dataset can connect to **ANY preceding dataset** in the pipeline (e.g. `File 1 ➔ File 2 ➔ File 3 ➔ File 4`).
- **4-Step Explicit Join Controls**:
  1. Select Base Dataset to connect to.
  2. Select Match Key Column in Base Dataset.
  3. Select Match Key Column in Secondary Dataset.
  4. Select Relational Strategy (`Left Join`, `Inner Join`, `Right Join`, `Full Outer Join`).
- **⚡ Smart Key Auto-Detection**: Auto-detects matching column names (e.g., `user_id` 🔗 `user_id` or `id`) across datasets.
- **Live Relational Flow Diagram**: Visual flowchart displaying table links and join keys in real time.
- **Fuzzy Matching & Clean Match Options**: Supports Levenshtein distance fuzzy string matching with similarity threshold slider (50%–100%), case insensitivity, and whitespace trimming.

### 📊 Field Selection & Schema Mapper
- **Multi-File Column Mapping**: Toggle specific columns for export and rename output headers dynamically per file.
- **Global Action Bar**: One-click `Select All (All Files)` and `Deselect All (All Files)` buttons to manage 10+ file schemas simultaneously.
- **Reactive Header Disambiguation**: Auto-appends file suffixes (e.g. `title_File2`) on load to prevent header collisions, plus a `🪄 Auto-Fix Header Conflicts` button.

### 👁️ Live Output Preview & Range Controls
- **Preview Range Selector**: Select preview row limits (`Top 10`, `Top 25`, `Top 50`, `Top 100`, `Top 250`, `Top 500`, `Top 1,000 (Max Preview)`).
- **DOM Performance Protection**: Capped at a safe maximum of 1,000 rows for in-browser rendering to prevent memory lag when processing millions/crores of records. Full datasets are exported 100% intact on download.
- **🔄 Refresh Table Button**: Manually re-calculate and refresh the live output preview table whenever new connections or schema changes are made.

### 💾 Export & Privacy Protection
- **Multi-Format Export**: Export merged or concatenated datasets as `.csv` or `.xlsx` (Excel).
- **Auto-Wipe Memory Cache**: Automatically clear parsed file memory states upon export, or purge manually using `Wipe App Cache`.
- **Local Sandbox Guarantee**: All data processing runs purely inside client-side JS memory.

---

## Technology Stack 🛠️

- **Frontend**: React 19, TypeScript, Vite
- **Styling**: Vanilla CSS (Custom Design System with Glassmorphism & HSL gradients)
- **Data Engines**:
  - [PapaParse](https://www.papaparse.com/) for fast CSV parsing and unparsing.
  - [SheetJS (xlsx)](https://sheetjs.com/) for binary Excel sheet extraction and workbook generation.
- **Icons**: [Lucide React](https://lucide.dev/)

---

## Getting Started ⚡

### Prerequisites
- [Node.js](https://nodejs.org/) (v18 or higher recommended)
- `npm`

### Local Development
```bash
# 1. Install dependencies
npm install

# 2. Start Vite dev server
npm run dev
```
Open `http://localhost:5173/` in your browser.

### Building for Production
```bash
npm run build
npm run preview
```

---

## Vercel Deployment Sync 🌐

This project includes `vercel.json` pre-configured for instant single-page app (SPA) deployment on Vercel.

### Deploy via Vercel CLI
```bash
# 1. Install Vercel CLI
npm i -g vercel

# 2. Deploy to Vercel
vercel
```

### Deploy via GitHub Repository Integration
1. Push your commits to GitHub:
   ```bash
   git add .
   git commit -m "Feat: Multi-file merge/concat engine, batch drag & drop, and Vercel sync"
   git push origin main
   ```
2. Connect your repository on [Vercel Dashboard](https://vercel.com/new).
3. Vercel will automatically detect `vercel.json` and build the application on every `git push`.

---

## License 📄
MIT License. Built for privacy-first, high-performance data processing.
