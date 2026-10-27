import * as cg from '../render/core/cg.js';
import { ControllerBeam, buttonState } from '../render/core/controllerInput.js';
import { stepWorld, isInRegion, canPlaceRegion, moveRegion, selectedResident } from '../util/village.js';
import { createVillageAI } from '../util/villageAI.js';
import { createPenger } from '../util/pengerView.js';
import { createVillageUI, paintDialogue, questions, questionAt, residentAt, speedAt } from '../util/villageUI.js';

export const init = async (model, ctx, ctxForever = {}) => {
   ctxForever.disposeVillage?.();
   const response = await fetch(new URL('./village.json', import.meta.url), { cache: 'no-store' });
   if (!response.ok) throw new Error('Cannot load village.json: ' + response.status);
   const state = await response.json();
   window.villageState = state;
   const brains = new Map(state.residents.map(resident => [resident.id, createVillageAI(state, { resident })]));
   const ui = createVillageUI(state, { chat: question => brains.get(selectedResident(state).id).chat(question) });

   const board = model.add().move(0, .8, -1.5);
   const { width, depth, cellSize } = state.grid;
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
   let pathVersion = '', drag = null, gripping = false, panelHit = null, hoveredResident = -1;

   const canvas = document.createElement('canvas');
   canvas.width = 800;
   canvas.height = 380;
   canvas._animate = true;
   const panel = model.add('square').setTxtr(canvas, 10, false).color([1, 1, 1]).dull();
   const beam = new ControllerBeam(model, 'right');
   const updatePointer = () => {
      panelHit = null;
      hoveredResident = -1;
      beam.isEnabled = window.isXR();
      beam.update();
      panel.opacity(beam.isEnabled ? 1 : 0);
      if (!beam.isEnabled) return -1;
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
   const handlers = {
      onPress(hand) {
         if (hand !== 'right') return;
         const hovered = updatePointer();
         if (!beam.isEnabled) return;
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
   let previousPaint = '', lastUI = 0;
   model.animate(() => {
      const dt = Math.min(model.deltaTime, .05), resident = selectedResident(state);
      const hovered = updatePointer(), inVR = beam.isEnabled;
      if (inVR) {
         const grip = !!buttonState.right[1]?.pressed;
         if (grip && !gripping && !panelHit) {
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
         view.penger.update(x, z, actor.heading, actor.status === 'moving', dt * state.speed);
         view.name.identity().move(x, .13, z).scale(.013).info(actor.id === resident.id ? '[' + actor.name + ']' : actor.name);
         view.speech.identity().move(x, .18, z).scale(.0035)
            .info(actor.speech.until > state.time ? actor.speech.text.slice(0, 52) : ' ');
      }
      const paintKey = JSON.stringify([resident.id, resident.behavior, Math.round(resident.needs.thirst * 100),
         Math.round(resident.needs.fatigue * 100), Math.round(resident.trust * 100), resident.reason,
         resident.ai.history.at(-1), resident.ai.dialogue.status, state.events.at(-1), state.speed, hovered, hoveredResident]);
      if (inVR && paintKey !== previousPaint) {
         previousPaint = paintKey;
         paintDialogue(canvas, state, hovered, hoveredResident);
      }
      if (model.time >= lastUI) {
         lastUI = model.time + .2;
         ui.update(inVR);
      }
   });
};

export const deinit = (model, ctx, ctxForever) => ctxForever.disposeVillage?.();
