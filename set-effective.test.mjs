import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DATED, carried, check, longDate, stamp } from './set-effective.mjs';

test('the date is written the way the texts write it, and a wrong one is refused', () => {
  assert.equal(longDate('2026-12-01'), '1 December 2026');
  assert.equal(longDate('2027-03-31'), '31 March 2027');
  assert.throws(() => longDate('2026-02-30'));
  assert.throws(() => longDate('1 December 2026'));
});
test('a dated line can be set again for a later version', () => {
  const t = 'x\n*Effective [date]. Between**\ny';
  const once = stamp('dpa.md', t, '1 December 2026');
  assert.equal(carried('dpa.md', once), '1 December 2026');
  assert.equal(carried('dpa.md', stamp('dpa.md', once, '5 January 2027')), '5 January 2027');
  assert.equal(carried('dpa.md', 'no date line'), undefined);
  assert.equal(carried('dpa.md', '*Effective [date].* and *Effective [date].*'), undefined, 'two lines: refuse to guess');
});
test('every legal text carries exactly the date of docs/legal/effective.json (the marker [date] while it is null)', () => {
  assert.deepEqual(check(), []);
  assert.equal(Object.keys(DATED).length, 6);
  assert.match(readFileSync(new URL('../docs/legal/effective.json', import.meta.url), 'utf8'), /"date": (null|"\d{4}-\d{2}-\d{2}")/);
});
