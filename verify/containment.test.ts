import {test} from 'node:test';
import assert from 'node:assert/strict';
import {checkContainment,loadAtlas,mesh,select,Solid} from './containment';

const atlas = loadAtlas(), skin = new Solid(select(atlas, '^Skin$').map((p) => mesh(atlas, p)));

test('the brain and spinal nerves of the atlas sit inside the skin', () => {
  const r = checkContainment(atlas, {parts: 'system:nervous'});
  assert.ok(r.pass, JSON.stringify(r.rows.filter((x) => x.outside).slice(0, 5)));
});
test('a point in the chest is inside, a point beside the body and one in front of the chest are not', () => {
  assert.ok(skin.contains([0, 1.2, 0]));
  assert.ok(!skin.contains([0.5, 1.0, 0]));
  assert.ok(!skin.contains([0, 1.2, 0.4]));
});
test('a nerve drawn a hand-width in front of the thigh is caught', () => {
  const thigh = select(atlas, '^Left femur$')[0], m = mesh(atlas, thigh);
  const moved = new Float32Array(m.positions);
  for (let i = 2; i < moved.length; i += 3) moved[i] += 0.15;
  const outside = Array.from({length: moved.length / 3}, (_, i) => moved.subarray(i * 3, i * 3 + 3)).filter((v) => !skin.contains(v)).length;
  assert.ok(outside / (moved.length / 3) > 0.9, `${outside} outside`);
});
