# Gridline — Mini Spreadsheet

A browser-based mini spreadsheet built with React and JavaScript for the Frontend Developer Take-Home Assignment. It has no backend; spreadsheet contents persist in browser `localStorage`.

## Requirements

- Node.js 20.19+ or 22.12+ (recommended for current Vite releases)
- VS Code (recommended editor)

## Run locally in VS Code

1. Extract the project ZIP.
2. Open the `mini-spreadsheet` folder in VS Code (`File → Open Folder`).
3. Open **Terminal → New Terminal**.
4. Install dependencies:

   ```bash
   npm install
   ```

5. Start the development server:

   ```bash
   npm run dev
   ```

6. Open the local URL printed in the terminal (usually `http://localhost:5173`). Keep the terminal running while you use the app.

## Commands

```bash
npm run dev      # start local development server
npm test         # run formula-engine tests
npm run build    # create production build in dist/
npm run preview  # preview production build locally after building
```

## Features implemented

### Required assignment features

- Labeled rows and columns; 40 rows × 18 columns in the starter grid.
- Click to select cells, double-click or type to edit, plus formula bar.
- Arrow-key navigation, Enter, Tab, Shift+Tab, F2, Delete/Backspace, Home/End, and Shift+arrow range extension.
- Copy/paste single cells and tab/newline-delimited ranges; paste from external spreadsheets when clipboard access is available.
- Arithmetic formulas (`+`, `-`, `*`, `/`, parentheses, unary signs), cell references, and `SUM`, `MIN`, `MAX`, `AVERAGE` functions with ranges.
- Dependent formulas are recalculated from the current cell model. Circular references, invalid formulas, non-numeric references, and division by zero show errors rather than looping forever.
- Undo/redo, clear selected cells, and separate formula source from computed display value.
- Autosave to localStorage, restore after refresh, and reset to starter data.
- Responsive layout and basic error/empty states.

### Optional enhancements

- Range selection by dragging and Shift+arrow; range copy/paste.
- `MIN`, `MAX`, and `AVERAGE` range functions.
- Column resizing by dragging the column-header edge.
- Basic bold, italic, and text color formatting.
- Fill-down for selected ranges and a simple single-cell fill handle.
- CSV import/export.
- Formula calculation tests and an explanatory recursive recalculation strategy.

## State model and recalculation

The `cells` object is keyed by A1-style references. A regular cell stores a `value`; a formula cell stores the original formula string in `formula`. Formatting flags live on the same cell object. `widths` and `rowHeight` store layout preferences. A snapshot history stack powers undo and redo. The app writes the current cell map and layout to localStorage after changes.

The formula engine in `src/formulas.js` uses a small recursive-descent parser rather than JavaScript `eval`. It resolves cell references recursively, expands ranges, and calculates functions. A recursion stack detects cycles; a per-render cache avoids recalculating the same formula repeatedly while rendering. Because values are calculated from the current model, changing a referenced cell updates dependent formula displays on the next render.

## Tests

`tests/formulas.test.js` covers arithmetic precedence, aggregate functions, ranges, column labels, dependent calculations, circular references, malformed formulas, and division by zero. Run with `npm test`.

## Known limitations / next improvements

- The grid is fixed to 40 × 18 cells; virtualization is not needed at this size and is not implemented.
- Range paste preserves formula text as entered; it does not translate relative references like a production spreadsheet.
- CSV import supports common quoted values but is intentionally lightweight, not a full RFC 4180 parser.
- Formatting is limited to bold, italic, and text color; there is no formula autocomplete, merged cells, multiple sheets, or robust range-aware fill formula translation.
- Undo/redo is in-memory and does not persist across page refreshes.
- Browser clipboard permissions vary; copy falls back to a prompt if clipboard writing is unavailable.
- This is a frontend assignment starter implementation, not a complete replacement for a commercial spreadsheet.

## Submission checklist

- [ ] Push source to a GitHub repository.
- [ ] Run `npm test` and `npm run build`.
- [ ] Record a short demo showing editing, keyboard navigation, formulas, undo/redo, and persistence.
- [ ] Add your GitHub URL and demo URL/video to your project notes.
- [ ] Submit before **15 October 2026, 9:00 PM IST**.
