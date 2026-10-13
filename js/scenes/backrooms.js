import * as cg from '../render/core/cg.js';
import { joyStickState } from '../render/core/controllerInput.js';

export const init = async model => {
   const world = model.add();
   const areas = [[0, 0, 8, 8], [0, -7, 2, 6], [0, -14, 8, 8]];
   const walls = [
      [0, 4, 8, .2], [-4, 0, .2, 8], [4, 0, .2, 8],
      [-2.5, -4, 3, .2], [2.5, -4, 3, .2],
      [-1, -7, .2, 6], [1, -7, .2, 6],
      [0, -18, 8, .2], [-4, -14, .2, 8], [4, -14, .2, 8],
      [-2.5, -10, 3, .2], [2.5, -10, 3, .2]
   ];
   const box = (parent, x, y, z, w, h, d, color) =>
      parent.add('cube').move(x, y, z).scale(w / 2, h / 2, d / 2).color(color).dull();

   for (const [x, z, w, d] of areas) {
      box(world, x, -.06, z, w, .12, d, [.36, .31, .20]);
      box(world, x, 3.2, z, w, .12, d, [.72, .70, .59]);
   }
   for (const [x, z, w, d] of walls)
      box(world, x, 1.6, z, w, 3.2, d, [.74, .68, .40]);
   for (const z of [1, -2, -7, -12, -15])
      box(world, 0, 3.12, z, .65, .06, 1.4, [1, .98, .83]);

   const monster = world.add();
   const dark = [.045, .05, .04];
   box(monster, 0, 1.3, 0, .5, 1, .3, dark);
   box(monster, 0, 1.98, 0, .38, .36, .34, dark);
   const legs = [], arms = [];
   for (const side of [-1, 1]) {
      const leg = monster.add(), arm = monster.add();
      box(leg, 0, -.4, 0, .14, .8, .18, dark);
      box(arm, 0, -.45, 0, .12, .9, .14, dark);
      box(monster, side * .1, 2.02, .18, .055, .04, .04, [1, .12, .04]);
      legs.push(leg);
      arms.push(arm);
   }

   const player = { x: 0, z: 1 };
   let previousHead = null, immersive = null;
   let monsterZ = -14, direction = 1;

   function canStand(x, z) {
      if (!areas.some(([cx, cz, w, d]) => Math.abs(x - cx) <= w / 2 && Math.abs(z - cz) <= d / 2))
         return false;
      for (const [cx, cz, w, d] of walls) {
         const dx = Math.max(0, Math.abs(x - cx) - w / 2);
         const dz = Math.max(0, Math.abs(z - cz) - d / 2);
         if (dx * dx + dz * dz < .22 * .22) return false;
      }
      return true;
   }

   function move(dx, dz) {
      const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / .1));
      for (let i = 0; i < steps; i++) {
         if (canStand(player.x + dx / steps, player.z)) player.x += dx / steps;
         if (canStand(player.x, player.z + dz / steps)) player.z += dz / steps;
      }
   }

   model.animate(() => {
      const dt = Math.min(model.deltaTime, .05);
      const head = cg.mMultiply(clay.inverseRootMatrix, clay.pose.transform.matrix);
      const inVR = clay.views.length > 1;
      if (immersive !== inVR) {
         immersive = inVR;
         previousHead = [head[12], head[14]];
      }
      let dx = head[12] - previousHead[0], dz = head[14] - previousHead[1];
      previousHead = [head[12], head[14]];
      const x = joyStickState.left.x || 0, y = joyStickState.left.y || 0;
      const length = Math.hypot(x, y);
      if (inVR && length > .2) {
         const yaw = Math.atan2(head[8], head[10]);
         const c = Math.cos(yaw), s = Math.sin(yaw);
         const distance = 1.8 * dt / Math.max(1, length);
         dx += (c * x + s * y) * distance;
         dz += (-s * x + c * y) * distance;
      }
      move(dx, dz);
      world.identity().move(head[12] - player.x, 0, head[14] - player.z);

      monsterZ += direction * dt;
      if (monsterZ > -1 || monsterZ < -15) {
         monsterZ = Math.max(-15, Math.min(-1, monsterZ));
         direction = -direction;
      }
      monster.identity().move(0, 0, monsterZ).turnY(direction > 0 ? 0 : Math.PI);
      const gait = Math.sin(model.time * 6) * .3;
      for (let i = 0; i < 2; i++) {
         const side = i === 0 ? -1 : 1;
         legs[i].identity().move(side * .16, .8, 0).turnX(side * gait);
         arms[i].identity().move(side * .36, 1.72, 0).turnX(-side * gait);
      }
   });
};
