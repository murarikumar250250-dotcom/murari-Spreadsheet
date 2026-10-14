import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { calculateCell, getCellDisplay, numberToColumn, parseCellRef } from './formulas.js';
import './styles.css';

const ROWS = 40;
const COLS = 18;
const STORAGE_KEY = 'gridline-spreadsheet-v1';
const DEFAULT_CELLS = {
  A1: { value: 'Product' }, B1: { value: 'Units' }, C1: { value: 'Price' }, D1: { value: 'Total', bold: true },
  A2: { value: 'Notebook' }, B2: { value: '3' }, C2: { value: '2.5' }, D2: { formula: '=B2*C2', bold: true },
  A3: { value: 'Pen' }, B3: { value: '5' }, C3: { value: '1.2' }, D3: { formula: '=B3*C3', bold: true },
  A4: { value: 'Grand total' }, D4: { formula: '=SUM(D2:D3)', bold: true },
};
const cellRef = (row, col) => `${numberToColumn(col)}${row}`;
const clone = (value) => JSON.parse(JSON.stringify(value));

function readInitial() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return JSON.parse(saved);
  } catch { /* Storage can be disabled; the app still works in memory. */ }
  return { cells: DEFAULT_CELLS, widths: {}, height: 28 };
}

function App() {
  const initial = useMemo(readInitial, []);
  const [cells, setCells] = useState(initial.cells || DEFAULT_CELLS);
  const [widths, setWidths] = useState(initial.widths || {});
  const [rowHeight, setRowHeight] = useState(initial.height || 28);
  const [selected, setSelected] = useState('A1');
  const [anchor, setAnchor] = useState('A1');
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [history, setHistory] = useState([]);
  const [future, setFuture] = useState([]);
  const [notice, setNotice] = useState('Ready');
  const [showHelp, setShowHelp] = useState(false);
  const gridRef = useRef(null);
  const editorRef = useRef(null);
  const fileRef = useRef(null);
  const dragRef = useRef(null);
  const cache = useMemo(() => new Map(), [cells]);

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ cells, widths, height: rowHeight })); }
    catch { setNotice('Browser storage unavailable; changes remain for this session'); }
  }, [cells, widths, rowHeight]);

  const selection = useMemo(() => {
    const a = parseCellRef(anchor); const b = parseCellRef(selected);
    return { r1: Math.min(a.row, b.row), r2: Math.max(a.row, b.row), c1: Math.min(a.col, b.col), c2: Math.max(a.col, b.col) };
  }, [anchor, selected]);
  const selectedCell = cells[selected] || {};
  const selectedInput = selectedCell.formula ?? selectedCell.value ?? '';
  const display = useCallback((ref) => getCellDisplay(cells, ref, cache), [cells, cache]);

  const commit = useCallback((nextCells, message = 'Cell updated') => {
    setHistory((old) => [...old.slice(-99), clone(cells)]);
    setFuture([]);
    setCells(nextCells);
    setNotice(message);
  }, [cells]);

  const writeCell = useCallback((ref, input) => {
    const next = clone(cells);
    const previous = next[ref] || {};
    if (input === '') {
      if (previous.bold || previous.italic || previous.color) next[ref] = { bold: previous.bold, italic: previous.italic, color: previous.color };
      else delete next[ref];
    } else if (String(input).startsWith('=')) {
      next[ref] = { ...previous, formula: String(input), value: undefined };
      delete next[ref].value;
    } else {
      next[ref] = { ...previous, value: String(input) };
      delete next[ref].formula;
    }
    commit(next);
  }, [cells, commit]);

  const beginEdit = useCallback((value = selectedInput) => { setDraft(String(value)); setEditing(true); requestAnimationFrame(() => editorRef.current?.focus()); }, [selectedInput]);
  const finishEdit = useCallback((save = true) => {
    if (save && draft !== String(selectedInput)) writeCell(selected, draft);
    setEditing(false);
  }, [draft, selected, selectedInput, writeCell]);
  const move = useCallback((dr, dc, extend = false) => {
    const pos = parseCellRef(selected);
    const row = Math.max(1, Math.min(ROWS, pos.row + dr));
    const col = Math.max(1, Math.min(COLS, pos.col + dc));
    const next = cellRef(row, col);
    setSelected(next);
    if (!extend) setAnchor(next);
    setEditing(false);
  }, [selected]);

  const selectedRefs = () => {
    const refs = [];
    for (let r = selection.r1; r <= selection.r2; r++) for (let c = selection.c1; c <= selection.c2; c++) refs.push(cellRef(r, c));
    return refs;
  };
  const copySelection = async () => {
    const lines = [];
    for (let r = selection.r1; r <= selection.r2; r++) {
      const line = [];
      for (let c = selection.c1; c <= selection.c2; c++) {
        const ref = cellRef(r, c); const cell = cells[ref] || {};
        line.push(cell.formula ?? cell.value ?? '');
      }
      lines.push(line.join('\t'));
    }
    const text = lines.join('\n');
    try { await navigator.clipboard.writeText(text); setNotice('Copied selection'); }
    catch { window.prompt('Copy these cells:', text); }
  };
  const pasteText = (text) => {
    const rows = String(text).replace(/\r/g, '').split('\n');
    if (rows.length && rows[rows.length - 1] === '') rows.pop();
    const start = parseCellRef(selected); const next = clone(cells);
    rows.forEach((line, ri) => line.split('\t').forEach((value, ci) => {
      const row = start.row + ri; const col = start.col + ci;
      if (row > ROWS || col > COLS) return;
      const ref = cellRef(row, col); const prev = next[ref] || {};
      if (value === '') { delete next[ref]; return; }
      if (value.startsWith('=')) { next[ref] = { ...prev, formula: value }; delete next[ref].value; }
      else { next[ref] = { ...prev, value }; delete next[ref].formula; }
    }));
    commit(next, 'Pasted cells');
  };
  const handleKeyDown = (event) => {
    if (editing) {
      if (event.key === 'Escape') { event.preventDefault(); finishEdit(false); }
      else if (event.key === 'Enter') { event.preventDefault(); finishEdit(true); move(1, 0); }
      else if (event.key === 'Tab') { event.preventDefault(); finishEdit(true); move(0, event.shiftKey ? -1 : 1); }
      return;
    }
    const mod = event.ctrlKey || event.metaKey;
    if (mod && event.key.toLowerCase() === 'z') { event.preventDefault(); undo(); return; }
    if (mod && event.key.toLowerCase() === 'y') { event.preventDefault(); redo(); return; }
    if (mod && event.key.toLowerCase() === 'c') { event.preventDefault(); copySelection(); return; }
    if (mod && event.key.toLowerCase() === 'v') {
      // The browser paste event handles clipboard text below.
      return;
    }
    if (event.key === 'ArrowUp') { event.preventDefault(); move(-1, 0, event.shiftKey); }
    else if (event.key === 'ArrowDown' || event.key === 'Enter') { event.preventDefault(); move(1, 0, event.shiftKey); }
    else if (event.key === 'ArrowLeft') { event.preventDefault(); move(0, -1, event.shiftKey); }
    else if (event.key === 'ArrowRight') { event.preventDefault(); move(0, 1, event.shiftKey); }
    else if (event.key === 'Tab') { event.preventDefault(); move(0, event.shiftKey ? -1 : 1); }
    else if (event.key === 'F2') { event.preventDefault(); beginEdit(); }
    else if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); clearSelection(); }
    else if (event.key === 'Home') { event.preventDefault(); const ref = cellRef(parseCellRef(selected).row, 1); setSelected(ref); if (!event.shiftKey) setAnchor(ref); }
    else if (event.key === 'End') { event.preventDefault(); const ref = cellRef(parseCellRef(selected).row, COLS); setSelected(ref); if (!event.shiftKey) setAnchor(ref); }
    else if (event.key.length === 1 && !mod && !event.altKey) beginEdit(event.key);
  };
  const undo = () => {
    if (!history.length) return setNotice('Nothing to undo');
    setFuture((old) => [...old, clone(cells)]); setCells(history[history.length - 1]); setHistory((old) => old.slice(0, -1)); setNotice('Undo complete'); setEditing(false);
  };
  const redo = () => {
    if (!future.length) return setNotice('Nothing to redo');
    setHistory((old) => [...old, clone(cells)]); setCells(future[future.length - 1]); setFuture((old) => old.slice(0, -1)); setNotice('Redo complete'); setEditing(false);
  };
  const clearSelection = () => {
    const next = clone(cells); selectedRefs().forEach((ref) => { if (next[ref]) { const c = next[ref]; if (c.bold || c.italic || c.color) next[ref] = { bold: c.bold, italic: c.italic, color: c.color }; else delete next[ref]; } });
    commit(next, 'Cleared selected cells');
  };
  const formatSelection = (key, value) => {
    const next = clone(cells); selectedRefs().forEach((ref) => { next[ref] = { ...(next[ref] || {}), [key]: value }; }); commit(next, 'Formatting updated');
  };
  const fillDown = () => {
    if (selection.r2 === selection.r1) return setNotice('Select a range with at least two rows to fill down');
    const next = clone(cells);
    for (let row = selection.r1 + 1; row <= selection.r2; row++) for (let col = selection.c1; col <= selection.c2; col++) {
      const source = next[cellRef(selection.r1, col)]; const destRef = cellRef(row, col);
      if (source) next[destRef] = { ...source };
      else delete next[destRef];
    }
    commit(next, 'Filled selected range down');
  };
  const exportCsv = () => {
    const used = Object.keys(cells).map((ref) => ({ ref, ...parseCellRef(ref) }));
    if (!used.length) return setNotice('Nothing to export');
    const maxRow = Math.max(...used.map((x) => x.row)); const maxCol = Math.max(...used.map((x) => x.col));
    const csv = Array.from({ length: maxRow }, (_, ri) => Array.from({ length: maxCol }, (_, ci) => {
      const ref = cellRef(ri + 1, ci + 1); const value = cells[ref]?.formula ?? cells[ref]?.value ?? '';
      return `"${String(value).replace(/"/g, '""')}"`;
    }).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const link = document.createElement('a'); link.href = url; link.download = 'spreadsheet.csv'; link.click(); URL.revokeObjectURL(url); setNotice('CSV exported');
  };
  const importCsv = (event) => {
    const file = event.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const lines = String(reader.result).replace(/\r/g, '').split('\n'); const next = {};
      lines.forEach((line, ri) => {
        if (ri >= ROWS || !line) return;
        // Supports quoted CSV fields, escaped quotes, and commas inside quoted values.
        const fields = line.match(/("(?:[^"]|"")*"|[^,]*)(?:,|$)/g) || [];
        fields.slice(0, COLS).forEach((field, ci) => {
          let value = field.replace(/,$/, ''); if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1).replace(/""/g, '"');
          if (value !== '') { const ref = cellRef(ri + 1, ci + 1); if (value.startsWith('=')) next[ref] = { formula: value }; else next[ref] = { value }; }
        });
      });
      commit(next, 'CSV imported'); setSelected('A1'); setAnchor('A1');
    };
    reader.readAsText(file); event.target.value = '';
  };
  const resetSheet = () => { if (!window.confirm('Reset the spreadsheet to the starter example?')) return; commit(clone(DEFAULT_CELLS), 'Spreadsheet reset'); setSelected('A1'); setAnchor('A1'); };
  const onPaste = (event) => { if (editing) return; const text = event.clipboardData?.getData('text/plain'); if (text) { event.preventDefault(); pasteText(text); } };
  const resizeStart = (event, col) => { event.preventDefault(); dragRef.current = { x: event.clientX, col, width: widths[col] || 116 }; const onMove = (e) => { if (!dragRef.current) return; const diff = e.clientX - dragRef.current.x; setWidths((old) => ({ ...old, [col]: Math.max(64, Math.min(360, dragRef.current.width + diff)) })); }; const onUp = () => { dragRef.current = null; window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); }; window.addEventListener('pointermove', onMove); window.addEventListener('pointerup', onUp); };

  const formulaError = selectedInput && String(selectedInput).startsWith('=') ? (() => { try { calculateCell(cells, selected, new Set(), new Map()); return ''; } catch (e) { return e.message; } })() : '';

  return <main className="app-shell" onKeyDown={handleKeyDown} onPaste={onPaste}>
    <header className="topbar">
      <div className="brand-mark">▦</div><div className="brand-copy"><div className="brand-title">Gridline <span>Spreadsheet</span></div><div className="file-subtitle">Untitled spreadsheet <span className="saved-dot" title="Autosave enabled" /></div></div>
      <div className="top-actions"><span className="autosave"><span className="save-icon">✓</span> Saved locally</span><button className="icon-button" title="Help" onClick={() => setShowHelp(!showHelp)}>?</button><button className="share-button" onClick={exportCsv}>Export CSV ↗</button></div>
    </header>
    <nav className="menu-bar" aria-label="Spreadsheet actions">
      <button onClick={undo} disabled={!history.length} title="Ctrl/Cmd+Z">↶ <span>Undo</span></button><button onClick={redo} disabled={!future.length} title="Ctrl/Cmd+Y">↷ <span>Redo</span></button><i />
      <button onClick={() => beginEdit()} title="Edit selected cell">✎ <span>Edit</span></button><button onClick={clearSelection} title="Delete selected cell contents">⌫ <span>Clear</span></button><i />
      <button onClick={copySelection} title="Copy selected range">▣ <span>Copy</span></button><button onClick={fillDown} title="Fill selected range with top row">↓ <span>Fill down</span></button><i />
      <button onClick={() => fileRef.current?.click()}>⇧ <span>Import CSV</span></button><button onClick={resetSheet} className="reset-action">⟲ <span>Reset</span></button><input ref={fileRef} type="file" accept=".csv,text/csv" hidden onChange={importCsv}/>
    </nav>
    {showHelp && <div className="help-panel"><strong>Quick guide</strong><span>Click or type to edit · Enter/Tab to commit and move · F2 to edit · Delete to clear · Ctrl/Cmd+Z undo · Select a range by dragging cells · Resize columns by dragging their right edge.</span><button onClick={() => setShowHelp(false)}>Got it</button></div>}
    <section className="formula-toolbar">
      <div className="name-box"><span>{selected}</span><span className="chevron">⌄</span></div><div className="fx-mark">ƒx</div>
      <input aria-label="Formula bar" className="formula-input" value={editing ? draft : String(selectedInput)} onChange={(e) => { setDraft(e.target.value); setEditing(true); }} onFocus={() => { if (!editing) setDraft(String(selectedInput)); }} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (editing) finishEdit(true); move(1, 0); gridRef.current?.focus(); } if (e.key === 'Escape') { setEditing(false); gridRef.current?.focus(); } }} placeholder="Enter a value or formula (e.g. =SUM(A1:A5))" />
      <button className="formula-apply" onClick={() => { writeCell(selected, editing ? draft : String(selectedInput)); setEditing(false); gridRef.current?.focus(); }}>✓</button>
    </section>
    <section className="format-toolbar" aria-label="Formatting">
      <button className={selectedCell.bold ? 'format-active' : ''} onClick={() => formatSelection('bold', !selectedCell.bold)} title="Bold"><b>B</b></button><button className={selectedCell.italic ? 'format-active' : ''} onClick={() => formatSelection('italic', !selectedCell.italic)} title="Italic"><i>I</i></button><span className="toolbar-divider"/><label className="color-label" title="Text color">A <input type="color" value={selectedCell.color || '#202b3c'} onChange={(e) => formatSelection('color', e.target.value)} /></label><span className="toolbar-divider"/><span className="format-hint">Formatting applies to selected cells</span>
    </section>
    <section className="grid-wrap">
      <div className="grid-scroll" ref={gridRef} tabIndex={0} aria-label="Spreadsheet grid. Use arrow keys to navigate." onMouseDown={(e) => { if (e.target === gridRef.current) gridRef.current.focus(); }}>
        <table className="sheet-grid"><colgroup><col className="row-number-col"/><col span={COLS} /></colgroup><thead><tr><th className="corner-cell">⌘</th>{Array.from({ length: COLS }, (_, i) => i + 1).map((col) => <th key={col} className={parseCellRef(selected).col === col ? 'header-selected' : ''} style={{ width: widths[col] || 116, minWidth: widths[col] || 116 }}><span>{numberToColumn(col)}</span><div className="resize-handle" onPointerDown={(e) => resizeStart(e, col)} /></th>)}</tr></thead>
          <tbody>{Array.from({ length: ROWS }, (_, rowIndex) => rowIndex + 1).map((row) => <tr key={row} style={{ height: rowHeight }}><th className={parseCellRef(selected).row === row ? 'header-selected row-head' : 'row-head'}>{row}</th>{Array.from({ length: COLS }, (_, colIndex) => colIndex + 1).map((col) => {
            const ref = cellRef(row, col); const cell = cells[ref] || {}; const isSelected = ref === selected; const isInRange = row >= selection.r1 && row <= selection.r2 && col >= selection.c1 && col <= selection.c2; const value = display(ref); const isError = typeof value === 'string' && value.startsWith('#ERROR:');
            return <td key={ref} data-cell={ref} className={`${isSelected ? 'cell-selected' : ''} ${isInRange && !isSelected ? 'cell-in-range' : ''} ${isError ? 'cell-error' : ''}`} style={{ width: widths[col] || 116, minWidth: widths[col] || 116, fontWeight: cell.bold ? 700 : 400, fontStyle: cell.italic ? 'italic' : 'normal', color: cell.color || undefined }} onMouseDown={(e) => { if (e.button !== 0) return; if (e.shiftKey) setSelected(ref); else { setSelected(ref); setAnchor(ref); } gridRef.current?.focus(); }} onMouseEnter={(e) => { if (e.buttons === 1 && !editing) setSelected(ref); }} onDoubleClick={() => beginEdit(cell.formula ?? cell.value ?? '')}>
              {isSelected && editing ? <input ref={editorRef} className="cell-editor" value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={() => finishEdit(true)} onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); finishEdit(true); move(1, 0); } else if (e.key === 'Tab') { e.preventDefault(); finishEdit(true); move(0, e.shiftKey ? -1 : 1); } else if (e.key === 'Escape') { e.preventDefault(); finishEdit(false); } }} /> : <span title={isError ? value : undefined}>{value === '' ? '' : String(value)}</span>}
              {isSelected && !editing && <span className="fill-handle" title="Fill handle" onMouseDown={(e) => { e.stopPropagation(); const start = parseCellRef(selected); const next = clone(cells); const base = next[selected]; if (!base) return; const target = window.prompt('Fill down how many rows?', '3'); const count = Number(target); if (!Number.isInteger(count) || count < 1 || start.row + count > ROWS) return; for (let n = 1; n <= count; n++) next[cellRef(start.row + n, start.col)] = { ...base }; commit(next, 'Filled cells'); }} />}
            </td>;
          })}</tr>)}</tbody>
        </table>
      </div>
    </section>
    <footer className="statusbar"><div className="sheet-tab"><span className="sheet-tab-icon">▦</span> Sheet1 <span className="tab-menu">⌄</span></div><div className="status-info"><span className="status-dot"/>{notice}{formulaError && <span className="error-note">Formula error: {formulaError}</span>}</div><div className="status-right"><span>{selectedRefs().length > 1 ? `${selectedRefs().length} cells selected` : selected}</span><span className="zoom">100%　⌄</span></div></footer>
  </main>;
}

createRoot(document.getElementById('root')).render(<React.StrictMode><App /></React.StrictMode>);
