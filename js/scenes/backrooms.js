import * as cg from '../render/core/cg.js';
import { getXRInputSources } from '../immersive-pre.js';
import { joyStickState, buttonState } from '../render/core/controllerInput.js';
import { Game } from './backrooms/simulation.js';
import { VRInput } from './backrooms/vr-input.js';
import { Director } from './backrooms/director.js';
import { VRHud } from './backrooms/hud.js';
import { buildWorld, Mesh } from './backrooms/geometry.js';
import { shader } from './backrooms/shader.js';
import { doorBox, powerSwitch, exit, regions, links, locate } from './backrooms/world.js';

let dispose = () => {};
export const init = async (model) => {
   dispose();
   let game = new Game(),
      active = false,
      ai = '',
      dialogue = '',
      notice = '',
      noticeUntil = 0;
   let previousTime = performance.now(),
      nextHud = 0,
      immersive = null;
   const controls = new VRInput(),
      hud = new VRHud(),
      world = model.add();
   const director = new Director(
      game,
      (text) => (ai = text),
      (text) => (dialogue = text)
   );
   const testing = new URLSearchParams(location.search).has('test');
   const oldWidgets = window.suppress_vrWidgets;
   window.suppress_vrWidgets = true;
   model.customShader(shader);
   const geometry = buildWorld(game.world);
   clay.defineMesh('backrooms-world', clay.trianglesMesh(geometry.mesh));
   clay.defineMesh('backrooms-signs', clay.trianglesMesh(geometry.signs));
   world.add('backrooms-world').color(1, 1, 1).flag('uBRStatic');
   world.add('backrooms-signs').color(1, 1, 1).flag('uBRSign').txtr(9);
   const atlas = document.createElement('canvas');
   atlas.width = 512;
   atlas.height = 1024;
   const ctx = atlas.getContext('2d');
   [
      '02 / STORAGE',
      '03 / POOL',
      '04 / PUMP ROOM',
      '01 / COLONNADE',
      'EXIT / POWER REQUIRED',
      'POWER / RESTORE',
      'DEEP WATER / USE WALKWAY'
   ].forEach((text, i) => {
      ctx.fillStyle = '#26352b';
      ctx.fillRect(0, i * 64, 512, 64);
      ctx.strokeStyle = '#d6cd8e';
      ctx.strokeRect(2, i * 64 + 2, 508, 60);
      ctx.font = 'bold 25px sans-serif';
      ctx.fillStyle = '#e5dfa7';
      ctx.textAlign = 'center';
      ctx.fillText(text, 256, i * 64 + 41);
   });
   model.txtrSrc(9, atlas);
   hud.canvas._animate = true;
   model.txtrSrc(8, hud.canvas);
   const panelMesh = new Mesh();
   panelMesh.quad(
      [
         [-0.6, -0.3, 0],
         [0.6, -0.3, 0],
         [0.6, 0.3, 0],
         [-0.6, 0.3, 0]
      ],
      [0, 0, 1],
      0,
      [
         [0, 1],
         [1, 1],
         [1, 0],
         [0, 0]
      ]
   );
   clay.defineMesh('backrooms-hud', clay.trianglesMesh(panelMesh.data));
   const panel = model.add('backrooms-hud').color(1, 1, 1).flag('uBRHud').txtr(8);
   const cube = (parent, flag) => parent.add('cube').color(1, 1, 1).flag(flag);
   const placeBox = (node, x, y, z, w, h, d) =>
      node
         .identity()
         .move(x + w / 2, y + h / 2, z + d / 2)
         .scale(w / 2, h / 2, d / 2);
   const doors = game.world.doors.map(() => cube(world, 'uBRDoor'));
   const monster = world.add(),
      body = cube(monster, 'uBRMonster'),
      head = cube(monster, 'uBRMonster');
   placeBox(body, -0.25, 0.85, -0.17, 0.5, 1.45, 0.34);
   placeBox(head, -0.22, 2.3, -0.19, 0.44, 0.5, 0.38);
   const limbs = [-1, 1].map((side) => ({
      side,
      leg: cube(monster, 'uBRMonster'),
      arm: cube(monster, 'uBRMonster'),
      eye: cube(monster, 'uBREye')
   }));
   const power = cube(world, 'uBREye'),
      exitLamp = cube(world, 'uBREye');
   const map = document.createElement('canvas');
   map.width = 240;
   map.height = 180;
   const mapContext = map.getContext('2d');
   function drawMap() {
      const points = { yellow: [42, 32], storage: [192, 32], pool: [42, 132], pump: [192, 132] };
      mapContext.clearRect(0, 0, 240, 180);
      mapContext.strokeStyle = '#829b85';
      for (const link of links) {
         mapContext.beginPath();
         mapContext.moveTo(...points[link.a]);
         mapContext.lineTo(...points[link.b]);
         mapContext.stroke();
      }
      for (const [id, [x, y]] of Object.entries(points)) {
         mapContext.fillStyle = '#182119';
         mapContext.fillRect(x - 37, y - 17, 74, 34);
         mapContext.strokeStyle = regions[id].color;
         mapContext.strokeRect(x - 37, y - 17, 74, 34);
         mapContext.font = '10px sans-serif';
         mapContext.textAlign = 'center';
         mapContext.fillStyle = regions[id].color;
         mapContext.fillText(regions[id].code.split(' / ')[1], x, y + 4);
      }
      const location = locate(game.world, game.player),
         point = points[location.region];
      if (point) {
         mapContext.fillStyle = '#f1e6ad';
         mapContext.beginPath();
         mapContext.arc(point[0] + 28, point[1] - 10, 3, 0, Math.PI * 2);
         mapContext.fill();
      }
   }
   function reset() {
      game = new Game();
      director.reset(game);
      controls.reset(game.player.yaw);
      dialogue = notice = '';
      active = true;
      game.start();
      hud.nextDraw = 0;
   }
   function interact() {
      if (game.result) {
         reset();
         return;
      }
      if (!active) {
         active = true;
         game.start();
         return;
      }
      notice = game.interact() || '';
      noticeUntil = performance.now() + 3000;
      if (notice && typeof vibrate === 'function') vibrate('right', 0.3, 80);
   }
   const keydown = (event) => {
      if (event.target instanceof HTMLInputElement || event.repeat) return;
      if (event.code === 'KeyE') interact();
      if (event.code === 'KeyP' && !game.result) active = !active;
      if (event.code === 'KeyR') reset();
   };
   const blur = () => {
      active = false;
      controls.recenter();
   };
   window.addEventListener('keydown', keydown);
   window.addEventListener('blur', blur);
   const visibility = () => {
      if (document.hidden) blur();
   };
   document.addEventListener('visibilitychange', visibility);
   controls.reset(game.player.yaw);
   model.animate(() => {
      const now = performance.now(),
         dt = Math.min(0.05, (now - previousTime) / 1000);
      previousTime = now;
      const headMatrix = cg.mMultiply(
         clay.inverseRootMatrix,
         clay.pose?.transform.matrix || model.inverseViewMatrix(0)
      );
      const pose = {
         transform: {
            matrix: headMatrix,
            position: { x: headMatrix[12], y: headMatrix[13], z: headMatrix[14] }
         }
      };
      const isImmersive = clay.views.length > 1;
      if (immersive !== isImmersive) {
         immersive = isImmersive;
         controls.recenter();
      }
      const connected = [...getXRInputSources()];
      const sources = ['left', 'right'].filter(hand =>
         connected.some(source => source.handedness === hand && source.gamepad)
      ).map((hand) => ({
         handedness: hand,
         gamepad: {
            axes: [0, 0, joyStickState[hand].x, joyStickState[hand].y],
            buttons: buttonState[hand]
         }
      }));
      const input = controls.update(game, pose, sources, active && !game.result);
      if (input.restart && (!active || game.result)) reset();
      else if (input.interact) interact();
      if ((input.pause || input.exit) && !game.result) active = !active;
      if (active && !game.result) {
         game.step(dt, input);
         director.tick();
      }
      if (game.result && active) {
         active = false;
         director.stop();
      }
      world.setMatrix(cg.mInverse(controls.transform(game, pose)));
      model.setUniform('3f', 'uBRPlayer', game.player.x, headMatrix[13], game.player.z);
      game.world.doors.forEach((door, i) => {
         const b = doorBox(door);
         placeBox(doors[i], b.x, door.open ? 3.2 : 0, b.z, b.w, door.open ? 0.18 : 3.2, b.d);
      });
      monster.identity().move(game.monster.x, 0, game.monster.z);
      const gait = Math.sin(game.time * (game.monster.mode === 'chase' ? 10 : 6)) * 0.18;
      for (const part of limbs) {
         const s = part.side,
            yaw = game.monster.yaw;
         placeBox(part.leg, s * 0.18 - 0.07, 0, -0.09 + s * gait, 0.14, 1, 0.18);
         placeBox(part.arm, s * 0.39 - 0.07, 0.65, -0.09 - s * gait, 0.14, 1.65, 0.18);
         placeBox(
            part.eye,
            Math.sin(yaw) * 0.205 + Math.cos(yaw) * s * 0.1 - 0.035,
            2.57,
            -Math.cos(yaw) * 0.205 + Math.sin(yaw) * s * 0.1 - 0.035,
            0.07,
            0.055,
            0.07
         );
      }
      for (const node of [power, exitLamp]) {
         node.flag('uBREye', !game.powered);
         node.flag('uBRGreen', game.powered);
      }
      placeBox(power, powerSwitch.x + 0.83, 1.35, powerSwitch.z - 0.15, 0.06, 0.25, 0.3);
      placeBox(exitLamp, exit.x - 0.86, 2.2, exit.z - 0.55, 0.08, 0.12, 1.1);
      panel.setMatrix(headMatrix).move(0, -0.48, -1.5);
      if (now > nextHud) {
         nextHud = now + 100;
         drawMap();
         hud.update(now, game, { active, ai, dialogue, notice: now < noticeUntil ? notice : '', map });
         if (!active && !game.result) {
            const c = hud.canvas.getContext('2d');
            c.fillStyle = '#131d17';
            c.fillRect(20, 15, 980, 45);
            c.fillStyle = '#eee3b4';
            c.font = '30px sans-serif';
            c.fillText('RIGHT TRIGGER TO START / RESUME', 28, 45);
         }
      }
      if (testing) {
         document.querySelector('canvas[data-backrooms]')?.setAttribute(
            'data-state',
            JSON.stringify({
               player: game.player,
               monster: game.monster,
               powered: game.powered,
               result: game.result,
               active,
               ai,
               time: game.time,
               glError: clay.gl.getError()
            })
         );
      }
   });
   const canvas = clay.gl.canvas;
   canvas.dataset.backrooms = 'true';
   dispose = () => {
      director.stop();
      window.removeEventListener('keydown', keydown);
      window.removeEventListener('blur', blur);
      document.removeEventListener('visibilitychange', visibility);
      window.suppress_vrWidgets = oldWidgets;
      delete canvas.dataset.backrooms;
      delete canvas.dataset.state;
   };
};
export const deinit = () => {
   dispose();
   dispose = () => {};
};
export const onReload = async (scene, model) => {
   deinit();
   model.clear();
   await init(model);
};
