import {test} from 'node:test';
import assert from 'node:assert/strict';
import {followCurve,valueAt} from './round-trip';

const cgm = [0, 15, 30, 45, 60].map((m, i) => ({t: m * 60, v: [92, 118, 141, 128, 104][i]}));

test('interpolates between drawn points and refuses to extrapolate', () => {
  assert.equal(valueAt([{t: 0, v: 0}, {t: 10, v: 10}], 2.5), 2.5);
  assert.equal(valueAt([{t: 0, v: 0}, {t: 10, v: 10}], 11), null);
});
test('a replay that follows the CGM within the margin passes', () => {
  const drawn = cgm.map((p) => ({t: p.t, v: p.v + 4}));
  const r = followCurve('CGM', cgm, drawn, {margin: 10, unit: 'mg/dL'});
  assert.ok(r.pass);assert.equal(r.within, 1);assert.equal(r.worst.gap, 4);
});
test('a replay that misses the peak fails and says where', () => {
  const drawn = cgm.map((p) => ({t: p.t, v: p.t === 1800 ? 110 : p.v}));
  const r = followCurve('CGM', cgm, drawn, {margin: 10, unit: 'mg/dL'});
  assert.ok(!r.pass);assert.equal(r.worst.t, 1800);assert.equal(r.worst.gap, 31);assert.equal(r.within, 0.8);
});
test('measured points outside the drawn range count as misses', () => {
  const r = followCurve('CGM', cgm, cgm.slice(0, 3), {margin: 10, unit: 'mg/dL'});
  assert.ok(!r.pass);assert.equal(r.worst.gap, Infinity);
});
