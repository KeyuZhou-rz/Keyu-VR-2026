const directions = [[1, 0], [0, 1], [-1, 0], [0, -1]];
const key = cell => cell.join(',');
const same = (a, b) => a[0] === b[0] && a[1] === b[1];
const onGrid = cell => cell.every(Number.isInteger);
const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

export const selectedResident = state => state.residents.find(resident => resident.id === state.selectedResident) || state.residents[0];

function event(state, item) {
   state.events.push({ time: state.time, ...item });
   if (state.events.length > 48) state.events.shift();
}

export function say(state, resident, text, source = 'state') {
   resident.speech = { text, until: state.time + 8 };
   resident.ai.history.push({ role: 'assistant', content: text, source, time: state.time });
   if (resident.ai.history.length > 12) resident.ai.history.splice(0, resident.ai.history.length - 12);
}

function nearRegion(resident, region) {
   const [x, z] = resident.position;
   return Math.hypot(Math.max(region.cell[0] - x, 0, x - region.cell[0] - region.size + 1),
                     Math.max(region.cell[1] - z, 0, z - region.cell[1] - region.size + 1)) <= resident.sight;
}

function reservedCells(resident) {
   return onGrid(resident.position) ? [resident.position] :
      [resident.segmentFrom || resident.position.map(Math.round), ...resident.path.slice(0, 1)];
}

function occupiedCells(state, resident) {
   const cells = new Set();
   for (const other of state.residents) {
      if (other === resident) continue;
      for (const cell of reservedCells(other)) cells.add(key(cell));
   }
   return cells;
}

export function isInRegion([x, z], region) {
   return x >= region.cell[0] && x < region.cell[0] + region.size &&
          z >= region.cell[1] && z < region.cell[1] + region.size;
}

export function blockedCells(state) {
   const blocked = new Set(state.obstacles.map(key));
   for (const region of state.regions) {
      for (const [x, z] of region.obstacles || [])
         blocked.add(key([region.cell[0] + x, region.cell[1] + z]));
      if (region.kind === 'water' || region.kind === 'house')
         for (let x = region.cell[0]; x < region.cell[0] + region.size; x++)
            for (let z = region.cell[1]; z < region.cell[1] + region.size; z++)
               blocked.add(key([x, z]));
   }
   return blocked;
}

export function canPlaceRegion(state, id, cell) {
   const region = state.regions.find(region => region.id === id);
   if (!region || !onGrid(cell)) return false;
   const [x, z] = cell, size = region.size;
   if (x < 0 || z < 0 || x + size > state.grid.width || z + size > state.grid.depth) return false;
   for (const other of state.regions)
      if (other.id !== id && x < other.cell[0] + other.size && x + size > other.cell[0] &&
          z < other.cell[1] + other.size && z + size > other.cell[1]) return false;
   if (state.obstacles.some(([ox, oz]) => ox >= x && ox < x + size && oz >= z && oz < z + size)) return false;
   const occupied = state.residents.flatMap(resident => [resident.position,
      ...(!onGrid(resident.position) && resident.path.length ? [resident.path[0], resident.segmentFrom].filter(Boolean) : [])]);
   if (occupied.some(([px, pz]) => px > x - .9 && px < x + size - .1 &&
                                   pz > z - .9 && pz < z + size - .1)) return false;
   if (region.entry) {
      const entry = [region.entry[0] + x - region.cell[0], region.entry[1] + z - region.cell[1]];
      const candidate = { ...region, cell, entry };
      if (!isWalkable({ ...state, regions: state.regions.map(item => item.id === id ? candidate : item) }, entry)) return false;
   }
   return true;
}

export function moveRegion(state, id, cell, actor = 'environment') {
   const region = state.regions.find(region => region.id === id);
   if (!region) return false;
   if (same(region.cell, cell)) return true;
   if (!canPlaceRegion(state, id, cell)) return false;
   if (actor === 'player')
      for (const resident of state.residents)
         if (nearRegion(resident, region)) noticeDisturbance(state, resident, region);
   const from = region.cell.slice();
   if (region.entry) region.entry = [region.entry[0] + cell[0] - from[0], region.entry[1] + cell[1] - from[1]];
   region.cell = cell.slice();
   state.mapRevision++;
   event(state, { type: 'ObjectMoved', target: id, from, to: cell.slice() });
   return true;
}

function walkable(state, [x, z], blocked) {
   return Number.isInteger(x) && Number.isInteger(z) && x >= 0 && z >= 0 &&
          x < state.grid.width && z < state.grid.depth && !blocked.has(key([x, z]));
}

export function isWalkable(state, cell) {
   return walkable(state, cell, blockedCells(state));
}

export function interactionCells(state, region) {
   const blocked = blockedCells(state), cells = [];
   if (region.entry) return walkable(state, region.entry, blocked) ? [region.entry.slice()] : [];
   if (region.kind === 'water') {
      for (let offset = 0; offset < region.size; offset++)
         cells.push([region.cell[0] - 1, region.cell[1] + offset],
                    [region.cell[0] + region.size, region.cell[1] + offset],
                    [region.cell[0] + offset, region.cell[1] - 1],
                    [region.cell[0] + offset, region.cell[1] + region.size]);
   }
   else
      for (let x = region.cell[0]; x < region.cell[0] + region.size; x++)
         for (let z = region.cell[1]; z < region.cell[1] + region.size; z++) cells.push([x, z]);
   return cells.filter(cell => walkable(state, cell, blocked));
}

function search(state, start, accept, extraBlocked = new Set()) {
   const blocked = new Set([...blockedCells(state), ...extraBlocked]);
   if (!walkable(state, start, blocked)) return [];
   const queue = [start.slice()], previous = new Map([[key(start), null]]);
   for (let i = 0; i < queue.length; i++) {
      const cell = queue[i];
      if (accept(cell)) {
         const path = [];
         for (let step = cell; step !== null; step = previous.get(key(step))) path.push(step.slice());
         return path.reverse();
      }
      for (const [dx, dz] of directions) {
         const next = [cell[0] + dx, cell[1] + dz];
         if (walkable(state, next, blocked) && !previous.has(key(next))) {
            previous.set(key(next), cell);
            queue.push(next);
         }
      }
   }
   return [];
}

export function findPath(state, start, region, extraBlocked = new Set()) {
   const goals = new Set(interactionCells(state, region).map(key));
   return search(state, start, cell => goals.has(key(cell)), extraBlocked);
}

export function remember(state, type, text, target = null, resident = state.residents[0]) {
   resident.memories.push({ id: ++resident.memoryCount, time: state.time, type, target, text });
   if (resident.memories.length > 24) resident.memories.shift();
   return resident.memories.at(-1);
}

function stampObservation(state, resident, known, memory) {
   known.source = 'seen';
   known.observation = { id: resident.id + ':' + memory.id, at: state.time,
      origin: resident.name, chain: [{ id: resident.id, name: resident.name }] };
}

function noticeDisturbance(state, resident, region) {
   resident.lastDisturbed = state.time;
   resident.disturbances = resident.disturbances.filter(item => state.time - item.time < 60);
   resident.disturbances.push({ time: state.time, target: region.id });
   if (resident.disturbances.length > 12) resident.disturbances.shift();
   const memory = remember(state, 'witnessedMove', 'I saw you move ' + region.name + '.', region.id, resident);
   const count = resident.disturbances.filter(item => item.target === region.id).length;
   if (count < 3 || state.time - resident.lastProtest < 8) return;
   resident.lastProtest = state.time;
   resident.trust = Math.max(0, resident.trust - .25);
   resident.avoid[region.id] = state.time + 30;
   const text = "Hey! I saw you move " + region.name + " again. My flippers would appreciate a little peace. I'll give that spot a break.";
   resident.reason = text;
   resident.surprise = { kind: 'disturbed', memoryId: memory.id, target: region.id, text, handled: false };
   say(state, resident, text);
   event(state, { type: 'Protest', resident: resident.id, text: resident.name + ': ' + text });
}

function releaseRest(state, resident) {
   for (const queue of Object.values(state.restQueues)) {
      const index = queue.indexOf(resident.id);
      if (index >= 0) queue.splice(index, 1);
   }
   resident.waitingFor = null;
}

function noticeMissing(state, known, resident) {
   if (known.status === 'missing') return;
   known.status = 'missing';
   const text = 'Hang on—' + known.name + ' used to be here. Where did it go?';
   const memory = remember(state, 'expectedObjectMissing', text, known.id, resident);
   memory.expectedCell = known.cell.slice();
   stampObservation(state, resident, known, memory);
   resident.surprise = { kind: 'missing', memoryId: memory.id, target: known.id, text, handled: false };
   resident.reason = text;
   if (resident.target === known.id) {
      releaseRest(state, resident);
      resident.path = [];
      resident.pathVersion++;
      resident.status = 'idle';
      resident.behavior = 'stuck';
      resident.target = null;
      resident.plan = null;
      resident.pendingPlan = null;
      resident.intent++;
      resident.nextDecision = state.time + .5;
   }
}

export function perceive(state, resident = state.residents[0]) {
   const seen = new Set(resident.explored);
   for (let x = 0; x < state.grid.width; x++)
      for (let z = 0; z < state.grid.depth; z++)
         if (Math.hypot(x - resident.position[0], z - resident.position[1]) <= resident.sight)
            seen.add(key([x, z]));
   resident.explored = [...seen];
   for (const region of state.regions) {
      const dx = Math.max(region.cell[0] - resident.position[0], 0,
                          resident.position[0] - (region.cell[0] + region.size - 1));
      const dz = Math.max(region.cell[1] - resident.position[1], 0,
                          resident.position[1] - (region.cell[1] + region.size - 1));
      const known = resident.known.find(item => item.id === region.id);
      if (Math.hypot(dx, dz) <= resident.sight) {
         if (!known) {
            const record = { ...JSON.parse(JSON.stringify(region)), status: 'present' };
            resident.known.push(record);
            const memory = remember(state, 'discovered', 'Discovered ' + region.name + '.', region.id, resident);
            stampObservation(state, resident, record, memory);
         }
         else if (known.status === 'missing' || !same(known.cell, region.cell) || known.source === 'heard') {
            const confirmed = known.status === 'present' && same(known.cell, region.cell);
            Object.assign(known, JSON.parse(JSON.stringify(region)), { status: 'present' });
            const memory = remember(state, confirmed ? 'confirmed' : 'rediscovered',
               (confirmed ? 'Checked the report about ' : 'Found ') + region.name + '.', region.id, resident);
            stampObservation(state, resident, known, memory);
            if (resident.target === region.id) resident.needsReplan = true;
         }
      }
      else if (known && known.kind === 'forest' && isInRegion(resident.position, known)) noticeMissing(state, known, resident);
   }
}

export function exchangeNews(state, a, b) {
   if (distance(a.position, b.position) > 2.5) return false;
   const pair = [a.id, b.id].sort().join(':');
   if (state.time < (state.socialCooldowns[pair] || 0)) return false;
   state.socialCooldowns[pair] = state.time + 8;
   let shared = false;
   for (const [sender, receiver] of [[a, b], [b, a]]) {
      const report = sender.known.filter(record => {
         if (!record.observation || record.observation.chain.some(link => link.id === receiver.id)) return false;
         const old = receiver.known.find(item => item.id === record.id);
         return !old || (record.observation.at > (old.observation?.at ?? -1) &&
            (record.status !== old.status || !same(record.cell, old.cell)));
      }).sort((x, y) => y.observation.at - x.observation.at)[0];
      if (!report) continue;
      const copy = JSON.parse(JSON.stringify(report));
      copy.source = 'heard';
      if (copy.observation.chain.at(-1).id !== sender.id)
         copy.observation.chain.push({ id: sender.id, name: sender.name });
      const old = receiver.known.find(item => item.id === copy.id);
      if (old) Object.assign(old, copy);
      else receiver.known.push(copy);
      const fact = copy.status === 'missing' ? copy.name + ' was missing from its old spot' : 'where ' + copy.name + ' was seen';
      const text = sender.name + ' told me ' + fact + '. Originally spotted by ' + copy.observation.origin + '.';
      remember(state, 'heard', text, copy.id, receiver);
      receiver.needsReplan = true;
      say(state, sender, "A little local news: " + fact + '.');
      say(state, receiver, text);
      event(state, { type: 'InformationShared', from: sender.id, to: receiver.id, target: copy.id,
         observation: copy.observation.id, text: sender.name + ' → ' + receiver.name + ': ' + fact + '.' });
      shared = true;
   }
   return shared;
}

function anchor(resident) {
   return onGrid(resident.position) ? resident.position : resident.path[0];
}

export function requiredAction(state, resident = state.residents[0]) {
   const { thirst, fatigue } = resident.needs;
   if (thirst >= .65 || (resident.behavior === 'drinking' && thirst > .18)) return 'seekWater';
   if (fatigue >= .7 || (resident.behavior === 'resting' && fatigue > .18)) return 'seekHome';
   return null;
}

export function planOptions(state, resident = state.residents[0]) {
   const start = anchor(resident);
   if (!start) return [];
   const options = [];
   const avoided = resident.known.filter(region => resident.avoid[region.id] > state.time);
   for (const region of resident.known) {
      if (region.status === 'missing') continue;
      if (resident.avoid[region.id] > state.time && Math.max(resident.needs.thirst, resident.needs.fatigue) < .9) continue;
      const action = region.tags.includes('water') ? 'seekWater' :
                     region.tags.includes('shelter') ? 'seekHome' : null;
      if (!action) continue;
      const path = findPath(state, start, region);
      if (path.length) options.push({ action, target: region.id, steps: path.length - 1 });
   }
   const explored = new Set(resident.explored);
   if (resident.status === 'moving' && resident.target === null && resident.path.length &&
       !avoided.some(region => isInRegion(resident.path.at(-1), region)))
      options.push({ action: 'explore', cell: resident.path.at(-1).slice(), steps: resident.path.length });
   const path = search(state, start, cell => !explored.has(key(cell)) && !avoided.some(region => isInRegion(cell, region)));
   if (path.length && !options.some(option => option.cell && same(option.cell, path.at(-1))))
      options.push({ action: 'explore', cell: path.at(-1), steps: path.length - 1 });
   const required = requiredAction(state, resident);
   if (required && options.some(option => option.action === required))
      return options.filter(option => option.action === required).sort((a, b) => a.steps - b.steps);
   return options.filter(option => option.action === 'explore');
}

function waitingPath(state, resident, region) {
   const blocked = occupiedCells(state, resident);
   const entry = region.entry;
   if (!entry) return [];
   blocked.add(key(entry));
   const goals = new Set();
   for (let dx = -2; dx <= 2; dx++)
      for (let dz = -2; dz <= 2; dz++) {
         const cell = [entry[0] + dx, entry[1] + dz];
         if (Math.abs(dx) + Math.abs(dz) === 2 && isWalkable(state, cell) && !blocked.has(key(cell))) goals.add(key(cell));
      }
   return search(state, resident.position, cell => goals.has(key(cell)), blocked);
}

export function validatePlan(state, plan, resident = state.residents[0]) {
   if (!plan || typeof plan !== 'object') return false;
   return planOptions(state, resident).some(option => option.action === plan.action &&
      (option.action === 'explore' ? Array.isArray(plan.cell) && plan.cell.length === 2 && same(option.cell, plan.cell) :
                                    option.target === plan.target));
}

export function applyPlan(state, plan, source = 'rule', resident = state.residents[0]) {
   if (!validatePlan(state, plan, resident)) return false;
   const command = plan.action === 'explore' ? { action: plan.action, cell: plan.cell.slice() } :
                                             { action: plan.action, target: plan.target };
   if (!onGrid(resident.position)) {
      resident.pendingPlan = { plan: command, source, intent: resident.intent };
      return true;
   }
   const region = plan.action === 'explore' ? { cell: plan.cell, size: 1 } :
                  resident.known.find(region => region.id === plan.target);
   const path = findPath(state, resident.position, region);
   if (!path.length) return false;
   if (plan.action !== 'seekHome' || resident.target !== plan.target) releaseRest(state, resident);
   if (plan.action === 'seekHome') {
      const queue = state.restQueues[plan.target] ||= [];
      if (!queue.includes(resident.id)) queue.push(resident.id);
      resident.waitingFor = queue[0] === resident.id ? null : plan.target;
   }
   resident.target = plan.action === 'explore' ? null : plan.target;
   resident.plan = command;
   resident.routeRevision = state.mapRevision;
   resident.needsReplan = false;
   resident.path = (resident.waitingFor ? waitingPath(state, resident, region) : path).slice(1);
   resident.pathVersion++;
   resident.intent++;
   resident.behavior = resident.waitingFor ? 'waiting' : plan.action === 'seekWater' ? 'seekingWater' :
                     plan.action === 'seekHome' ? 'seekingHome' : 'exploring';
   resident.reason = resident.waitingFor ? 'The cottage has one resting spot. I am waiting my turn—politely, mostly.' :
                   plan.action === 'seekWater' ? 'My beak is feeling rather dry. Water first, grand adventures second.' :
                   plan.action === 'seekHome' ? 'These flippers need a break. Heading home for a tiny recharge.' :
                   requiredAction(state, resident) === 'seekWater' ? 'A drink would be lovely. First, I have to find the water—minor detail!' :
                   requiredAction(state, resident) === 'seekHome' ? 'My feet are voting for a nap. Now, where can I rest?' :
                   'There are blank spots on my map. Clearly, this calls for a waddle.';
   resident.status = resident.path.length ? 'moving' : 'arrived';
   resident.waitTime = 0;
   resident.yielding = false;
   remember(state, 'decision', resident.reason, resident.target, resident);
   if (source === 'ai') remember(state, 'plan', 'Adopted a validated plan.', resident.target, resident);
   return true;
}

export function stepResident(state, dt, resident = state.residents[0]) {
   if (resident.status !== 'moving') return;
   if (onGrid(resident.position) && (resident.routeRevision !== state.mapRevision || resident.needsReplan)) return;
   const blocked = blockedCells(state);
   let left = resident.speed * dt;
   while (resident.path.length && left > 0) {
      const next = resident.path[0];
      if (!walkable(state, next, blocked)) {
         resident.path = [];
         resident.status = 'unreachable';
         resident.behavior = 'stuck';
         resident.reason = 'That route is a no-go. Time for a little detour.';
         remember(state, 'failed', resident.reason, resident.target, resident);
         break;
      }
      if (onGrid(resident.position) && occupiedCells(state, resident).has(key(next))) {
         resident.waitTime += dt;
         const blocker = state.residents.find(other => other !== resident && reservedCells(other).some(cell => same(cell, next)));
         const takesDetour = blocker.status !== 'moving' ||
            onGrid(blocker.position) && blocker.waitTime > 0 && state.residents.indexOf(resident) < state.residents.indexOf(blocker);
         if (resident.waitTime >= .75 && takesDetour) {
            const extra = occupiedCells(state, resident);
            const region = resident.plan?.action === 'explore' ? { cell: resident.plan.cell, size: 1 } :
               resident.known.find(item => item.id === resident.target && item.status !== 'missing');
            const detour = region && !resident.waitingFor ? findPath(state, resident.position, region, extra) : [];
            if (detour.length > 1) resident.path = detour.slice(1);
            else {
               const side = directions.map(([dx, dz]) => [resident.position[0] + dx, resident.position[1] + dz])
                  .find(cell => walkable(state, cell, blocked) && !extra.has(key(cell)));
               if (side) { resident.path = [side]; resident.yielding = true; }
            }
            resident.pathVersion++;
            resident.waitTime = 0;
         }
         break;
      }
      if (onGrid(resident.position)) resident.segmentFrom = resident.position.slice();
      resident.waitTime = 0;
      const dx = next[0] - resident.position[0], dz = next[1] - resident.position[1];
      const distance = Math.hypot(dx, dz);
      resident.heading = Math.atan2(dx, dz);
      if (left >= distance) {
         resident.position = resident.path.shift().slice();
         resident.segmentFrom = null;
         left -= distance;
         if (resident.pendingPlan || resident.routeRevision !== state.mapRevision || resident.needsReplan) break;
      }
      else {
         resident.position[0] += dx / distance * left;
         resident.position[1] += dz / distance * left;
         left = 0;
      }
   }
   if (resident.status === 'moving' && resident.path.length === 0) resident.status = 'arrived';
}

function refreshRoute(state, resident) {
   const plan = resident.plan;
   resident.routeRevision = state.mapRevision;
   resident.needsReplan = false;
   resident.pendingPlan = null;
   if (!plan) return;
   const region = plan.action === 'explore' ? { cell: plan.cell, size: 1 } :
                  resident.known.find(region => region.id === plan.target && region.status !== 'missing');
   resident.path = region ? (resident.waitingFor ? waitingPath(state, resident, region) :
      findPath(state, resident.position, region)).slice(1) : [];
   const atGoal = region && interactionCells(state, region).some(cell => same(cell, resident.position));
   resident.status = resident.path.length ? 'moving' : atGoal || resident.waitingFor ? 'arrived' : 'unreachable';
   resident.pathVersion++;
   if (resident.status === 'unreachable') {
      resident.behavior = 'stuck';
      resident.reason = 'The old route is blocked. My feet and I will have to rethink this.';
      remember(state, 'failed', resident.reason, resident.target, resident);
   }
}

function checkTarget(state, resident) {
   if (!resident.target) return;
   const known = resident.known.find(region => region.id === resident.target);
   const actual = state.regions.find(region => region.id === resident.target);
   if (known && (!actual || !interactionCells(state, actual).some(cell => same(cell, resident.position)))) noticeMissing(state, known, resident);
}

function chooseRule(state, resident) {
   const options = planOptions(state, resident);
   if (!options.length) {
      releaseRest(state, resident);
      resident.target = resident.plan = resident.pendingPlan = null;
      resident.path = [];
      resident.pathVersion++;
      resident.status = 'idle';
      resident.behavior = requiredAction(state, resident) ? 'stuck' : 'exploring';
      resident.reason = requiredAction(state, resident) ? "I can't reach what I need just yet. A brief flipper-planning pause." :
                                             "I've poked around this patch already. Taking a little breather.";
      const blockingDoor = state.regions.some(region => region.entry && same(region.entry, resident.position));
      const blockingNeighbor = state.residents.some(other => other !== resident && other.path.length && same(other.path[0], resident.position));
      if (onGrid(resident.position) && (blockingDoor || blockingNeighbor)) {
         const occupied = occupiedCells(state, resident);
         const side = directions.map(([dx, dz]) => [resident.position[0] + dx, resident.position[1] + dz])
            .find(cell => isWalkable(state, cell) && !occupied.has(key(cell)));
         if (side) {
            resident.plan = { action: 'explore', cell: side };
            resident.path = [side];
            resident.status = 'moving';
            resident.reason = 'All rested. Scooting over so my neighbors can get through.';
         }
      }
      return;
   }
   applyPlan(state, options[0], 'rule', resident);
}

function updateResident(state, resident, dt) {
   resident.disturbances = resident.disturbances.filter(item => state.time - item.time < 60);
   if (state.time - resident.lastDisturbed > 30) resident.trust = Math.min(1, resident.trust + .003 * dt);
   for (const id in resident.avoid)
      if (resident.avoid[id] <= state.time) delete resident.avoid[id];
   const avoidingGoal = resident.avoid[resident.target] > state.time || resident.plan?.action === 'explore' &&
      resident.known.some(region => resident.avoid[region.id] > state.time && isInRegion(resident.plan.cell, region));
   if (onGrid(resident.position) && avoidingGoal && Math.max(resident.needs.thirst, resident.needs.fatigue) < .9) {
      releaseRest(state, resident);
      resident.target = resident.plan = resident.pendingPlan = null;
      resident.path = [];
      resident.pathVersion++;
      resident.intent++;
      resident.status = 'idle';
      resident.nextDecision = state.time;
   }
   resident.needs.thirst = Math.min(1, resident.needs.thirst + .009 * dt);
   resident.needs.fatigue = Math.min(1, resident.needs.fatigue + (resident.behavior === 'resting' ? 0 : .005) * dt);
   if (state.time >= resident.nextSense) {
      perceive(state, resident);
      resident.nextSense = state.time + .25;
   }
   if (['drinking', 'resting'].includes(resident.behavior)) checkTarget(state, resident);
   if (onGrid(resident.position) && (resident.routeRevision !== state.mapRevision || resident.needsReplan)) refreshRoute(state, resident);
   if (resident.status === 'arrived' && resident.behavior === 'drinking') resident.needs.thirst = Math.max(0, resident.needs.thirst - .22 * dt);
   if (resident.status === 'arrived' && resident.behavior === 'resting') resident.needs.fatigue = Math.max(0, resident.needs.fatigue - .14 * dt);
   if (resident.pendingPlan && onGrid(resident.position)) {
      const pending = resident.pendingPlan;
      resident.pendingPlan = null;
      if (pending.intent === resident.intent) applyPlan(state, pending.plan, pending.source, resident);
   }
   if (resident.waitingFor && requiredAction(state, resident) === 'seekWater') {
      releaseRest(state, resident);
      resident.nextDecision = state.time;
   }
   if (resident.waitingFor && state.restQueues[resident.waitingFor]?.[0] === resident.id && onGrid(resident.position)) {
      resident.waitingFor = null;
      resident.behavior = 'seekingHome';
      resident.reason = 'My turn at last. The nap committee approves.';
      refreshRoute(state, resident);
   }
   const working = resident.status === 'arrived' && (resident.behavior === 'drinking' && resident.needs.thirst > .18 ||
                   resident.behavior === 'resting' && resident.needs.fatigue > .18 && resident.needs.thirst < .85);
   if (!working && !resident.waitingFor && state.time >= resident.nextDecision) {
      const required = requiredAction(state, resident);
      const currentAction = resident.behavior === 'seekingWater' ? 'seekWater' :
                            resident.behavior === 'seekingHome' ? 'seekHome' : 'explore';
      if (resident.status !== 'moving' || required && required !== currentAction) chooseRule(state, resident);
      resident.nextDecision = state.time + 1;
   }
   stepResident(state, dt, resident);
   if (resident.status === 'arrived' && resident.yielding) {
      resident.yielding = false;
      refreshRoute(state, resident);
   }
   if (resident.waitingFor) return;
   if (resident.status === 'arrived') {
      checkTarget(state, resident);
      if (resident.status !== 'arrived') return;
      const region = resident.known.find(region => region.id === resident.target);
      if (region && interactionCells(state, region).some(cell => same(cell, resident.position))) {
         if (resident.behavior === 'seekingWater') {
            resident.behavior = 'drinking';
            resident.reason = 'Water break. Even intrepid waddlers need a refill.';
            remember(state, 'drinking', 'Reached ' + region.name + ' and started drinking.', region.id, resident);
         }
         else if (resident.behavior === 'seekingHome') {
            resident.behavior = 'resting';
            resident.reason = 'Resting at home. Big plans, very small battery.';
            remember(state, 'resting', 'Returned to ' + region.name + ' and started resting.', region.id, resident);
         }
      }
   }
}

export function stepWorld(state, dt) {
   state.time += dt;
   for (const resident of state.residents) updateResident(state, resident, dt);
   if (state.time >= state.nextSocial) {
      for (let i = 0; i < state.residents.length; i++)
         for (let j = i + 1; j < state.residents.length; j++) exchangeNews(state, state.residents[i], state.residents[j]);
      state.nextSocial = state.time + .5;
   }
}

export function snapshot(state, resident = state.residents[0]) {
   return JSON.parse(JSON.stringify({ time: Math.round(state.time), name: resident.name, personality: resident.personality,
      needs: resident.needs, behavior: resident.behavior, reason: resident.reason,
      position: resident.position, target: resident.target, destination: resident.path.at(-1) || null,
      surprise: resident.surprise,
      known: resident.known, memories: resident.memories.slice(-10), options: planOptions(state, resident),
      social: { trustPlayer: resident.trust, waitingFor: resident.waitingFor,
         avoiding: Object.keys(resident.avoid), witnessedMoves: resident.disturbances.length },
      nearby: state.residents.filter(other => other !== resident && distance(other.position, resident.position) <= resident.sight)
         .map(other => ({ id: other.id, name: other.name, behavior: other.behavior })) }));
}

export function describeState(state, resident = state.residents[0]) {
   const place = resident.known.find(region => region.id === resident.target);
   const note = place && place.status !== 'missing' ?
      (['drinking', 'resting'].includes(resident.behavior) ? " I'm at " : " I'm making my way to ") + place.name + '.' :
      resident.known.length ? ' In my notebook: ' + resident.known.slice(-2).map(region =>
         region.name + (region.status === 'missing' ? ' (missing from its old spot)' : '')).join(', ') + '.' :
      ' My little map still has plenty of question marks.';
   const report = resident.known.find(region => region.source === 'heard');
   const news = report ? ' ' + report.observation.chain.at(-1).name + ' told me about ' + report.name + '; I have not checked it myself yet.' : '';
   return `${resident.name} here! ${resident.reason}${news || note}`;
}
