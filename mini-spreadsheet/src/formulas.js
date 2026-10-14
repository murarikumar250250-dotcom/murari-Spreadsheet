const CELL_RE = /^([A-Z]+)([1-9]\d*)$/i;

export function columnToNumber(label) {
  let value = 0;
  for (const char of label.toUpperCase()) value = value * 26 + char.charCodeAt(0) - 64;
  return value;
}

export function numberToColumn(number) {
  let result = '';
  while (number > 0) {
    const remainder = (number - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    number = Math.floor((number - 1) / 26);
  }
  return result;
}

export function parseCellRef(ref) {
  const match = String(ref).match(CELL_RE);
  if (!match) throw new Error(`Invalid cell reference: ${ref}`);
  return { col: columnToNumber(match[1]), row: Number(match[2]) };
}

export function expandRange(range) {
  const parts = range.split(':');
  if (parts.length !== 2) throw new Error(`Invalid range: ${range}`);
  const start = parseCellRef(parts[0]);
  const end = parseCellRef(parts[1]);
  const cells = [];
  for (let row = Math.min(start.row, end.row); row <= Math.max(start.row, end.row); row++) {
    for (let col = Math.min(start.col, end.col); col <= Math.max(start.col, end.col); col++) {
      cells.push(`${numberToColumn(col)}${row}`);
    }
  }
  if (cells.length > 10000) throw new Error('Range is too large');
  return cells;
}

// A small recursive-descent parser: no eval(), Function(), or arbitrary JavaScript execution.
export function evaluateFormula(formula, getCellValue) {
  const source = formula.startsWith('=') ? formula.slice(1) : formula;
  let index = 0;
  const peek = () => source[index];
  const skipSpaces = () => { while (/\s/.test(peek() || '')) index++; };
  const consume = (char) => {
    skipSpaces();
    if (peek() === char) { index++; return true; }
    return false;
  };
  const parseNumber = () => {
    skipSpaces();
    const match = source.slice(index).match(/^(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/i);
    if (!match) return null;
    index += match[0].length;
    return Number(match[0]);
  };
  const parseIdentifier = () => {
    skipSpaces();
    const match = source.slice(index).match(/^[A-Za-z]+[1-9]\d*/);
    if (match) { index += match[0].length; return { type: 'cell', value: match[0].toUpperCase() }; }
    const fn = source.slice(index).match(/^[A-Za-z]+/);
    if (fn) { index += fn[0].length; return { type: 'name', value: fn[0].toUpperCase() }; }
    return null;
  };
  const readRange = (firstRef) => {
    skipSpaces();
    if (!consume(':')) return [getCellValue(firstRef.value)];
    const second = parseIdentifier();
    if (!second || second.type !== 'cell') throw new Error('Expected a cell reference after :');
    return expandRange(`${firstRef.value}:${second.value}`).map(getCellValue);
  };
  const parsePrimary = () => {
    skipSpaces();
    if (consume('(')) {
      const value = parseExpression();
      if (!consume(')')) throw new Error('Missing closing parenthesis');
      return value;
    }
    if (consume('+')) return parsePrimary();
    if (consume('-')) return -parsePrimary();
    const number = parseNumber();
    if (number !== null) return number;
    const identifier = parseIdentifier();
    if (!identifier) throw new Error(`Unexpected input near "${source.slice(index, index + 12)}"`);
    if (identifier.type === 'cell') return readRange(identifier)[0];
    if (!consume('(')) throw new Error(`Unknown name: ${identifier.value}`);
    const args = [];
    skipSpaces();
    if (!consume(')')) {
      do {
        skipSpaces();
        const argId = parseIdentifier();
        if (argId?.type === 'cell') args.push(...readRange(argId));
        else if (argId?.type === 'name') throw new Error(`Unknown function argument: ${argId.value}`);
        else args.push(parseExpression());
        skipSpaces();
      } while (consume(','));
      if (!consume(')')) throw new Error('Missing ) after function arguments');
    }
    const nums = args.map((v) => Number(v ?? 0));
    switch (identifier.value) {
      case 'SUM': return nums.reduce((a, b) => a + b, 0);
      case 'MIN': if (!nums.length) throw new Error('MIN needs at least one value'); return Math.min(...nums);
      case 'MAX': if (!nums.length) throw new Error('MAX needs at least one value'); return Math.max(...nums);
      case 'AVERAGE': if (!nums.length) throw new Error('AVERAGE needs at least one value'); return nums.reduce((a, b) => a + b, 0) / nums.length;
      default: throw new Error(`Unsupported function: ${identifier.value}`);
    }
  };
  const parseTerm = () => {
    let value = parsePrimary();
    while (true) {
      if (consume('*')) value *= parsePrimary();
      else if (consume('/')) {
        const divisor = parsePrimary();
        if (divisor === 0) throw new Error('Division by zero');
        value /= divisor;
      } else break;
    }
    return value;
  };
  const parseExpression = () => {
    let value = parseTerm();
    while (true) {
      if (consume('+')) value += parseTerm();
      else if (consume('-')) value -= parseTerm();
      else break;
    }
    return value;
  };
  const result = parseExpression();
  skipSpaces();
  if (index !== source.length) throw new Error(`Unexpected input near "${source.slice(index)}"`);
  if (typeof result !== 'number' || !Number.isFinite(result)) throw new Error('Formula result is not a finite number');
  return result;
}

export function calculateCell(cells, ref, stack = new Set(), cache = new Map()) {
  if (cache.has(ref)) return cache.get(ref);
  if (stack.has(ref)) throw new Error('Circular reference detected');
  const raw = cells[ref]?.formula ?? cells[ref]?.value ?? '';
  if (raw === '') return 0;
  if (typeof raw === 'number') return raw;
  const text = String(raw).trim();
  if (!text.startsWith('=')) {
    const numeric = Number(text);
    return text !== '' && Number.isFinite(numeric) ? numeric : text;
  }
  stack.add(ref);
  try {
    const result = evaluateFormula(text, (cellRef) => {
      const normalized = cellRef.toUpperCase();
      const value = calculateCell(cells, normalized, stack, cache);
      if (typeof value === 'string') throw new Error(`Cell ${normalized} is not numeric`);
      return value;
    });
    cache.set(ref, result);
    return result;
  } finally {
    stack.delete(ref);
  }
}

export function getCellDisplay(cells, ref, cache = new Map()) {
  const cell = cells[ref];
  if (!cell) return '';
  const raw = cell.formula ?? cell.value ?? '';
  if (typeof raw !== 'string' || !raw.startsWith('=')) return raw;
  try { return calculateCell(cells, ref, new Set(), cache); }
  catch (error) { return `#ERROR: ${error.message}`; }
}
