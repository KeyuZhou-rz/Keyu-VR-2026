import * as cg from '../render/core/cg.js';
import { ControllerBeam, buttonState, joyStickState } from '../render/core/controllerInput.js';
import { stepWorld, isInRegion, canPlaceRegion, moveRegion, selectedResident,
   ensurePlayer, setViewMode, movePlayer, nearestResident, say } from '../util/village.js';
import { keyIsDown, keyWentDown, KEY_W, KEY_A, KEY_S, KEY_D, KEY_V } from '../util/input_keyboard.js';
import { createVillageAI } from '../util/villageAI.js';
import { createPenger } from '../util/pengerView.js';
import { createVillageUI, paintDialogue, paintTalk, questions, questionAt, residentAt, speedAt,
   talkOptions, talkOptionAt } from '../util/villageUI.js';

export const init = async (model, ctx, ctxForever = {}) => {
   ctxForever.disposeVillage?.();
   const response = await fetch(new URL('./village.json', import.meta.url), { cache: 'no-store' });
   if (!response.ok) throw new Error('Cannot load village.json: ' + response.status);
   const state = await response.json();
   window.villageState = state;
   const brains = new Map(state.residents.map(resident => [resident.id, createVillageAI(state, { resident })]));
   const ui = createVillageUI(state, { chat: async question => {
      const talking = selectedResident(state);
      if (state.player?.mode === 'world' && nearestResident(state, 3)?.id !== talking.id) return null;
      return brains.get(talking.id).chat(question);
   } });

   const { width, depth, cellSize } = state.grid;
   const player = ensurePlayer(state);
   const worldScale = .5 / cellSize;                        // in the village a grid cell is half a meter
   const board = model.add().move(0, .8, -1.5);
   const colors = { water: [.08, .4, .8], house: [.8, .43, .16], forest: [.13, .36, .2] };
   const position = ([x, z]) => [(x - (width - 1) / 2) * cellSize,
                               (z - (depth - 1) / 2) * cellSize];
   const cube = (parent, x, y, z, w, h, d, color) =>
      parent.add('cube').move(x, y, z).scale(w / 2, h / 2, d / 2).color(color).dull();
   const box = (parent, cell, y, w, h, d, color) => {
      const [x, z] = position(cell);
      return cube(parent, x, y, z, w, h, d, color);
   };
   cube(board, 0, -.025, 0, width * cellSize, .04, depth * cellSize, [.1, .14, .12]);
   const surface = board.add('square').turnX(-Math.PI / 2)
                        .scale(width * cellSize / 2, depth * cellSize / 2, 1).opacity(0);
   for (let x = 0; x < width; x++)
      for (let z = 0; z < depth; z++)
         box(board, [x, z], 0, cellSize * .96, .01, cellSize * .96, [.39, .43, .32]);
   for (const cell of state.obstacles)
      box(board, cell, .035, cellSize * .92, .06, cellSize * .92, [.25, .28, .25]);

   const terrain = board.add(), regionNodes = new Map();
   const drawRegions = () => {
      while (terrain.nChildren()) terrain.remove(0);
      regionNodes.clear();
      for (const region of state.regions) {
         const [rx, rz] = position(region.cell);
         const root = terrain.add().move(rx, 0, rz);
         regionNodes.set(region.id, root);
         for (let x = 0; x < region.size; x++)
            for (let z = 0; z < region.size; z++) {
               cube(root, x * cellSize, .001, z * cellSize, cellSize * .96, .01, cellSize * .96, colors[region.kind]);
               if (region.kind === 'house') {
                  const edge = x === 0 || x === region.size - 1 || z === 0 || z === region.size - 1;
                  const door = x === region.entry[0] - region.cell[0] && z === 0;
                  if (edge && !door)
                     cube(root, x * cellSize, .055, z * cellSize, cellSize * .96, .1, cellSize * .96, [.64, .32, .12]);
               }
            }
         for (const [x, z] of region.obstacles || [])
            cube(root, x * cellSize, .065, z * cellSize, cellSize * .92, .12, cellSize * .92, [.08, .23, .12]);
      }
   };
   drawRegions();
   let mapRevision = state.mapRevision;
   const preview = board.add('square').opacity(0);
   const route = board.add();
   const views = new Map(state.residents.map(resident => [resident.id, {
      penger: createPenger(board, cellSize * 1.4, resident.color, 'village-' + resident.id),
      name: board.add('label').info(resident.name).color(resident.color).dull(),
      speech: board.add('label').info(' ').color([1, 1, 1]).dull(),
   }]));
   let viewButton = false, viewRequest = null;
   let talkHit = null, talkHover = -1, talking = null, turn = 0;
   const dismissed = new Set();
   let pathVersion = '', drag = null, gripping = false, panelHit = null, hoveredResident = -1;

   const canvas = document.createElement('canvas');
   canvas.width = 800;
   canvas.height = 380;
   canvas._animate = true;
   const panel = model.add('square').setTxtr(canvas, 10, false).color([1, 1, 1]).dull();
   const talkCanvas = document.createElement('canvas');
   talkCanvas.width = 800;
   talkCanvas.height = 400;
   talkCanvas._animate = true;
   const talk = model.add('square').setTxtr(talkCanvas, 11, false)  // channel 10 belongs to the head-locked panel
      .color([1, 1, 1]).dull().opacity(0);
   const beam = new ControllerBeam(model, 'right');
   const updatePointer = () => {
      panelHit = null;
      talkHit = null;
      hoveredResident = -1;
      talkHover = -1;
      beam.isEnabled = window.isXR();
      beam.update();
      const inWorld = player.mode === 'world';
      panel.opacity(beam.isEnabled && !inWorld ? 1 : 0);
      if (!beam.isEnabled) return -1;
      if (inWorld) {
         if (talking) {
            talkHit = beam.hitRect(talk.getGlobalMatrix());
            talkHover = talkOptionAt(talkHit);
         }
         return -1;
      }
      const head = cg.mMultiply(clay.inverseRootMatrix, clay.pose.transform.matrix);
      panel.setMatrix(head).move(0, .12, -1.3).scale(.55, .26125, 1);
      panelHit = beam.hitRect(panel.getGlobalMatrix());
      hoveredResident = residentAt(panelHit);
      return questionAt(panelHit);
   };
   const pointedCell = () => {
      const hit = beam.hitPoint(surface.getGlobalMatrix(), !!drag);
      const point = hit && cg.mTransform(cg.mInverse(board.getMatrixFromRoot()), hit);
      return point && [point[0] / cellSize + (width - 1) / 2, point[2] / cellSize + (depth - 1) / 2];
   };
   const updateDrag = () => {
      const cell = pointedCell();
      if (cell) drag.cell = cell.map((value, axis) => Math.round(value - drag.offset[axis]));
   };
   const finishDrag = commit => {
      if (!drag) return;
      if (commit) moveRegion(state, drag.id, drag.cell, 'player');
      const region = state.regions.find(region => region.id === drag.id);
      const [x, z] = position(region.cell);
      regionNodes.get(drag.id).identity().move(x, 0, z);
      drag = null;
   };
   const choose = index => {
      const option = talkOptions[index], resident = talking && state.residents.find(item => item.id === talking);
      if (!option || !resident) return;
      state.selectedResident = resident.id;
      if (option.question) ui.ask(option.question);
      else {
         say(state, resident, 'See you around! Do come back and waddle with me.');
         dismissed.add(resident.id);
         resident.attending = null;
         resident.released = true;
      }
   };
   const handlers = {
      onPress(hand) {
         if (hand !== 'right') return;
         const hovered = updatePointer();
         if (!beam.isEnabled) return;
         if (player.mode === 'world') { choose(talkHover); return; }
         if (drag) return;
         if (hoveredResident >= 0 && hoveredResident < state.residents.length) {
            state.selectedResident = state.residents[hoveredResident].id;
            return;
         }
         if (speedAt(panelHit)) { state.speed = state.speed === 1 ? 3 : 1; return; }
         if (hovered >= 0 && !drag) ui.ask(questions[hovered]);
      },
      onDrag() {},
      onRelease() {},
      onClick() {},
      onMove() {},
      onDoublePress() {},
   };
   const previousInput = {};
   for (const name in handlers) {
      previousInput[name] = inputEvents[name];
      inputEvents[name] = handlers[name];
   }
   ctxForever.disposeVillage = () => {
      finishDrag(false);
      for (const name in handlers)
         if (inputEvents[name] === handlers[name]) inputEvents[name] = previousInput[name];
      for (const ai of brains.values()) ai.dispose();
      ui.dispose();
   };
   let previousPaint = '', previousTalk = '', lastUI = 0;
   const worldMatrix = head => {
      const [px, pz] = position(player.position);
      return board.identity().move(head[12], 0, head[14]).turnY(turn).scale(worldScale).move(-px, 0, -pz);
   };
   const roomPoint = (cell, head) => {              // where a grid position appears in the room
      const [px, pz] = position(player.position), [qx, qz] = position(cell);
      const dx = (qx - px) * worldScale, dz = (qz - pz) * worldScale, c = Math.cos(turn), s = Math.sin(turn);
      return [head[12] + c * dx + s * dz, head[14] - s * dx + c * dz];
   };
   model.animate(() => {
      const dt = Math.min(model.deltaTime, .05);
      const hovered = updatePointer(), inVR = beam.isEnabled;
      const toggle = inVR && !!buttonState.right[5]?.pressed;
      if (keyWentDown(KEY_V) || state.viewRequest || toggle && !viewButton) viewRequest = player.mode === 'god' ? 'world' : 'god';
      viewButton = toggle;
      state.viewRequest = null;
      if (viewRequest) {
         if (viewRequest === 'world') { finishDrag(false); turn = 0; dismissed.clear(); }
         setViewMode(state, viewRequest);
         viewRequest = null;
      }
      const head = cg.mMultiply(clay.inverseRootMatrix, clay.pose.transform.matrix);
      if (player.mode === 'world') {
         // left stick (or WASD) walks relative to where the head faces; right stick turns the whole village around you
         const x = (joyStickState.left.x || 0) + (keyIsDown(KEY_D) ? 1 : 0) - (keyIsDown(KEY_A) ? 1 : 0);
         const y = (joyStickState.left.y || 0) + (keyIsDown(KEY_S) ? 1 : 0) - (keyIsDown(KEY_W) ? 1 : 0);
         const length = Math.hypot(x, y), spin = joyStickState.right.x || 0;
         if (Math.abs(spin) > .25) turn += spin * 1.6 * dt;
         if (length > .2) {
            const yaw = Math.atan2(head[8], head[10]) - turn;
            const c = Math.cos(yaw), s = Math.sin(yaw);
            const step = 1.4 * dt / Math.max(1, length) / .5;   // 1.4 m/s, half a meter per cell
            movePlayer(state, (c * x + s * y) * step, (-s * x + c * y) * step);
         }
         const near = nearestResident(state, 2.5);
         for (const id of dismissed)
            if (nearestResident(state, 3.5)?.id !== id) dismissed.delete(id);
         talking = near && !dismissed.has(near.id) ? near.id : null;
         if (talking) state.selectedResident = talking;
         for (let i = 0; i < talkOptions.length; i++)
            if (talking && keyWentDown(49 + i)) choose(i);
         worldMatrix(head);
      }
      else {
         talking = null;
         board.identity().move(0, .8, -1.5);
      }
      const talker = talking && state.residents.find(item => item.id === talking);
      if (talker) {
         const [cx, cz] = roomPoint(talker.position, head);
         const away = Math.hypot(head[12] - cx, head[14] - cz) || 1;
         const back = Math.max(0, .9 - away) / away;                 // keep the card at least 0.9 m from the eyes
         talk.identity().move(cx + (cx - head[12]) * back, .95, cz + (cz - head[14]) * back)
             .turnY(Math.atan2(head[12] - cx, head[14] - cz)).scale(.55, .275, 1).opacity(1);
      }
      else talk.opacity(0);
      const resident = selectedResident(state);
      if (inVR) {
         const grip = !!buttonState.right[1]?.pressed;
         if (grip && !gripping && !panelHit && player.mode === 'god') {
            const cell = pointedCell();
            const region = cell && state.regions.find(region => isInRegion(cell.map(value => Math.round(value)), region));
            if (region) drag = { id: region.id, cell: region.cell.slice(),
               offset: [cell[0] - region.cell[0], cell[1] - region.cell[1]] };
         }
         if (drag) updateDrag();
         if (drag && !grip) finishDrag(true);
         gripping = grip;
      }
      else {
         finishDrag(false);
         gripping = false;
      }
      let remaining = dt * state.speed;
      while (remaining > 1e-9) {
         const step = Math.min(remaining, .05);
         stepWorld(state, step);
         remaining -= step;
      }
      for (const ai of brains.values()) ai.tick();
      if (mapRevision !== state.mapRevision) {
         mapRevision = state.mapRevision;
         drawRegions();
      }
      preview.opacity(drag ? .35 : 0);
      if (drag) {
         const region = state.regions.find(region => region.id === drag.id);
         const [x, z] = position(drag.cell);
         regionNodes.get(drag.id).identity().move(x, .04, z);
         const half = (region.size - 1) * cellSize / 2;
         preview.identity().move(x + half, .02, z + half).turnX(-Math.PI / 2)
                .scale(region.size * cellSize / 2, region.size * cellSize / 2, 1)
                .color(canPlaceRegion(state, drag.id, drag.cell) ? [.3, 1, .4] : [1, .15, .1]);
      }
      const version = resident.id + ':' + resident.pathVersion;
      if (pathVersion !== version) {
         pathVersion = version;
         while (route.nChildren()) route.remove(0);
         for (const cell of resident.path)
            box(route, cell, .015, cellSize * .22, .006, cellSize * .22, [1, .85, .2]);
      }
      for (const actor of state.residents) {
         const [x, z] = position(actor.position), view = views.get(actor.id);
         view.penger.update(x, z, actor.heading, actor.status === 'moving' && !actor.attending, dt * state.speed);
         view.name.identity().move(x, .13, z).scale(.013).info(actor.id === resident.id ? '[' + actor.name + ']' : actor.name);
         view.speech.identity().move(x, .18, z).scale(.0035)
            .info(actor.speech.until > state.time && actor.id !== talking ? actor.speech.text.slice(0, 52) : ' ');
      }
      const paintKey = JSON.stringify([resident.id, resident.behavior, Math.round(resident.needs.thirst * 100),
         Math.round(resident.needs.fatigue * 100), Math.round(resident.trust * 100), resident.reason,
         resident.ai.history.at(-1), resident.ai.dialogue.status, state.events.at(-1), state.speed, player.mode, hovered, hoveredResident]);
      if (inVR && paintKey !== previousPaint) {
         previousPaint = paintKey;
         paintDialogue(canvas, state, hovered, hoveredResident);
      }
      const talkKey = talker && JSON.stringify([talker.id, talker.ai.history.at(-1), talker.ai.dialogue.status,
         talker.behavior, talkHover]);
      if (talkKey && talkKey !== previousTalk) {
         previousTalk = talkKey;
         paintTalk(talkCanvas, state, talker, talkHover);
      }
      if (model.time >= lastUI) {
         lastUI = model.time + .2;
         ui.update(inVR);
      }
   });
};

export const deinit = (model, ctx, ctxForever) => ctxForever.disposeVillage?.();
