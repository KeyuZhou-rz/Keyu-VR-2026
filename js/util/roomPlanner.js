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
                  { role: 'system', content: 'You are the seeker in a Backrooms game. Plan the shortest route through connected rooms. Return only JSON like {"rooms":[3,1,0],"line":"I will check room 1 next."}. Include the start and goal, use only adjacent rooms, and never repeat a room. Put one brief, calm sentence in line, at most 100 plain ASCII English characters. Describe your intended next move; never claim a false current location or sighting. Avoid repeated taunts. The game handles actual movement and collisions.' },
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
