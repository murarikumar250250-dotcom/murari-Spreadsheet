import { describe, expect, it } from 'vitest';
import { calculateCell, evaluateFormula, expandRange, numberToColumn, columnToNumber } from '../src/formulas.js';

describe('formula engine', () => {
  const get = (ref) => ({ A1: 2, A2: 3, A3: 4, B1: 10 }[ref] ?? 0);
  it('evaluates arithmetic and operator precedence', () => {
    expect(evaluateFormula('=A1+B1*2', get)).toBe(22);
    expect(evaluateFormula('=(A1+B1)*2', get)).toBe(24);
  });
  it('evaluates SUM, MIN, MAX, and AVERAGE ranges', () => {
    expect(evaluateFormula('=SUM(A1:A3)', get)).toBe(9);
    expect(evaluateFormula('=MIN(A1:A3)', get)).toBe(2);
    expect(evaluateFormula('=MAX(A1:A3)', get)).toBe(4);
    expect(evaluateFormula('=AVERAGE(A1:A3)', get)).toBe(3);
  });
  it('supports column labels beyond Z and expands ranges', () => {
    expect(numberToColumn(28)).toBe('AB');
    expect(columnToNumber('AB')).toBe(28);
    expect(expandRange('B1:A2')).toEqual(['A1', 'B1', 'A2', 'B2']);
  });
  it('recalculates dependent cells and detects circular references', () => {
    const cells = { A1: { value: '4' }, A2: { formula: '=A1*3' }, A3: { formula: '=A2+1' } };
    expect(calculateCell(cells, 'A3')).toBe(13);
    const circular = { A1: { formula: '=A2+1' }, A2: { formula: '=A1+1' } };
    expect(() => calculateCell(circular, 'A1')).toThrow(/Circular reference/);
  });
  it('rejects invalid formulas and division by zero', () => {
    expect(() => evaluateFormula('=2+*3', get)).toThrow();
    expect(() => evaluateFormula('=4/0', get)).toThrow(/Division by zero/);
  });
});
