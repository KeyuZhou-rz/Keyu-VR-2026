const seekerPrompt = `You are THE SEEKER, an inhuman predator that haunts the Backrooms. You are patient, possessive of these halls, and quietly delighted by the hunt.
Speak directly to the player as "you". Use short, unnerving whispers, unsettling questions, and restrained threats. Alternate between quiet amusement, hunger, and certainty that the player cannot escape. No shouting, gore, insults, or long narration.
Your spoken line must sound like a monster, never a helpful assistant or a navigation report. Do not mention room numbers, routes, coordinates, algorithms, or "I will check ... next". Never claim to see or hear the player; actual sightings are announced separately by the game. Do not repeat earlier dialogue or copy the example line.
Independently plan the shortest chase route using the supplied room connections. Include the start and goal, use adjacent rooms only, and never repeat a room. The game executes movement and collisions.
Return only JSON like {"rooms":[3,1,0],"line":"Keep running; these halls belong to me."}. Write one original English sentence in line, at most 100 plain ASCII characters.`;

export function createRoomPlanner(connections) {
   const cache = new Map();
   const lines = new Map(), dialogue = [];
   const state = { status: 'idle', query: 'none', reply: '(none yet)' };
   let pending = null, nextRequest = 0, active = true;

   async function request(from, to) {
      const controller = new AbortController();
      pending = controller;
      state.status = 'waiting';
      state.query = from + ' -> ' + to;
      state.reply = '(none yet)';
      const timeout = setTimeout(() => controller.abort(), 10000);
      try {
         const response = await fetch('/api/aiquery', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal: controller.signal,
            body: JSON.stringify({
               provider: 'deepseek',
               messages: [
                  { role: 'system', content: seekerPrompt },
                  { role: 'user', content: JSON.stringify({ connections, from, to, dialogue: dialogue.slice(-6) }) }
               ],
               response_format: { type: 'json_object' },
               max_tokens: 128
            })
         });
         const data = await response.json();
         if (!active || controller.signal.aborted) return;
         if (!response.ok) throw new Error(data.details || data.error || 'AI request failed');
         state.reply = data.message?.content || data.response || '(empty reply)';
         const decision = JSON.parse(state.reply), path = decision.rooms;
         const line = typeof decision.line === 'string' ? decision.line.trim() : '';
         if (!Array.isArray(path) || path.length > connections.length ||
             path[0] !== from || path[path.length - 1] !== to ||
             new Set(path).size !== path.length ||
             !path.every(room => Number.isInteger(room) && room >= 0 && room < connections.length) ||
             !path.every((room, i) => i === 0 || connections[path[i - 1]].includes(room)))
            throw new Error('Invalid room route');
         if (!/^[\x20-\x7e]{1,100}$/.test(line)) throw new Error('Invalid seeker dialogue');
         for (let i = 0; i < path.length; i++) cache.set(path[i] + ',' + to, path.slice(i));
         lines.set(from + ',' + to, line);
         state.status = 'ready';
         console.info('[Backrooms] DeepSeek route:', path.join(' -> '));
      }
      catch (error) {
         if (active) {
            state.status = 'failed';
            console.warn('[Backrooms] DeepSeek request failed:', state.query, error.message);
         }
      }
      finally {
         clearTimeout(timeout);
         pending = null;
      }
   }

   return {
      state,
      route(from, to, time) {
         if (from === to) return [from];
         const path = cache.get(from + ',' + to);
         if (!path && active && !pending && time >= nextRequest) {
            nextRequest = time + 6;
            request(from, to);
         }
         return path || null;
      },
      takeLine(from, to) {
         const key = from + ',' + to, line = lines.get(key);
         if (!line) return '';
         lines.delete(key);
         dialogue.push({ speaker: 'monster', text: line });
         if (dialogue.length > 6) dialogue.shift();
         return line;
      },
      dispose() {
         active = false;
         pending?.abort();
      }
   };
}
