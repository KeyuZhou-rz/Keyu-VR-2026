import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stepWorld, perceive, applyPlan, planOptions, moveRegion,
   canPlaceRegion, exchangeNews, snapshot, isWalkable } from '../js/util/village.js';
import { createVillageAI } from '../js/util/villageAI.js';

const initial = JSON.parse(await readFile(new URL('../js/scenes/village.json', import.meta.url), 'utf8'));
const clone = value => JSON.parse(JSON.stringify(value));
const response = value => ({ ok: true, json: async () => ({ response: JSON.stringify(value) }) });
function world() {
   const state = clone(initial);
   state.grid = { width: 12, depth: 12, cellSize: .075 };
   state.regions = [
      { id: 'home', name: 'Cottage', kind: 'house', tags: ['shelter'], cell: [1, 9], size: 2, entry: [1, 8] },
      { id: 'pond', name: 'Pond', kind: 'water', tags: ['water'], cell: [8, 1], size: 2 },
   ];
   state.obstacles = [];
   state.residents.forEach((resident, i) => {
      resident.position = [1 + 2 * i, 7];
      resident.needs = { thirst: .1, fatigue: .1 };
   });
   return state;
}
function separated(state) {
   for (let i = 0; i < state.residents.length; i++)
      for (let j = i + 1; j < state.residents.length; j++) {
         const a = state.residents[i].position, b = state.residents[j].position;
         assert.ok(Math.hypot(a[0] - b[0], a[1] - b[1]) >= .99999,
            state.time + ': overlapping residents ' + a + ' / ' + b);
      }
}

test('one world clock advances once, while all residents keep independent needs and observations', () => {
   const state = world();
   state.residents[0].position = [7, 1];
   state.residents[0].sight = 1;
   stepWorld(state, .05);
   assert.equal(state.time, .05);
   assert.ok(state.residents.every(resident => resident.needs.thirst > .1));
   assert.ok(state.residents[0].known.some(place => place.id === 'pond'));
   assert.ok(!state.residents[1].known.some(place => place.id === 'pond'));
   assert.notEqual(state.residents[0].memories, state.residents[1].memories);
   assert.notEqual(state.residents[0].ai.history, state.residents[1].ai.history);
});

test('news travels A to B to C with its original source, changes C options, and cannot circulate back', () => {
   const state = world(), [a, b, c] = state.residents;
   [a, b, c].forEach((resident, i) => { resident.position = [7 - 2 * i, 1]; resident.sight = 1; });
   c.needs.thirst = .8;
   perceive(state, a);
   assert.ok(!planOptions(state, c).some(option => option.target === 'pond'));
   assert.equal(exchangeNews(state, a, c), false, 'out-of-range news cannot teleport');
   assert.ok(exchangeNews(state, a, b));
   assert.ok(exchangeNews(state, b, c));
   const heard = c.known.find(place => place.id === 'pond');
   assert.equal(heard.source, 'heard');
   assert.deepEqual(heard.observation.chain.map(link => link.id), [a.id, b.id]);
   assert.equal(heard.observation.origin, a.name);
   assert.ok(applyPlan(state, { action: 'seekWater', target: 'pond' }, 'rule', c));
   assert.equal(c.behavior, 'seekingWater');
   state.time = 9;
   a.position = [4, 1];
   assert.equal(exchangeNews(state, c, a), false);
   assert.equal(exchangeNews(state, c, b), false);
   assert.equal(state.events.filter(event => event.type === 'InformationShared').length, 2);
   c.position = [7, 2];
   perceive(state, c);
   assert.equal(c.known.find(place => place.id === 'pond').source, 'seen');
   assert.ok(c.memories.some(memory => memory.type === 'confirmed'));
});

test('new observations supersede stale reports without revealing an unobserved relocation', () => {
   const state = world(), [a, b, c] = state.residents;
   a.position = [7, 1]; b.position = [5, 1]; c.position = [3, 1];
   a.sight = b.sight = c.sight = 1;
   perceive(state, a); exchangeNews(state, a, b); exchangeNews(state, b, c);
   const oldReport = clone(c.known[0]);
   state.time = 10;
   assert.ok(moveRegion(state, 'pond', [8, 5]));
   assert.deepEqual(b.known[0].cell, [8, 1]);
   a.position = [7, 5]; b.position = [5, 5];
   perceive(state, a);
   exchangeNews(state, a, b);
   assert.deepEqual(b.known[0].cell, [8, 5]);
   assert.equal(b.known[0].source, 'heard');
   c.known = [oldReport]; c.position = [3, 5]; state.time = 20;
   exchangeNews(state, c, b);
   assert.deepEqual(b.known[0].cell, [8, 5]);
});

test('three tired residents take turns using one cottage and all receive a rest', () => {
   const state = world(), rested = new Set();
   for (const resident of state.residents) {
      resident.needs.fatigue = .85;
      perceive(state, resident);
      assert.ok(applyPlan(state, { action: 'seekHome', target: 'home' }, 'rule', resident));
   }
   assert.deepEqual(state.restQueues.home, state.residents.map(resident => resident.id));
   assert.equal(state.residents.filter(resident => resident.waitingFor === 'home').length, 2);
   for (let i = 0; i < 600; i++) {
      stepWorld(state, .05);
      separated(state);
      const using = state.residents.filter(resident => resident.behavior === 'resting');
      assert.ok(using.length <= 1);
      for (const resident of using) rested.add(resident.id);
   }
   assert.equal(rested.size, 3);
});

test('residents heading toward each other can yield without swapping through occupied cells', () => {
   const state = world();
   state.regions = [];
   state.residents = state.residents.slice(0, 2);
   state.residents[0].position = [2, 2]; state.residents[1].position = [3, 2];
   const goals = [[5, 2], [0, 2]];
   state.residents.forEach((resident, i) => {
      resident.plan = { action: 'explore', cell: goals[i] };
      resident.path = i === 0 ? [[3, 2], [4, 2], [5, 2]] : [[2, 2], [1, 2], [0, 2]];
      resident.status = 'moving';
      resident.nextDecision = resident.nextSense = 1000;
   });
   for (let i = 0; i < 200; i++) {
      stepWorld(state, .05);
      separated(state);
   }
   assert.deepEqual(state.residents.map(resident => resident.position), goals);
});

test('placement protects every resident and their reserved movement segment', () => {
   const state = world(), pip = state.residents[1];
   pip.position = [5.2, 7]; pip.segmentFrom = [5, 7]; pip.path = [[6, 7]];
   assert.equal(canPlaceRegion(state, 'pond', [5, 7]), false);
   assert.equal(canPlaceRegion(state, 'pond', [6, 7]), false);
   assert.equal(canPlaceRegion(state, 'pond', [1, 7]), false);
});

test('only direct witnesses protest repeated player moves, avoid the disturbed water, then recover', () => {
   const state = world(), [a, b, c] = state.residents;
   state.regions.push({ id: 'other', name: 'Other Pond', kind: 'water', tags: ['water'], cell: [8, 8], size: 2 });
   a.position = [7, 8]; perceive(state, a);
   a.position = [6, 2]; a.sight = 3; a.needs.thirst = .8; perceive(state, a);
   b.position = [0, 11]; c.position = [3, 11]; b.sight = c.sight = 1;
   for (const cell of [[8, 2], [8, 1], [8, 2]]) assert.ok(moveRegion(state, 'pond', cell, 'player'));
   assert.equal(a.trust, .75);
   assert.equal(b.trust, 1); assert.equal(c.trust, 1);
   assert.equal(a.surprise.kind, 'disturbed');
   assert.equal(state.events.filter(event => event.type === 'Protest').length, 1);
   assert.ok(!planOptions(state, a).some(option => option.target === 'pond'));
   assert.ok(applyPlan(state, { action: 'seekWater', target: 'other' }, 'rule', a));
   assert.equal(a.target, 'other');
   for (let i = 0; i < 800; i++) stepWorld(state, .05);
   assert.equal(a.avoid.pond, undefined);
   assert.ok(a.trust > .75);
});

test('an unseen player move cannot lower trust or leak player attribution into a snapshot', () => {
   const state = world(), a = state.residents[0];
   a.position = [7, 1]; a.sight = 1; perceive(state, a);
   a.position = [1, 1];
   for (const cell of [[8, 2], [8, 1], [8, 2]]) assert.ok(moveRegion(state, 'pond', cell, 'player'));
   assert.equal(a.trust, 1);
   assert.equal(a.disturbances.length, 0);
   assert.deepEqual(a.known[0].cell, [8, 1]);
   assert.ok(!snapshot(state, a).memories.some(memory => memory.type === 'witnessedMove'));
   assert.ok(!('events' in snapshot(state, a)));
});

test('AI replies stay with their resident when the selected conversation changes mid-request', async () => {
   const state = world(), [a, b] = state.residents;
   let finish;
   const aiA = createVillageAI(state, { resident: a, fetchImpl: () => new Promise(resolve => { finish = resolve; }) });
   const aiB = createVillageAI(state, { resident: b, fetchImpl: async () => response({ reply: 'Pip here. Very ready for a nap.', evidence: ['needs'] }) });
   const pending = aiA.chat('How are you?');
   state.selectedResident = b.id;
   await aiB.chat('How are you?');
   finish(response({ reply: 'Penger here. Expedition time!', evidence: ['behavior'] }));
   await pending;
   assert.equal(a.ai.history.at(-1).content, 'Penger here. Expedition time!');
   assert.equal(b.ai.history.at(-1).content, 'Pip here. Very ready for a nap.');
   assert.ok(!snapshot(state, a).nearby.some(other => 'memories' in other || 'needs' in other));
   aiA.dispose(); aiB.dispose();
});

test('the real village runs three residents for three simulated minutes without collisions or AI', () => {
   const state = clone(initial), drank = new Set(), rested = new Set();
   assert.ok(state.residents.every(resident => isWalkable(state, resident.position)));
   for (let i = 0; i < 3600; i++) {
      stepWorld(state, .05);
      separated(state);
      for (const resident of state.residents) {
         if (resident.behavior === 'drinking') drank.add(resident.id);
         if (resident.behavior === 'resting') rested.add(resident.id);
      }
   }
   assert.equal(drank.size, 3);
   assert.equal(rested.size, 3);
   assert.ok(state.events.some(event => event.type === 'InformationShared'));
   const restored = clone(state);
   for (let i = 0; i < 100; i++) { stepWorld(state, .05); stepWorld(restored, .05); }
   assert.deepEqual(restored, state);
});
