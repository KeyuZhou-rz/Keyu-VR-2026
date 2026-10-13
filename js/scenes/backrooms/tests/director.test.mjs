import test from 'node:test';
import assert from 'node:assert/strict';
import { Director, readDecision } from '../director.js';
import { Game } from '../simulation.js';
import { buildWorld } from '../geometry.js';
const reply = (region = 'pool') => ({
   state: { lastModel: 'deepseek-flash' },
   message: {
      tool_calls: [
         {
            function: {
               name: 'moveToRegion',
               arguments: JSON.stringify({ region, line: 'Checking the pool.' })
            }
         }
      ]
   }
});
test('course AI response is parsed, invalid tools and targets are rejected', () => {
   assert.equal(readDecision(reply()).region, 'pool');
   assert.throws(() => readDecision(reply('outside')), /region/);
   assert.throws(
      () => readDecision({ message: { tool_calls: [{ function: { name: 'eval', arguments: '{}' } }] } }),
      /action/
   );
});
test('director uses the existing 2026 endpoint, limited tools and actual game observations', async () => {
   const original = globalThis.fetch,
      game = new Game();
   try {
      globalThis.fetch = async (url, options) => {
         assert.equal(url, '/api/aiquery');
         const body = JSON.parse(options.body),
            state = JSON.parse(body.messages[1].content);
         assert.equal(body.tools.length, 4);
         assert.equal(body.tool_choice, 'required');
         assert.equal('player' in state, false);
         assert.equal('model' in body, false);
         return { ok: true, json: async () => reply() };
      };
      const lines = [],
         director = new Director(
            game,
            () => {},
            (line) => lines.push(line)
         );
      await director.request();
      assert.equal(game.control, 'llm');
      assert.equal(game.monster.targetRegion, 'pool');
      assert.deepEqual(lines, ['Checking the pool.']);
   } finally {
      globalThis.fetch = original;
   }
});
test('course AI failure leaves the realtime game searching', async () => {
   const original = globalThis.fetch,
      game = new Game();
   try {
      globalThis.fetch = async () => ({ ok: false });
      const director = new Director(
         game,
         () => {},
         () => {}
      );
      await director.request();
      for (let i = 0; i < 500; i++) game.step(0.02);
      assert.equal(game.control, 'fallback');
      assert.ok(game.monster.path.length || game.monster.mode === 'search');
   } finally {
      globalThis.fetch = original;
   }
});
test('Clay triangle data has finite vertices and constant material on each triangle', () => {
   const geometry = buildWorld(new Game().world);
   assert.ok(geometry.mesh.length > 1000);
   assert.ok(geometry.signs.length > 0);
   for (const data of [geometry.mesh, geometry.signs]) {
      assert.equal(data.length % 3, 0);
      for (const vertex of data) {
         assert.equal(vertex.length, 8);
         assert.ok(vertex.every(Number.isFinite));
      }
   }
   for (let i = 0; i < geometry.mesh.length; i += 3)
      assert.ok(
         geometry.mesh[i][6] === geometry.mesh[i + 1][6] &&
            geometry.mesh[i][6] === geometry.mesh[i + 2][6]
      );
});
