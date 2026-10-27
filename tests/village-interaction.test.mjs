import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { blockedCells, canPlaceRegion, moveRegion, perceive, applyPlan, stepWorld,
   stepResident, planOptions, snapshot, interactionCells } from '../js/util/village.js';
import { createVillageAI } from '../js/util/villageAI.js';
import * as cg from '../js/render/core/cg.js';

const initial = JSON.parse(await readFile(new URL('../js/scenes/village.json', import.meta.url), 'utf8'));
const clone = value => JSON.parse(JSON.stringify(value));
const response = value => ({ ok: true, json: async () => ({ response: JSON.stringify(value) }) });
function world() {
   const state = clone(initial);
   state.residents = state.residents.slice(0, 1);
   state.grid = { width: 20, depth: 20, cellSize: .075 };
   state.regions = [{ id: 'pond', name: 'Pond', kind: 'water', tags: ['water'], cell: [4, 4], size: 2 }];
   state.obstacles = [];
   state.residents[0].position = [1, 4];
   state.residents[0].speed = 2;
   state.residents[0].sight = 2;
   state.residents[0].needs.thirst = .9;
   state.residents[0].known = [{ ...clone(state.regions[0]), status: 'present' }];
   return state;
}
function reachMissing(state) {
   for (let i = 0; i < 100 && !state.residents[0].surprise; i++) stepWorld(state, .05);
   assert.ok(state.residents[0].surprise, 'expected an old-location failure');
}
function movePond(state) {
   assert.ok(applyPlan(state, { action: 'seekWater', target: 'pond' }));
   assert.ok(moveRegion(state, 'pond', [13, 1]));
}

test('moving a place commits one world event without changing any agent knowledge', () => {
   const state = world(), before = clone(state.residents[0]);
   assert.ok(moveRegion(state, 'pond', [13, 1]));
   assert.deepEqual(state.residents[0], before);
   assert.equal(state.mapRevision, 1);
   assert.deepEqual(state.events[0], { type: 'ObjectMoved', time: 0, target: 'pond', from: [4, 4], to: [13, 1] });
   assert.deepEqual(state.residents[0].known[0].cell, [4, 4]);
   assert.ok(!blockedCells(state).has('4,4'));
   assert.ok(blockedCells(state).has('13,1'));
});

test('house entry and forest-local trunks move with their owning region', () => {
   const state = world();
   state.regions.push({ id: 'home', kind: 'house', cell: [2, 10], size: 3, entry: [3, 9] },
                      { id: 'forest', kind: 'forest', cell: [2, 2], size: 2, obstacles: [[1, 1]] });
   state.obstacles = [[7, 7]];
   assert.ok(moveRegion(state, 'home', [10, 9]));
   assert.deepEqual(state.regions[1].entry, [11, 8]);
   assert.ok(moveRegion(state, 'forest', [10, 3]));
   assert.ok(blockedCells(state).has('11,4'));
   assert.ok(!blockedCells(state).has('3,3'));
   assert.deepEqual(state.regions[2].obstacles, [[1, 1]]);
   assert.deepEqual(state.obstacles, [[7, 7]]);
});

test('invalid placement rejects bounds, overlap, fixed obstacles, the actor and unsafe entry', () => {
   const state = world();
   state.regions.push({ id: 'home', kind: 'house', cell: [2, 10], size: 3, entry: [3, 9] });
   state.obstacles = [[9, 9]];
   const before = clone(state);
   for (const [id, cell] of [['pond', [-1, 1]], ['pond', [19, 1]], ['pond', [2, 10]],
                             ['pond', [9, 9]], ['pond', [1, 4]], ['pond', [2.5, 2]], ['home', [0, 0]]]) {
      assert.equal(canPlaceRegion(state, id, cell), false);
      assert.equal(moveRegion(state, id, cell), false);
      assert.deepEqual(state, before);
   }
});

test('a moving actor reserves the next safe node for finishing its current segment', () => {
   const state = world();
   state.residents[0].position = [1.1, 4];
   state.residents[0].path = [[2, 4], [3, 4]];
   assert.equal(canPlaceRegion(state, 'pond', [2, 4]), false);
});

test('old-address arrival records missing, invalidates belief and does not invent a new location', () => {
   const state = world();
   movePond(state);
   reachMissing(state);
   assert.deepEqual(state.residents[0].position, [3, 4]);
   assert.equal(state.residents[0].known[0].status, 'missing');
   assert.deepEqual(state.residents[0].known[0].cell, [4, 4]);
   assert.equal(state.residents[0].behavior, 'stuck');
   const memory = state.residents[0].memories.find(item => item.type === 'expectedObjectMissing');
   assert.deepEqual(memory.expectedCell, [4, 4]);
   assert.equal(state.residents[0].surprise.memoryId, memory.id);
   assert.ok(!planOptions(state).some(option => option.target === 'pond'));
   const context = snapshot(state);
   assert.ok(!('events' in context));
   assert.ok(!context.known.some(region => String(region.cell) === '13,1'));
});

test('path failure alone cannot mark a remembered place missing', () => {
   const state = world();
   state.regions[0].cell = [4, 3];
   state.residents[0].known[0].cell = [4, 3];
   for (let x = 0; x < 20; x++)
      for (let z = 0; z < 20; z++)
         if (z !== 4) state.obstacles.push([x, z]);
   state.regions.push({ id: 'forest', name: 'Woods', tags: ['forest'], kind: 'forest', cell: [10, 10], size: 1, obstacles: [[0, 0]] });
   assert.ok(applyPlan(state, { action: 'seekWater', target: 'pond' }));
   assert.ok(moveRegion(state, 'forest', [3, 4]));
   for (let i = 0; i < 40; i++) stepWorld(state, .05);
   assert.equal(state.residents[0].known.find(item => item.id === 'pond').status, 'present');
   assert.ok(!state.residents[0].memories.some(item => item.type === 'expectedObjectMissing'));
   assert.equal(state.residents[0].behavior, 'stuck');
});

test('moving the water during drinking immediately stops need relief', () => {
   const state = world();
   state.residents[0].position = [3, 4];
   state.residents[0].behavior = 'drinking';
   state.residents[0].status = 'arrived';
   state.residents[0].target = 'pond';
   state.residents[0].plan = { action: 'seekWater', target: 'pond' };
   const thirst = state.residents[0].needs.thirst;
   assert.ok(moveRegion(state, 'pond', [13, 1]));
   stepWorld(state, .05);
   assert.ok(state.residents[0].needs.thirst >= thirst);
   assert.equal(state.residents[0].known[0].status, 'missing');
   assert.equal(state.residents[0].behavior, 'stuck');
});

test('map changes replan at a grid node without snapping a moving character', () => {
   const state = world();
   assert.ok(applyPlan(state, { action: 'seekWater', target: 'pond' }));
   stepResident(state, .1);
   assert.deepEqual(state.residents[0].position, [1.2, 4]);
   assert.ok(moveRegion(state, 'pond', [13, 1]));
   for (let i = 0; i < 12; i++) {
      const before = state.residents[0].position.slice();
      stepWorld(state, .05);
      assert.ok(Math.hypot(state.residents[0].position[0] - before[0], state.residents[0].position[1] - before[1]) <= .1000001);
   }
   assert.equal(state.residents[0].routeRevision, state.mapRevision);
});

test('rediscovery updates the same identity only after the new location is observed', () => {
   const state = world();
   movePond(state);
   reachMissing(state);
   state.residents[0].position = [12, 1];
   perceive(state);
   assert.equal(state.residents[0].known.length, 1);
   assert.equal(state.residents[0].known[0].status, 'present');
   assert.deepEqual(state.residents[0].known[0].cell, [13, 1]);
   assert.ok(state.residents[0].memories.some(item => item.type === 'rediscovered'));
});

test('an absent forest is noticed while visiting its remembered ground', () => {
   const state = world();
   state.regions.push({ id: 'forest', name: 'Woods', kind: 'forest', cell: [1, 3], size: 2, tags: ['forest'], obstacles: [] });
   state.residents[0].known.push({ ...clone(state.regions[1]), status: 'present' });
   assert.ok(moveRegion(state, 'forest', [10, 10]));
   perceive(state);
   assert.equal(state.residents[0].known[1].status, 'missing');
   assert.equal(state.residents[0].surprise.target, 'forest');
});

test('after missing a moved pond, autonomous search can rediscover it and drink at its actual shore', () => {
   const state = world();
   movePond(state);
   reachMissing(state);
   let drank = false;
   for (let i = 0; i < 8000 && !drank; i++) {
      stepWorld(state, .05);
      drank = state.residents[0].behavior === 'drinking';
   }
   assert.ok(drank);
   assert.deepEqual(state.residents[0].known[0].cell, [13, 1]);
   assert.ok(interactionCells(state, state.regions[0]).some(cell => String(cell) === String(state.residents[0].position)));
});

test('AI reacts to an observed absence immediately and only once, with no hidden relocation data', async () => {
   const state = world();
   let reactionContext, requests = 0;
   const ai = createVillageAI(state, { fetchImpl: async (url, options) => {
      requests++;
      const context = JSON.parse(JSON.parse(options.body).messages[1].content);
      if (!context.surprise) return response(context.options[0]);
      reactionContext = context;
      return response({ ...context.options[0], reply: "The water used to be here. Did I take a wrong waddle? I'll have a look around.",
         evidence: ['memory:' + context.surprise.memoryId] });
   } });
   await ai.tick();
   movePond(state);
   reachMissing(state);
   assert.ok(state.time < 12);
   await ai.tick();
   assert.equal(state.residents[0].ai.history.at(-1).source, 'ai');
   assert.equal(state.residents[0].surprise.handled, true);
   assert.equal(reactionContext.known[0].status, 'missing');
   assert.deepEqual(reactionContext.known[0].cell, [4, 4]);
   assert.ok(!('events' in reactionContext));
   const count = requests;
   await ai.tick();
   assert.equal(requests, count);
   ai.dispose();
});

test('AI outage keeps a factual reaction and lets the actor continue searching', async () => {
   const state = world();
   movePond(state);
   reachMissing(state);
   const ai = createVillageAI(state, { fetchImpl: async () => { throw new Error('offline'); } });
   await ai.tick();
   assert.equal(state.residents[0].ai.history.at(-1).source, 'state');
   assert.ok(state.residents[0].ai.history.at(-1).content.includes('used to be here'));
   for (let i = 0; i < 50; i++) stepWorld(state, .05);
   assert.notDeepEqual(state.residents[0].position, [3, 4]);
   ai.dispose();
});

test('relocation during an AI request rejects the outdated plan', async () => {
   const state = world();
   let finish;
   const ai = createVillageAI(state, { fetchImpl: () => new Promise(resolve => { finish = resolve; }) });
   const request = ai.tick();
   assert.ok(moveRegion(state, 'pond', [13, 1]));
   finish(response({ action: 'seekWater', target: 'pond' }));
   await request;
   assert.equal(state.residents[0].ai.planner.status, 'stale');
   assert.equal(state.residents[0].plan, null);
   ai.dispose();
});

test('every region in the actual map has at least one valid new placement', () => {
   for (const region of initial.regions) {
      let found = false;
      for (let x = 0; x < initial.grid.width && !found; x++)
         for (let z = 0; z < initial.grid.depth && !found; z++)
            if (String(region.cell) !== String([x, z]) && canPlaceRegion(initial, region.id, [x, z])) found = true;
      assert.ok(found, region.id + ' cannot be moved anywhere');
   }
});

test('a relocation checkpoint preserves world events, old beliefs and subsequent simulation', () => {
   const state = world();
   movePond(state);
   reachMissing(state);
   const restored = clone(state);
   for (let i = 0; i < 200; i++) {
      stepWorld(state, .05);
      stepWorld(restored, .05);
   }
   assert.deepEqual(restored, state);
});

test('controller ray projection converts back to board cells under a shifted VR origin', () => {
   const { width, depth, cellSize } = initial.grid;
   const board = cg.mTranslate(0, .8, -1.5);
   const worldOrigin = cg.mMultiply(cg.mTranslate(2, 0, -3), cg.mRotateY(.7));
   const surface = cg.mMultiply(cg.mMultiply(worldOrigin, board),
      cg.mMultiply(cg.mRotateX(-Math.PI / 2), cg.mScale(width * cellSize / 2, depth * cellSize / 2, 1)));
   for (const cell of [[1, 2], [12, 12], [21, 20]]) {
      const x = (cell[0] - (width - 1) / 2) * cellSize;
      const z = (cell[1] - (depth - 1) / 2) * cellSize;
      const beam = cg.mMultiply(cg.mMultiply(worldOrigin, board),
         cg.mMultiply(cg.mTranslate(x, 1, z), cg.mRotateX(-Math.PI / 2)));
      const hit = cg.mHitRect(beam, surface);
      assert.ok(hit);
      const hitWorld = cg.subtract(beam.slice(12, 15), cg.scale(beam.slice(8, 11), hit[2]));
      const common = cg.mTransform(cg.mInverse(worldOrigin), hitWorld);
      const local = cg.mTransform(cg.mInverse(board), common);
      const actual = [local[0] / cellSize + (width - 1) / 2, local[2] / cellSize + (depth - 1) / 2];
      assert.ok(Math.abs(actual[0] - cell[0]) < 1e-9);
      assert.ok(Math.abs(actual[1] - cell[1]) < 1e-9);
   }
});
