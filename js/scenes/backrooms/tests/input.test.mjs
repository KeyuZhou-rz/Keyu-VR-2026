import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../simulation.js';
import { VRInput, stick } from '../vr-input.js';
import { rigMatrix, transformPoint } from '../xr-math.js';
import { canStand, findPath, distance } from '../world.js';

function pose(x = 0, z = 0, yaw = 0) {
   const matrix = rigMatrix(x, z, yaw);
   matrix[13] = 1.65;
   return { transform: { matrix, position: { x, y: 1.65, z } } };
}
function hand(handedness, x = 0, y = 0, pressed = []) {
   return {
      handedness,
      gamepad: {
         axes: [0, 0, x, y],
         buttons: Array.from({ length: 6 }, (_, i) => ({ pressed: pressed.includes(i) }))
      }
   };
}
const near = (a, b, tolerance = 1e-5) => assert.ok(Math.abs(a - b) < tolerance, `${a} ≈ ${b}`);

test('XR stick dead zone, analog movement and x/y signs', () => {
   assert.deepEqual(stick({ axes: [0, 0, 0.1, -0.1] }), { x: 0, y: 0 });
   near(stick({ axes: [0.59, 0] }).x, 0.5);
   const g = new Game(),
      input = new VRInput();
   g.player = { x: 7, z: 5, yaw: 0 };
   input.reset(0);
   const controls = input.update(g, pose(), [hand('left', 0, -0.59)], true);
   near(controls.forward, 0.5);
   g.step(0.05, controls);
   near(g.player.z, 5 - 3.1 * 0.5 * 0.05);
});
test('snap turn uses release hysteresis and pivots around the current head', () => {
   const g = new Game(),
      input = new VRInput();
   g.player.yaw = 0;
   input.reset(0);
   const initial = { ...g.player },
      head = pose(0.7, -0.3);
   input.update(g, head, [hand('right', 1)], true);
   near(g.player.yaw, Math.PI / 6);
   for (let i = 0; i < 30; i++) input.update(g, head, [hand('right', 1)], true);
   near(g.player.yaw, Math.PI / 6);
   const position = transformPoint(input.transform(g, head), 0.7, 1.65, -0.3);
   near(position[0], initial.x);
   near(position[2], initial.z);
   input.update(g, head, [hand('right')], true);
   input.update(g, head, [hand('right', -1)], true);
   near(g.player.yaw, 0);
});
test('head-relative movement, physical collision and tracking recenter do not teleport', () => {
   const g = new Game(),
      input = new VRInput();
   g.player = { x: 3, z: 37, yaw: 0 };
   input.reset(0);
   input.update(g, pose(), [], true);
   input.update(g, pose(2), [], true);
   assert.ok(g.player.x < 3.73 && canStand(g.world, g.player), 'physical head cannot walk into water');
   const before = { ...g.player };
   input.recenter();
   input.update(g, pose(10, 20), [], true);
   near(g.player.x, before.x);
   near(g.player.z, before.z);
   input.update(g, pose(10, 20, Math.PI / 2), [], true);
   near(g.player.yaw, Math.PI / 2);
   input.update(g, pose(12, 20), [], false);
   input.update(g, pose(12, 20), [], true);
   near(g.player.x, before.x);
   near(g.player.z, before.z);
});
test('controller actions fire once per press and reset on disconnect', () => {
   const g = new Game(),
      input = new VRInput();
   const sources = [hand('left', 0, 0, [1, 4]), hand('right', 0, 0, [0, 4, 5])];
   const first = input.update(g, pose(), sources, true);
   assert.ok(first.interact && first.pause && first.restart && first.exit && first.sprint);
   const held = input.update(g, pose(), sources, true);
   assert.ok(!held.interact && !held.pause && !held.restart && !held.exit);
   input.update(g, pose(), [], true);
   assert.ok(input.update(g, pose(), sources, true).interact);
});
test('VR stick movement and trigger can complete the power-and-exit route', () => {
   const g = new Game(),
      input = new VRInput();
   input.reset(g.player.yaw);
   input.update(g, pose(), [], true);
   function walk(goal) {
      const path = findPath(g.world, g.player, goal);
      assert.ok(path.length);
      for (const point of path) {
         let frames = 0;
         while (distance(g.player, point) > 0.08 && !g.result) {
            assert.ok(frames++ < 1000, 'VR route makes progress');
            const yaw = Math.atan2(point.x - g.player.x, -(point.z - g.player.z));
            const control = input.update(
               g,
               pose(0, 0, yaw - input.yaw),
               [hand('left', 0, -1, [1])],
               true
            );
            g.step(Math.min(0.02, distance(g.player, point) / 4.4), control);
            assert.ok(canStand(g.world, g.player));
         }
      }
   }
   function trigger() {
      input.update(g, pose(), [], true);
      if (input.update(g, pose(), [hand('right', 0, 0, [0])], true).interact) g.interact();
   }
   for (const [x, z] of [
      [7, 29],
      [17, 37],
      [29, 37],
      [37, 41]
   ])
      walk({ x, z });
   trigger();
   assert.equal(g.powered, true);
   for (const [x, z] of [
      [35, 31],
      [35, 11],
      [27, 7],
      [17, 7],
      [1.7, 7]
   ])
      walk({ x, z });
   trigger();
   assert.equal(g.result, 'won');
});
