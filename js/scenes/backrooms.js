import * as cg from '../render/core/cg.js';
import { joyStickState } from '../render/core/controllerInput.js';
import { createRoomPlanner } from '../util/roomPlanner.js';

export const init = async (model, ctx, ctxForever = {}) => {
   ctxForever.disposeBackrooms?.();
   const planner = createRoomPlanner([[1, 2], [0, 3], [0, 3], [1, 2]]);
   ctxForever.disposeBackrooms = () => planner.dispose();
   const world = model.add();
   const rooms = [[0, 0], [14, 0], [0, -14], [14, -14]];
   const roomAt = point => rooms.findIndex(([x, z]) => Math.abs(point.x - x) < 4 && Math.abs(point.z - z) < 4);
   const areas = [], walls = [];
   for (const [x, z] of rooms) {
      areas.push([x, z, 8, 8]);
      const sx = x === 0 ? 1 : -1, sz = z === 0 ? -1 : 1;
      walls.push([x - sx * 4, z, .2, 8], [x, z - sz * 4, 8, .2]);
      for (const offset of [-2.5, 2.5])
         walls.push([x + sx * 4, z + offset, .2, 3], [x + offset, z + sz * 4, 3, .2]);
   }
   for (const z of [0, -14]) {
      areas.push([7, z, 6, 2]);
      walls.push([7, z - 1, 6, .2], [7, z + 1, 6, .2]);
   }
   for (const x of [0, 14]) {
      areas.push([x, -7, 2, 6]);
      walls.push([x - 1, -7, .2, 6], [x + 1, -7, .2, 6]);
   }
   const box = (parent, x, y, z, w, h, d, color) =>
      parent.add('cube').move(x, y, z).scale(w / 2, h / 2, d / 2).color(color).dull();

   const panel = model.add(), labels = [], panelText = [];
   panel.add('square').scale(.35, .18, 1).color([.04, .05, .04]).dull();
   for (let i = 0; i < 6; i++)
      labels.push(panel.add('label').info(' ').move(0, .125 - i * .05, .003).scale(.013).color([1, 1, 1]).dull());

   for (const [x, z, w, d] of areas) {
      box(world, x, -.06, z, w, .12, d, [.36, .31, .20]);
      box(world, x, 3.2, z, w, .12, d, [.72, .70, .59]);
   }
   for (const [x, z, w, d] of walls)
      box(world, x, 1.6, z, w, 3.2, d, [.74, .68, .40]);
   for (const [x, z] of areas)
      box(world, x, 3.12, z, .65, .06, 1.4, [1, .98, .83]);

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
   const enemy = { x: 14, z: -14, yaw: 0 };
   let route = [], nextPath = 0, atNode = true;
   let playerRoom = 0, nextRoom = null;
   let lastApplied = 'none';

   function canStand(x, z, radius = .22) {
      if (!areas.some(([cx, cz, w, d]) => Math.abs(x - cx) <= w / 2 && Math.abs(z - cz) <= d / 2))
         return false;
      for (const [cx, cz, w, d] of walls) {
         const dx = Math.max(0, Math.abs(x - cx) - w / 2);
         const dz = Math.max(0, Math.abs(z - cz) - d / 2);
         if (dx * dx + dz * dz < radius * radius) return false;
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

   function canWalk(a, b, radius) {
      const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / .1));
      for (let i = 0; i <= steps; i++)
         if (!canStand(a.x + (b.x - a.x) * i / steps, a.z + (b.z - a.z) * i / steps, radius))
            return false;
      return true;
   }

   const grid = new Map(), nodes = [];
   for (let x = -4; x <= 18; x++)
      for (let z = -18; z <= 4; z++)
         if (canStand(x, z, .4)) {
            const node = { x, z, neighbors: [] };
            grid.set(x + ',' + z, node);
            nodes.push(node);
         }
   for (const node of nodes)
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
         const neighbor = grid.get((node.x + dx) + ',' + (node.z + dz));
         if (neighbor && canWalk(node, neighbor, .4)) node.neighbors.push(neighbor);
      }

   function nearest(point, radius) {
      const rounded = grid.get(Math.round(point.x) + ',' + Math.round(point.z));
      if (rounded && canWalk(point, rounded, radius)) return rounded;
      let best = null, distance = Infinity;
      for (const node of nodes) {
         const d = Math.hypot(node.x - point.x, node.z - point.z);
         if (d < distance && canWalk(point, node, radius)) {
            best = node;
            distance = d;
         }
      }
      return best;
   }

   function findPath(from, to) {
      const start = nearest(from, .4), goal = nearest(to, .22);
      if (!start || !goal) return [];
      const queue = [start], previous = new Map([[start, null]]);
      for (let i = 0; i < queue.length && !previous.has(goal); i++)
         for (const neighbor of queue[i].neighbors)
            if (!previous.has(neighbor)) {
               previous.set(neighbor, queue[i]);
               queue.push(neighbor);
            }
      if (!previous.has(goal)) return [];
      const path = [];
      for (let node = goal; node; node = previous.get(node)) path.unshift(node);
      return path;
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

      const currentPlayerRoom = roomAt(player), enemyRoom = roomAt(enemy);
      if (currentPlayerRoom >= 0) playerRoom = currentPlayerRoom;
      if (nextRoom !== null && Math.hypot(enemy.x - rooms[nextRoom][0], enemy.z - rooms[nextRoom][1]) < .2)
         nextRoom = null;
      if (atNode && model.time >= nextPath) {
         if (nextRoom === null && enemyRoom >= 0) {
            const plan = planner.route(enemyRoom, playerRoom, model.time);
            if (plan && plan.length > 1) {
               nextRoom = plan[1];
               lastApplied = plan.join(' -> ');
               console.info('[Backrooms] Applied DeepSeek route:', lastApplied, 'next room:', nextRoom);
            }
         }
         const goal = nextRoom === null ? player : { x: rooms[nextRoom][0], z: rooms[nextRoom][1] };
         route = findPath(enemy, goal);
         if (route.length && Math.hypot(route[0].x - enemy.x, route[0].z - enemy.z) < .01)
            route.shift();
         nextPath = model.time + .4;
         atNode = route.length === 0;
      }
      let walking = false;
      if (route.length && Math.hypot(player.x - enemy.x, player.z - enemy.z) > .8) {
         const goal = route[0], dx = goal.x - enemy.x, dz = goal.z - enemy.z;
         const distance = Math.hypot(dx, dz);
         if (distance < .02) {
            enemy.x = goal.x;
            enemy.z = goal.z;
            route.shift();
            atNode = true;
         }
         else {
            atNode = false;
            const step = Math.min(1.1 * dt, distance) / distance;
            const next = { x: enemy.x + dx * step, z: enemy.z + dz * step };
            if (canWalk(enemy, next, .4)) {
               enemy.x = next.x;
               enemy.z = next.z;
               walking = true;
            }
            enemy.yaw = Math.atan2(dx, dz);
         }
      }
      monster.identity().move(enemy.x, 0, enemy.z).turnY(enemy.yaw);
      const gait = walking ? Math.sin(model.time * 6) * .3 : 0;
      for (let i = 0; i < 2; i++) {
         const side = i === 0 ? -1 : 1;
         legs[i].identity().move(side * .16, .8, 0).turnX(side * gait);
         arms[i].identity().move(side * .36, 1.72, 0).turnX(-side * gait);
      }

      panel.setMatrix(head).move(0, -.32, -1.1);
      const mode = nextRoom !== null ? 'DeepSeek rooms + BFS' : enemyRoom === playerRoom ? 'BFS (same room)' : 'BFS fallback';
      const messages = [
         'DeepSeek chase',
         `Query: ${planner.state.query} (${planner.state.status})`,
         'Reply: ' + planner.state.reply.replace(/\s+/g, ' '),
         'Using: ' + mode,
         'Last used: ' + lastApplied,
         `Target: ${nextRoom === null ? 'player' : 'room ' + nextRoom} | Player: room ${playerRoom}`
      ];
      for (let i = 0; i < labels.length; i++) {
         const text = messages[i].slice(0, 48);
         if (text !== panelText[i]) {
            labels[i].info(text);
            panelText[i] = text;
         }
      }
   });
};

export const deinit = (model, ctx, ctxForever) => ctxForever.disposeBackrooms?.();
