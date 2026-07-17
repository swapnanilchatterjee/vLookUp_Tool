# VMerge Studio 🚀

**VMerge Studio** is a premium, client-side web application designed to merge, map, and transform Excel (.xlsx, .xls) and CSV datasets directly within the browser. 

Using custom styling, glassmorphism aesthetics, and client-side processing, this tool functions as a local relational database engine, ensuring 100% data privacy and security.

---

## Key Features 🌟

*   **Zero-Server Upload Sandbox**: All calculations and merges occur locally in your browser memory. Data never leaves your machine.
*   **Dual File Format Support**: Effortlessly upload, parse, and match CSV, XLSX, and XLS file formats simultaneously.
*   **Composite Multi-Key Joins**: Match rows based on multiple matching key conditions (e.g. matching `First Name` AND `Last Name` AND `Zip Code` simultaneously).
*   **Fuzzy Jaro-Winkler/Levenshtein Matching**: Match fields with typos or minor spelling differences (e.g., matching `"Google Inc"` with `"Gogle Inc"`). Includes an interactive slider to customize the similarity threshold (from 50% to 100% match).
*   **Flexible Relational Joins**: Supports four join strategies:
    *   *Left Join*: Keeps all primary records and matches lookup data (Standard VLookup behavior).
    *   *Inner Join*: Restricts output to intersecting matches.
    *   *Right Join*: Retains all lookup records with matching primary rows.
    *   *Full Outer Join*: Output all records from both datasets.
*   **Advanced Header Sanitization**: Corrects malformed files by trimming trailing whitespaces, auto-generating column names for blank headers (`Column_1`, `Column_2`), and auto-suffixing duplicate header inputs (e.g. `Age`, `Age_2`) to prevent data loss.
*   **Robust Collision & Blank Prevention**: Detects duplicate header names in real-time and blocks exports if output columns are renamed to empty blank values.
*   **Case-Sensitivity & Whitespace Trimming Options**: Cleans messy data on-the-fly for successful key pairing.
*   **Live Output Preview & Row Count**: Interactive grid displays the first 10 rows of matched records dynamically.
*   **Auto-Purge Memory Cache**: Instantly clear parsed file data from React states automatically upon downloading the merged file, or wipe it manually with the "Wipe App Cache" button.

---

## Technology Stack 🛠️

1.  **Frontend Framework**: React 19 + TypeScript (initialized via Vite)
2.  **Styles**: Custom CSS Grid & Flexbox, featuring dark/ambient gradients, card styles, and animations.
3.  **Parsing Engines**:
    *   [PapaParse](https://www.papaparse.com/) for fast, robust CSV string chunking and unparsing.
    *   [SheetJS (xlsx)](https://sheetjs.com/) for binary Excel sheet extraction and worksheet generation.
4.  **Icons**: [Lucide React](https://lucide.dev/) for clean vector symbols.

---

## Architecture & Code Map 📂

*   `src/index.css`: Global design tokens, dark theme color variables, body backgrounds, utility wrappers, custom scrollbars, and keyframe animations.
*   `src/App.css`: Page-specific layouts, drop-zone hover behaviors, stat grids, input outlines, table preview styles, and loaders.
*   `src/App.tsx`: Main React component. It manages:
    *   File drag/drop validation and FileReader buffer handlers.
    *   Header sanitization and 2D array parsing pipelines.
    *   Schema mapping structures with default collision suffixes.
    *   The index-based relational join algorithm inside a debounced React hook (supporting composite indexes and fuzzy string matching).
    *   CSV/Excel export packaging and memory state resets.

---

## How to Get Started ⚡

### Prerequisites
Make sure you have Node.js and npm installed on your system.

### Installation
1. Clone or copy the folder contents to your directory:
   ```bash
   cd Vlookup_tool
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the Vite development server:
   ```bash
   npm run dev
   ```
   Open your browser and navigate to the local address displayed in your terminal (usually `http://localhost:5173`).

### Production Build
To build and preview the optimized output assets:
```bash
npm run build
npm run preview
```

---

## Relational Join Engine Internals ⚙️

The application uses an efficient, indexed map-join mechanism:
1.  **2D Array Parsing Pipeline**:
    To prevent data loss from duplicate headers (where direct JSON parsing overwrites duplicate keys), the application parses files into 2D arrays. Headers are passed through `sanitizeHeaders` (trimming, filling blanks, renaming duplicates), and rows are mapped to unique key-value objects.
2.  **Composite Index Matching**:
    If fuzzy matching is disabled, the join engine uses a high-performance hash-index strategy. Columns are combined into a compound key (e.g. `val1|||val2|||val3`) to lookup matches in $O(N + M)$ time complexity.
3.  **Fuzzy String Distance Engine**:
    If fuzzy matching is enabled, the primary key comparison falls back to an optimized Levenshtein distance similarity index. It checks key pairs cell-by-cell and matches rows when they score above the user-defined slider threshold.
4.  **Cartesian Matches**:
    When duplicate keys match, they result in full SQL-style Cartesian matches for that key. Unmatched rows are padded with empty strings according to the chosen join strategy.
5.  **Automated Cache Purge**:
    Since browser state holds raw file datasets, selecting the **Auto-wipe memory cache** checkbox sets a delay to purge states `fileA`, `fileB`, `joinedData`, and input refs, completely sanitizing the browser sandbox.

---

## License 📄
Distributed under the MIT License. Built with ❤️ for high-performance data operations.
