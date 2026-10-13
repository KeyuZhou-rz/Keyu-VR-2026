export function createRoomPlanner(connections) {
   const cache = new Map();
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
                  { role: 'system', content: 'Plan the shortest monster chase route through connected rooms. Return only JSON like {"rooms":[3,1,0]}. Include the start and goal, use only adjacent rooms, and never repeat a room.' },
                  { role: 'user', content: JSON.stringify({ connections, from, to }) }
               ],
               response_format: { type: 'json_object' },
               max_tokens: 128
            })
         });
         const data = await response.json();
         if (!active || controller.signal.aborted) return;
         if (!response.ok) throw new Error(data.details || data.error || 'AI request failed');
         state.reply = data.message?.content || data.response || '(empty reply)';
         const path = JSON.parse(state.reply).rooms;
         if (!Array.isArray(path) || path.length > connections.length ||
             path[0] !== from || path[path.length - 1] !== to ||
             new Set(path).size !== path.length ||
             !path.every(room => Number.isInteger(room) && room >= 0 && room < connections.length) ||
             !path.every((room, i) => i === 0 || connections[path[i - 1]].includes(room)))
            throw new Error('Invalid room route');
         for (let i = 0; i < path.length; i++) cache.set(path[i] + ',' + to, path.slice(i));
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
      dispose() {
         active = false;
         pending?.abort();
      }
   };
}
