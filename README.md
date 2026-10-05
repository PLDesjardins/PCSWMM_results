# PCSWMM Results

MAde by ChatGPT CODEX
A local browser app to extract selected node results from a SWMM/PCSWMM `.rpt` report and export an Excel-compatible CSV. Files are processed on your device; no upload, account, or PCSWMM installation is required to read an existing report.

## Run

**Download the ready-to-use app:** [PCSWMM-results.zip](dist/PCSWMM-results.zip) or [PCSWMM-results.html](dist/PCSWMM-results.html). On the GitHub file page, click **Download raw file**. Extract the ZIP, then open `PCSWMM-results.html` in Chrome, Edge, or Firefox on your PC. No installation is needed. Use **Try a sample report** to check that the app runs before choosing your own report.

For a portable version, run `node build.js`, then open `dist/PCSWMM-results.html` directly in Chrome, Edge, or Firefox. Copy that single HTML file to your PC; it needs no installation or server. Rebuild it after changing the source files.

To refresh the downloadable ZIP after source changes, run `npm run package` (Node.js and Python 3 required). Commit both generated files in `dist/` along with the source changes.

Requires Python 3 to serve the app. From this directory:

```sh
python3 -m http.server 8000 --bind 127.0.0.1
```

Open `http://localhost:8000` in your browser. Stop the server with Ctrl+C. The app needs HTTP serving because it uses JavaScript modules; opening `index.html` directly is unsupported. Node.js 18+ is needed only for tests (or the optional `npm start` shortcut). There are no dependencies to install.

## Use

1. Choose a local `.rpt` simulation report.
2. Paste node IDs, one per line or separated by commas, semicolons, or tabs. Matching is exact and case-sensitive; duplicate IDs are removed while preserving your order.
3. Click **Extract results** to review the table, then **Export CSV**.

Junctions, storage nodes, outfalls, and dividers use the report's **Node Inflow Summary**. Peak flow means **Maximum Total Inflow** (a rate), and total inflow means **Total Inflow Volume** (cumulative volume). These are not lateral inflow, storage maximum outflow, or maximum water depth. The peak time is elapsed simulation time, in days and hours:minutes. Peak flow keeps the report's units. Liter volumes are converted to **m³** in both the table and CSV: divide `ltr` by 1,000, or multiply `10^6 ltr` (million liters) by 1,000. For example, `12.6` in `10^6 ltr` becomes `12600 m³`. Gallon volumes keep their original units (`10^6 gal` means million US gallons). Conversion uses the report's printed precision and cannot recover unreported digits.

Missing IDs appear as **Not found** and are exported with blank values rather than zero. CSV export is disabled if every ID is missing. A sample button provides clearly labeled synthetic data so you can try the workflow.

If extraction cannot run, the app explains why next to the button. Report-reading errors stay visible while you edit node IDs. The extract button is disabled only while a report is being read. If “Starting the app…” stays visible, JavaScript is not running: download the portable HTML file and open it in a regular browser instead of a file preview.

The parser supports the standard English SWMM 5.x summary layout and the six flow units CFS, GPM, MGD, CMS, LPS, and MLD. UTF-8 and legacy Windows-1252 reports are accepted up to 100 MB. Reports without the summary or with unreadable rows/units show an error. Simulation errors found in the report are displayed; check simulation validity before using results. Custom/localized PCSWMM layouts may need additional parser support. Node IDs containing the list separators cannot currently be entered.

## Validation

```sh
node --test
```

Tests cover all node types requested, SI and US units, scientific notation, zeros, Windows line endings, missing nodes, duplicate selection, CSV escaping, and invalid reports. Test fixtures follow EPA SWMM's [`writeNodeFlows` report layout](https://github.com/USEPA/Stormwater-Management-Model/blob/develop/src/solver/statsrpt.c). A real PCSWMM report should also be checked against its original summary before relying on an unfamiliar report format.
