import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { findPath, isWalkable, interactionCells, perceive, planOptions, validatePlan,
   applyPlan, stepRabbit, stepWorld, snapshot, remember } from '../js/util/village.js';
import { createVillageAI } from '../js/util/villageAI.js';
import { createPenger } from '../js/util/pengerView.js';
import { questionAt } from '../js/util/villageUI.js';

const initialJSON = await readFile(new URL('../js/scenes/village.json', import.meta.url), 'utf8');
const createState = () => JSON.parse(initialJSON);
const clone = value => JSON.parse(JSON.stringify(value));
const response = value => ({ ok: true, json: async () => ({ response: JSON.stringify(value) }) });
const run = (state, seconds) => { for (let i = 0; i < Math.round(seconds * 20); i++) stepWorld(state, .05); };

function checkPath(state, path) {
   assert.ok(path.length);
   for (let i = 0; i < path.length; i++) {
      assert.ok(isWalkable(state, path[i]), 'path crosses blocked terrain: ' + path[i]);
      if (i) assert.equal(Math.abs(path[i][0] - path[i - 1][0]) + Math.abs(path[i][1] - path[i - 1][1]), 1);
   }
}

test('complex map has forests, two blocked water bodies and a house with reachable entry', () => {
   const state = createState();
   assert.deepEqual([state.grid.width, state.grid.depth], [24, 24]);
   assert.equal(state.regions.filter(region => region.kind === 'water').length, 2);
   assert.ok(state.regions.filter(region => region.kind === 'forest').length >= 2);
   for (const region of state.regions) {
      const path = findPath(state, state.rabbit.position, region);
      checkPath(state, path);
      assert.ok(interactionCells(state, region).some(cell => String(cell) === String(path.at(-1))));
      if (['water', 'house'].includes(region.kind)) assert.equal(isWalkable(state, region.cell), false);
      if (region.entry) assert.deepEqual(path.at(-1), region.entry);
   }
});

test('BFS matches independent distance relaxation across all 128 small obstacle layouts', () => {
   for (let mask = 0; mask < 128; mask++) {
      const state = { grid: { width: 3, depth: 3 }, regions: [], obstacles: [] };
      for (let i = 1; i < 8; i++)
         if (mask & (1 << (i - 1))) state.obstacles.push([i % 3, Math.floor(i / 3)]);
      const distances = Array(9).fill(Infinity);
      distances[0] = 0;
      for (let pass = 0; pass < 8; pass++)
         for (let a = 0; a < 9; a++)
            for (let b = 0; b < 9; b++)
               if (isWalkable(state, [a % 3, Math.floor(a / 3)]) && isWalkable(state, [b % 3, Math.floor(b / 3)]) &&
                   Math.abs(a % 3 - b % 3) + Math.abs(Math.floor(a / 3) - Math.floor(b / 3)) === 1)
                  distances[b] = Math.min(distances[b], distances[a] + 1);
      const path = findPath(state, [0, 0], { cell: [2, 2], size: 1 });
      assert.equal(path.length ? path.length - 1 : Infinity, distances[8]);
      if (path.length) checkPath(state, path);
   }
});

test('invalid or unreachable starts return no path', () => {
   const state = createState(), target = state.regions[1];
   for (const start of [[-1, 0], [24, 0], [0, 24], [.5, 1], target.cell])
      assert.deepEqual(findPath(state, start, target), []);
});

test('perception and AI snapshot contain only discovered locations and copied observations', () => {
   const state = createState();
   perceive(state);
   assert.deepEqual(state.rabbit.known.map(region => region.id), ['home']);
   assert.ok(!JSON.stringify(snapshot(state)).includes('north-lake'));
   assert.ok(!('obstacles' in snapshot(state)));
   state.rabbit.known[0].cell[0] = 99;
   assert.equal(state.regions[0].cell[0], 1);
});

test('autonomous simulation explores, discovers, drinks and rests without any AI', () => {
   const state = createState(), behaviors = new Set();
   let drank = false, rested = false;
   for (let i = 0; i < 6000; i++) {
      const before = clone(state.rabbit.needs);
      stepWorld(state, .05);
      behaviors.add(state.rabbit.behavior);
      if (state.rabbit.needs.thirst < before.thirst) drank = true;
      if (state.rabbit.needs.fatigue < before.fatigue) rested = true;
      assert.ok(isWalkable(state, state.rabbit.position.map(Math.round)));
   }
   for (const behavior of ['exploring', 'seekingWater', 'drinking', 'seekingHome', 'resting'])
      assert.ok(behaviors.has(behavior), behavior + ' never occurred');
   assert.ok(drank && rested);
   assert.equal(state.rabbit.known.length, state.regions.length);
   assert.ok(state.rabbit.memories.length <= 24);
   assert.ok(state.rabbit.memoryCount < 200, 'satisfied needs must not produce repeated drink/rest events');
});

test('urgent needs reject unknown, irrelevant and fabricated AI actions without mutation', () => {
   const state = createState();
   state.rabbit.known = clone(state.regions);
   state.rabbit.needs.thirst = .9;
   const before = clone(state);
   for (const plan of [null, {}, { action: 'teleport' }, { action: 'seekWater', target: 'imaginary' },
                       { action: 'seekHome', target: 'home' }, { action: 'explore', cell: [0, 0] }]) {
      assert.equal(validatePlan(state, plan), false);
      assert.equal(applyPlan(state, plan), false);
      assert.deepEqual(state, before);
   }
   const options = planOptions(state);
   assert.equal(options.length, 2);
   assert.ok(options.every(option => option.action === 'seekWater'));
});

test('mid-segment plan changes wait for a safe node instead of snapping or cutting corners', () => {
   const state = createState();
   perceive(state);
   applyPlan(state, planOptions(state)[0]);
   stepRabbit(state, .07);
   const position = state.rabbit.position.slice();
   assert.ok(position.some(value => !Number.isInteger(value)));
   state.rabbit.known = clone(state.regions);
   state.rabbit.needs.thirst = .9;
   assert.ok(applyPlan(state, planOptions(state)[0], 'ai'));
   assert.deepEqual(state.rabbit.position, position);
   assert.ok(state.rabbit.pendingPlan);
   stepRabbit(state, .5);
   assert.ok(state.rabbit.position.every(Number.isInteger));
   stepWorld(state, .001);
   assert.equal(state.rabbit.pendingPlan, null);
   assert.equal(state.rabbit.behavior, 'seekingWater');
   checkPath(state, [state.rabbit.position.map(Math.round), ...state.rabbit.path]);
});

test('JSON checkpoint resumes simulation identically including needs, memory and exploration', () => {
   const state = createState();
   run(state, 12.35);
   const restored = clone(state);
   for (let i = 0; i < 1000; i++) {
      stepWorld(state, .05);
      stepWorld(restored, .05);
   }
   assert.deepEqual(restored, state);
});

test('path movement is stable at 30, 60 and 90 FPS and cannot overshoot', () => {
   const states = [30, 60, 90].map(fps => {
      const state = createState();
      perceive(state);
      applyPlan(state, planOptions(state)[0]);
      for (let i = 0; i < fps; i++) stepRabbit(state, 1 / fps);
      return state;
   });
   for (const state of states.slice(1))
      for (let axis = 0; axis < 2; axis++)
         assert.ok(Math.abs(state.rabbit.position[axis] - states[0].rabbit.position[axis]) < 1e-10);
   stepRabbit(states[0], 100);
   assert.equal(states[0].rabbit.status, 'arrived');
   assert.deepEqual(states[0].rabbit.path, []);
});

test('blocked world produces a bounded stuck state', () => {
   const state = createState();
   const [x, z] = state.rabbit.position;
   state.obstacles.push([x - 1, z], [x + 1, z], [x, z - 1], [x, z + 1]);
   state.rabbit.needs.thirst = .9;
   run(state, 10);
   assert.equal(state.rabbit.behavior, 'stuck');
   assert.deepEqual(state.rabbit.position, [x, z]);
   assert.deepEqual(state.rabbit.path, []);
});

test('memory remains bounded and model text never becomes a world observation', () => {
   const state = createState();
   for (let i = 0; i < 40; i++) remember(state, 'test', 'event ' + i);
   assert.equal(state.rabbit.memories.length, 24);
   assert.equal(state.rabbit.memories[0].id, 17);
});

test('AI planner uses the existing endpoint and accepts only a validated option', async () => {
   const state = createState();
   run(state, .05);
   const option = planOptions(state)[0];
   let input;
   const ai = createVillageAI(state, { fetchImpl: async (url, options) => {
      assert.equal(url, '/api/aiquery');
      input = JSON.parse(options.body);
      return response(option);
   } });
   await ai.tick();
   assert.equal(input.provider, 'deepseek');
   assert.ok(!input.messages[1].content.includes('north-lake'));
   assert.equal(state.ai.planner.status, 'ready');
   assert.ok(state.rabbit.pendingPlan || state.rabbit.memories.some(memory => memory.type === 'plan'));
   ai.dispose();
});

test('late planner response cannot override a newer decision', async () => {
   const state = createState();
   perceive(state);
   let finish;
   const ai = createVillageAI(state, { fetchImpl: () => new Promise(resolve => { finish = resolve; }) });
   const pending = ai.tick();
   applyPlan(state, planOptions(state)[0]);
   const intent = state.rabbit.intent;
   finish(response({ action: 'explore', cell: [0, 0] }));
   await pending;
   assert.equal(state.ai.planner.status, 'stale');
   assert.equal(state.rabbit.intent, intent);
   ai.dispose();
});

test('invalid model plans are rejected while autonomous simulation continues', async () => {
   const state = createState();
   perceive(state);
   const ai = createVillageAI(state, { fetchImpl: async () => response({ action: 'teleport', target: 'moon' }) });
   await ai.tick();
   assert.equal(state.ai.planner.status, 'failed');
   run(state, 3);
   assert.notDeepEqual(state.rabbit.position, [3, 15]);
   ai.dispose();
});

test('dialogue is grounded in snapshot evidence and cannot change simulation state', async () => {
   const state = createState();
   run(state, 2);
   const before = clone(state.rabbit);
   const ai = createVillageAI(state, { fetchImpl: async () => response({ reply: 'A little expedition. Very important waddling business.', evidence: ['behavior'] }) });
   assert.equal(await ai.chat('What are you doing?'), 'A little expedition. Very important waddling business.');
   assert.deepEqual(state.rabbit, before);
   assert.equal(state.ai.history.at(-1).source, 'ai');
   assert.equal(state.ai.dialogue.status, 'ready');
   ai.dispose();
});

test('fabricated memory evidence falls back to actual state rather than model text', async () => {
   const state = createState();
   perceive(state);
   const ai = createVillageAI(state, { fetchImpl: async () => response({ reply: 'I visited the moon.', evidence: ['memory:999'] }) });
   const reply = await ai.chat('Any discoveries?');
   assert.ok(!reply.includes('moon'));
   assert.ok(reply.includes('Woodside Cottage'));
   assert.equal(state.ai.history.at(-1).source, 'state');
   assert.equal(state.ai.dialogue.status, 'failed');
   ai.dispose();
});

test('network failure leaves honest state replies and bounded conversation history', async () => {
   const state = createState();
   const ai = createVillageAI(state, { fetchImpl: async () => { throw new Error('offline'); } });
   for (let i = 0; i < 10; i++) assert.ok((await ai.chat('How are you?')).includes('Penger'));
   assert.equal(state.ai.history.length, 12);
   assert.equal(state.ai.dialogue.status, 'failed');
   run(state, 5);
   assert.notDeepEqual(state.rabbit.position, [3, 15]);
   ai.dispose();
});

test('disposing cancels pending requests and prevents late chat from changing state', async () => {
   const state = createState();
   let finish;
   const ai = createVillageAI(state, { fetchImpl: (url, options) => new Promise((resolve, reject) => {
      finish = resolve;
      options.signal.addEventListener('abort', () => reject(new Error('aborted')));
   }) });
   const pending = ai.chat('Hello!');
   ai.dispose();
   const before = clone(state);
   finish(response({ reply: 'late', evidence: ['behavior'] }));
   assert.equal(await pending, null);
   assert.deepEqual(state, before);
});

test('Penger reuses finite wireframe geometry with stable nodes throughout walking and idle', () => {
   const links = [];
   let nodes = 0;
   const node = () => {
      nodes++;
      const value = { add: () => node(), color: () => value, dull: () => value,
         identity: () => value, move: (...args) => { assert.ok(args.every(Number.isFinite)); return value; },
         turnY: angle => { assert.ok(Number.isFinite(angle)); return value; }, scale: () => value,
         link: (a, b, radius) => { links.push([a, b, radius]); return value; } };
      return value;
   };
   const penger = createPenger(node(), .05), count = nodes;
   for (let frame = 0; frame < 12; frame++) penger.update(0, 0, .3, frame < 10, 1 / 60);
   assert.equal(nodes, count);
   assert.ok(links.length > 1000);
   for (const [a, b, radius] of links) assert.ok([...a, ...b, radius].every(Number.isFinite));
});

test('VR controller hit coordinates select the correct question and reject gaps', () => {
   const hit = (x, y) => [x / 400 - 1, 1 - y / 190, 1];
   for (let i = 0; i < 3; i++) assert.equal(questionAt(hit(140 + i * 252, 331)), i);
   for (const point of [null, hit(10, 331), hit(266, 331), hit(790, 331), hit(140, 290), hit(140, 370)])
      assert.equal(questionAt(point), -1);
});

test('request timeout returns a state reply and releases the dialogue channel', async () => {
   const state = createState();
   const ai = createVillageAI(state, { timeoutMs: 5, fetchImpl: (url, options) => new Promise((resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(new Error('timeout')));
   }) });
   assert.ok((await ai.chat('How are you?')).includes('Penger'));
   assert.equal(state.ai.dialogue.status, 'failed');
   assert.ok((await ai.chat('Still there?')).includes('Penger'));
   ai.dispose();
});
