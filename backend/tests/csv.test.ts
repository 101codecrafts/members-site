// SR-18 (CWE-1236): CSV exports must neutralise spreadsheet formulas.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { csvCell, toCsv } from '../lib/csv.ts';

test('formula-leading cells are prefixed with a quote', () => {
  for (const evil of ['=HYPERLINK("http://evil","x")', '+1+1', '-2+3', '@SUM(A1)', '\tcmd', '\rcmd']) {
    const out = csvCell(evil);
    assert.ok(out.replace(/^"/, '').startsWith("'"), `${JSON.stringify(evil)} -> ${out}`);
  }
});
test('normal cells untouched; quotes/commas escaped', () => {
  assert.equal(csvCell('Alice'), 'Alice');
  assert.equal(csvCell('a,b'), '"a,b"');
  assert.equal(csvCell('say "hi"'), '"say ""hi"""');
  assert.equal(csvCell(null), '');
});
test('toCsv escapes every row', () => {
  const csv = toCsv([{ name: '=cmd|calc', amt: 5 }]);
  assert.equal(csv, "name,amt\r\n'=cmd|calc,5\r\n");
});
