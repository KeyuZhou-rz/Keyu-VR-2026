import * as cg from '../render/core/cg.js';
import { joyStickState, buttonState } from '../render/core/controllerInput.js';
import { createRoomPlanner } from '../util/roomPlanner.js';
import { keyWentDown, KEY_E, KEY_R } from '../util/input_keyboard.js';

export const init = async (model, ctx, ctxForever = {}) => {
   ctxForever.disposeBackrooms?.();
   const connections = [[1, 2], [0, 3], [0, 3], [1, 2]];
   let planner = createRoomPlanner(connections);
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
   panel.add('square').scale(.35, .21, 1).color([.04, .05, .04]).dull();
   for (let i = 0; i < 8; i++)
      labels.push(panel.add('label').info(' ').move(0, .16 - i * .045, .003).scale(.013).color([1, 1, 1]).dull());

   const noticeCanvas = document.createElement('canvas');
   noticeCanvas.width = 512;
   noticeCanvas.height = 128;
   const noticeContext = noticeCanvas.getContext('2d');
   noticeContext.fillStyle = '#29100c';
   noticeContext.fillRect(0, 0, 512, 128);
   noticeContext.font = 'bold 56px sans-serif';
   noticeContext.textAlign = 'center';
   noticeContext.textBaseline = 'middle';
   noticeContext.fillStyle = '#ffbb99';
   noticeContext.fillText('I see you', 256, 64);
   const sightNotice = model.add('square').setTxtr(noticeCanvas, 7, true).color([1, 1, 1]).dull().opacity(0);

   for (const [x, z, w, d] of areas) {
      box(world, x, -.06, z, w, .12, d, [.36, .31, .20]);
      box(world, x, 3.2, z, w, .12, d, [.72, .70, .59]);
   }
   for (const [x, z, w, d] of walls)
      box(world, x, 1.6, z, w, 3.2, d, [.74, .68, .40]);
   for (const [x, z] of areas)
      box(world, x, 3.12, z, .65, .06, 1.4, [1, .98, .83]);

   const exit = { x: -3.78, z: 0 }, powerSwitch = { x: 0, z: -17.78 };
   const door = world.add().move(exit.x, 0, exit.z).turnY(Math.PI / 2);
   for (const side of [-1, 1]) box(door, side * .91, 1.25, 0, .12, 2.5, .18, [.2, .22, .19]);
   box(door, 0, 2.5, 0, 1.94, .12, .18, [.2, .22, .19]);
   const hinge = door.add().move(-.85, 0, 0);
   box(hinge, .85, 1.18, .02, 1.7, 2.35, .1, [.2, .25, .22]);
   box(hinge, 1.5, 1.15, .12, .08, .25, .08, [.7, .7, .6]);
   const doorLight = box(door, 0, 2.7, .08, .2, .12, .1, [.8, .1, .05]);
   const doorLabel = door.add('label').info('EXIT / OFFLINE').move(0, 2.94, .1).scale(.035).dull();
   const switchPanel = world.add().move(powerSwitch.x, 0, powerSwitch.z);
   box(switchPanel, 0, 1.4, 0, .7, .9, .16, [.17, .2, .18]);
   const switchLever = box(switchPanel, 0, 1.35, .14, .2, .3, .12, [.8, .1, .05]);
   switchPanel.add('label').info('POWER').move(0, 2, .15).scale(.035).dull();

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
   let seekerLine = '(Awaiting DeepSeek dialogue.)';
   let powered = false, result = null, elapsed = 0, triggerWasDown = false;
   let seesPlayer = false, sightNoticeUntil = 0;

   function finish(outcome) {
      result = outcome;
      route = [];
      planner.dispose();
      sightNotice.opacity(0);
      if (outcome === 'won') hinge.identity().move(-.85, 0, 0).turnY(-Math.PI / 2);
   }

   function restart(head) {
      planner.dispose();
      planner = createRoomPlanner(connections);
      player.x = 0;
      player.z = 1;
      enemy.x = 14;
      enemy.z = -14;
      enemy.yaw = 0;
      previousHead = [head[12], head[14]];
      route = [];
      nextPath = 0;
      atNode = true;
      playerRoom = 0;
      nextRoom = null;
      lastApplied = 'none';
      seekerLine = '(Awaiting DeepSeek dialogue.)';
      powered = false;
      result = null;
      elapsed = 0;
      seesPlayer = false;
      sightNoticeUntil = 0;
      sightNotice.opacity(0);
      hinge.identity().move(-.85, 0, 0);
      doorLight.color([.8, .1, .05]);
      switchLever.color([.8, .1, .05]);
      doorLabel.info('EXIT / OFFLINE');
   }

   function clearSight(a, b) {
      for (const [x, z, w, d] of walls) {
         let enter = 0, leave = 1;
         for (const [p, delta, lo, hi] of [[a.x, b.x - a.x, x - w / 2, x + w / 2],
                                          [a.z, b.z - a.z, z - d / 2, z + d / 2]]) {
            if (Math.abs(delta) < 1e-8) {
               if (p < lo || p > hi) { enter = 2; break; }
            }
            else {
               const u = (lo - p) / delta, v = (hi - p) / delta;
               enter = Math.max(enter, Math.min(u, v));
               leave = Math.min(leave, Math.max(u, v));
            }
         }
         if (enter <= leave) return false;
      }
      return true;
   }

   const near = point => Math.hypot(player.x - point.x, player.z - point.z) < 1.6 && clearSight(player, point);

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
      const triggerDown = inVR && !!buttonState.right[0]?.pressed;
      const use = keyWentDown(KEY_E) || (triggerDown && !triggerWasDown);
      triggerWasDown = triggerDown;
      if (keyWentDown(KEY_R) || (result && use)) restart(head);
      let dx = head[12] - previousHead[0], dz = head[14] - previousHead[1];
      previousHead = [head[12], head[14]];
      const x = joyStickState.right.x || 0, y = joyStickState.right.y || 0;
      const length = Math.hypot(x, y);
      if (inVR && length > .2) {
         const yaw = Math.atan2(head[8], head[10]);
         const c = Math.cos(yaw), s = Math.sin(yaw);
         const distance = 1.8 * dt / Math.max(1, length);
         dx += (c * x + s * y) * distance;
         dz += (-s * x + c * y) * distance;
      }
      if (!result) {
         elapsed += dt;
         move(dx, dz);
      }
      world.identity().move(head[12] - player.x, 0, head[14] - player.z);

      const currentPlayerRoom = roomAt(player), enemyRoom = roomAt(enemy);
      if (currentPlayerRoom >= 0) playerRoom = currentPlayerRoom;
      if (!result) {
         planner.tick(enemyRoom, playerRoom, model.time);
         const line = planner.takeLine();
         if (line) {
            seekerLine = line;
            console.info('[Backrooms] Seeker:', line);
         }
      }
      if (nextRoom !== null && Math.hypot(enemy.x - rooms[nextRoom][0], enemy.z - rooms[nextRoom][1]) < .2)
         nextRoom = null;
      if (!result && atNode && model.time >= nextPath) {
         let plan = null;
         if (nextRoom === null && enemyRoom >= 0) {
            plan = planner.route(enemyRoom, playerRoom);
            if (plan && plan.length > 1) nextRoom = plan[1];
         }
         const goal = nextRoom === null ? player : { x: rooms[nextRoom][0], z: rooms[nextRoom][1] };
         route = findPath(enemy, goal);
         if (route.length && Math.hypot(route[0].x - enemy.x, route[0].z - enemy.z) < .01)
            route.shift();
         if (plan && plan.length > 1 && route.length) {
            lastApplied = plan.join(' -> ');
            console.info('[Backrooms] Applied DeepSeek route:', lastApplied, 'next room:', nextRoom);
         }
         nextPath = model.time + .4;
         atNode = route.length === 0;
      }
      let walking = false;
      if (!result && route.length && Math.hypot(player.x - enemy.x, player.z - enemy.z) > .6) {
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
      if (!result && Math.hypot(player.x - enemy.x, player.z - enemy.z) < 1.05 && clearSight(enemy, player))
         finish('lost');
      if (!result && use) {
         if (!powered && near(powerSwitch)) {
            powered = true;
            doorLight.color([.15, .9, .3]);
            switchLever.color([.15, .9, .3]);
            doorLabel.info('EXIT / POWERED');
         }
         else if (powered && near(exit)) finish('won');
      }
      monster.identity().move(enemy.x, 0, enemy.z).turnY(enemy.yaw);
      const gait = !result && walking ? Math.sin(model.time * 6) * .3 : 0;
      for (let i = 0; i < 2; i++) {
         const side = i === 0 ? -1 : 1;
         legs[i].identity().move(side * .16, .8, 0).turnX(side * gait);
         arms[i].identity().move(side * .36, 1.72, 0).turnX(-side * gait);
      }

      const visible = !result && clearSight(enemy, player);
      if (visible && !seesPlayer) sightNoticeUntil = model.time + 2.5;
      seesPlayer = visible;

      panel.setMatrix(head).move(0, -.32, -1.1);
      sightNotice.setMatrix(head).move(0, .1, -.9).scale(.28, .07, 1)
                 .opacity(!result && seesPlayer && model.time < sightNoticeUntil ? 1 : 0);
      const mode = nextRoom !== null ? 'DeepSeek rooms + BFS' : enemyRoom === playerRoom ? 'BFS (same room)' : 'BFS fallback';
      const prompt = near(powerSwitch) ? (powered ? 'Power is on. Return to the exit.' : 'Right trigger / E: turn on power') :
                     near(exit) ? (powered ? 'Right trigger / E: escape' : 'Exit locked. Find the power switch.') : 'Right trigger / E: interact';
      const messages = result ? [
         result === 'won' ? 'YOU ESCAPED' : 'CAUGHT BY THE SEEKER',
         `Time: ${Math.floor(elapsed)}s`,
         powered ? 'Exit power restored.' : 'Exit power was still off.',
         result === 'won' ? 'You reached the exit.' : 'The seeker caught you.',
         'Right trigger / E / R: restart', '', '', ''
      ] : [
         'SEEKER / DIALOGUE',
         seekerLine.slice(0, 48),
         seekerLine.slice(48, 96),
         seekerLine.slice(96),
         powered ? 'Objective: return to exit in room 0' : 'Objective: power switch in room 2',
         prompt,
         'Using: ' + mode,
         `Room: ${playerRoom} | Time: ${Math.floor(elapsed)}s | Route: ${lastApplied}`
      ];
      for (let i = 0; i < labels.length; i++) {
         const text = messages[i].slice(0, 48) || ' ';
         if (text !== panelText[i]) {
            labels[i].info(text).opacity(text.trim() ? 1 : 0);
            panelText[i] = text;
         }
      }
   });
};

export const deinit = (model, ctx, ctxForever) => ctxForever.disposeBackrooms?.();
