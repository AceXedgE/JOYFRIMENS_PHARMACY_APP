import test from 'node:test';
import assert from 'node:assert/strict';
import { gmtDateTime, packBreakdown } from '../../frontend/src/display.ts';

test('pack equivalents retain loose units and do not invent sealed cartons', () => {
  assert.equal(packBreakdown(41, 14, 'carton', 'tablet'), '2 carton(s) + 13 loose tablet(s); 1 carton = 14 tablet(s)');
  assert.equal(packBreakdown(0, 14, 'box', 'tablet'), '0 box(s) + 0 loose tablet(s); 1 box = 14 tablet(s)');
});
test('operational timestamps show weekday and date in GMT across midnight offsets', () => {
  assert.match(gmtDateTime('2026-10-17T00:30:00+02:00'), /Friday, 16 Oct 2026.*22:30/);
});
