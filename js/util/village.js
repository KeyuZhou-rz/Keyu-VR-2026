const directions = [[1, 0], [0, 1], [-1, 0], [0, -1]];
const key = cell => cell.join(',');
const same = (a, b) => a[0] === b[0] && a[1] === b[1];
const onGrid = cell => cell.every(Number.isInteger);

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
   const occupied = [state.rabbit.position];
   if (!onGrid(state.rabbit.position) && state.rabbit.path.length) occupied.push(state.rabbit.path[0]);
   if (occupied.some(([px, pz]) => px > x - .9 && px < x + size - .1 &&
                                   pz > z - .9 && pz < z + size - .1)) return false;
   if (region.entry) {
      const entry = [region.entry[0] + x - region.cell[0], region.entry[1] + z - region.cell[1]];
      const candidate = { ...region, cell, entry };
      if (!isWalkable({ ...state, regions: state.regions.map(item => item.id === id ? candidate : item) }, entry)) return false;
   }
   return true;
}

export function moveRegion(state, id, cell) {
   const region = state.regions.find(region => region.id === id);
   if (!region) return false;
   if (same(region.cell, cell)) return true;
   if (!canPlaceRegion(state, id, cell)) return false;
   const from = region.cell.slice();
   if (region.entry) region.entry = [region.entry[0] + cell[0] - from[0], region.entry[1] + cell[1] - from[1]];
   region.cell = cell.slice();
   state.mapRevision++;
   state.events.push({ type: 'ObjectMoved', time: state.time, target: id, from, to: cell.slice() });
   if (state.events.length > 24) state.events.shift();
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

function search(state, start, accept) {
   const blocked = blockedCells(state);
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

export function findPath(state, start, region) {
   const goals = new Set(interactionCells(state, region).map(key));
   return search(state, start, cell => goals.has(key(cell)));
}

export function remember(state, type, text, target = null) {
   const rabbit = state.rabbit;
   rabbit.memories.push({ id: ++rabbit.memoryCount, time: state.time, type, target, text });
   if (rabbit.memories.length > 24) rabbit.memories.shift();
   return rabbit.memories.at(-1);
}

function noticeMissing(state, known) {
   if (known.status === 'missing') return;
   known.status = 'missing';
   const text = 'Hang on—' + known.name + ' used to be here. Where did it go?';
   const memory = remember(state, 'expectedObjectMissing', text, known.id);
   memory.expectedCell = known.cell.slice();
   state.rabbit.surprise = { memoryId: memory.id, target: known.id, text, handled: false };
   state.rabbit.reason = text;
   if (state.rabbit.target === known.id) {
      state.rabbit.path = [];
      state.rabbit.pathVersion++;
      state.rabbit.status = 'idle';
      state.rabbit.behavior = 'stuck';
      state.rabbit.target = null;
      state.rabbit.plan = null;
      state.rabbit.pendingPlan = null;
      state.rabbit.intent++;
      state.rabbit.nextDecision = state.time + .5;
   }
}

export function perceive(state) {
   const rabbit = state.rabbit;
   const seen = new Set(rabbit.explored);
   for (let x = 0; x < state.grid.width; x++)
      for (let z = 0; z < state.grid.depth; z++)
         if (Math.hypot(x - rabbit.position[0], z - rabbit.position[1]) <= rabbit.sight)
            seen.add(key([x, z]));
   rabbit.explored = [...seen];
   for (const region of state.regions) {
      const dx = Math.max(region.cell[0] - rabbit.position[0], 0,
                          rabbit.position[0] - (region.cell[0] + region.size - 1));
      const dz = Math.max(region.cell[1] - rabbit.position[1], 0,
                          rabbit.position[1] - (region.cell[1] + region.size - 1));
      const known = rabbit.known.find(item => item.id === region.id);
      if (Math.hypot(dx, dz) <= rabbit.sight) {
         if (!known) {
            rabbit.known.push({ ...JSON.parse(JSON.stringify(region)), status: 'present' });
            remember(state, 'discovered', 'Discovered ' + region.name + '.', region.id);
         }
         else if (known.status === 'missing' || !same(known.cell, region.cell)) {
            Object.assign(known, JSON.parse(JSON.stringify(region)), { status: 'present' });
            remember(state, 'rediscovered', 'Found ' + region.name + ' again and noted its location.', region.id);
            if (rabbit.target === region.id) rabbit.needsReplan = true;
         }
      }
      else if (known && known.kind === 'forest' && isInRegion(rabbit.position, known)) noticeMissing(state, known);
   }
}

function anchor(state) {
   const rabbit = state.rabbit;
   return onGrid(rabbit.position) ? rabbit.position : rabbit.path[0];
}

export function requiredAction(state) {
   const rabbit = state.rabbit, { thirst, fatigue } = rabbit.needs;
   if (thirst >= .65 || (rabbit.behavior === 'drinking' && thirst > .18)) return 'seekWater';
   if (fatigue >= .7 || (rabbit.behavior === 'resting' && fatigue > .18)) return 'seekHome';
   return null;
}

export function planOptions(state) {
   const start = anchor(state);
   if (!start) return [];
   const rabbit = state.rabbit, options = [];
   for (const region of rabbit.known) {
      if (region.status === 'missing') continue;
      const action = region.tags.includes('water') ? 'seekWater' :
                     region.tags.includes('shelter') ? 'seekHome' : null;
      if (!action) continue;
      const path = findPath(state, start, region);
      if (path.length) options.push({ action, target: region.id, steps: path.length - 1 });
   }
   const explored = new Set(rabbit.explored);
   if (rabbit.status === 'moving' && rabbit.target === null && rabbit.path.length)
      options.push({ action: 'explore', cell: rabbit.path.at(-1).slice(), steps: rabbit.path.length });
   const path = search(state, start, cell => !explored.has(key(cell)));
   if (path.length && !options.some(option => option.cell && same(option.cell, path.at(-1))))
      options.push({ action: 'explore', cell: path.at(-1), steps: path.length - 1 });
   const required = requiredAction(state);
   if (required && options.some(option => option.action === required))
      return options.filter(option => option.action === required).sort((a, b) => a.steps - b.steps);
   return options.filter(option => option.action === 'explore');
}

export function validatePlan(state, plan) {
   if (!plan || typeof plan !== 'object') return false;
   return planOptions(state).some(option => option.action === plan.action &&
      (option.action === 'explore' ? Array.isArray(plan.cell) && plan.cell.length === 2 && same(option.cell, plan.cell) :
                                    option.target === plan.target));
}

export function applyPlan(state, plan, source = 'rule') {
   if (!validatePlan(state, plan)) return false;
   const rabbit = state.rabbit;
   const command = plan.action === 'explore' ? { action: plan.action, cell: plan.cell.slice() } :
                                             { action: plan.action, target: plan.target };
   if (!onGrid(rabbit.position)) {
      rabbit.pendingPlan = { plan: command, source, intent: rabbit.intent };
      return true;
   }
   const region = plan.action === 'explore' ? { cell: plan.cell, size: 1 } :
                  rabbit.known.find(region => region.id === plan.target);
   const path = findPath(state, rabbit.position, region);
   if (!path.length) return false;
   rabbit.target = plan.action === 'explore' ? null : plan.target;
   rabbit.plan = command;
   rabbit.routeRevision = state.mapRevision;
   rabbit.needsReplan = false;
   rabbit.path = path.slice(1);
   rabbit.pathVersion++;
   rabbit.intent++;
   rabbit.behavior = plan.action === 'seekWater' ? 'seekingWater' :
                     plan.action === 'seekHome' ? 'seekingHome' : 'exploring';
   rabbit.reason = plan.action === 'seekWater' ? 'My beak is feeling rather dry. Water first, grand adventures second.' :
                   plan.action === 'seekHome' ? 'These flippers need a break. Heading home for a tiny recharge.' :
                   requiredAction(state) === 'seekWater' ? 'A drink would be lovely. First, I have to find the water—minor detail!' :
                   requiredAction(state) === 'seekHome' ? 'My feet are voting for a nap. Now, where can I rest?' :
                   'There are blank spots on my map. Clearly, this calls for a waddle.';
   rabbit.status = rabbit.path.length ? 'moving' : 'arrived';
   remember(state, 'decision', rabbit.reason, rabbit.target);
   if (source === 'ai') remember(state, 'plan', 'Adopted a validated plan.', rabbit.target);
   return true;
}

export function stepRabbit(state, dt) {
   const rabbit = state.rabbit;
   if (rabbit.status !== 'moving') return;
   if (onGrid(rabbit.position) && (rabbit.routeRevision !== state.mapRevision || rabbit.needsReplan)) return;
   const blocked = blockedCells(state);
   let left = rabbit.speed * dt;
   while (rabbit.path.length && left > 0) {
      const next = rabbit.path[0];
      if (!walkable(state, next, blocked)) {
         rabbit.path = [];
         rabbit.status = 'unreachable';
         rabbit.behavior = 'stuck';
         rabbit.reason = 'That route is a no-go. Time for a little detour.';
         remember(state, 'failed', rabbit.reason, rabbit.target);
         break;
      }
      const dx = next[0] - rabbit.position[0], dz = next[1] - rabbit.position[1];
      const distance = Math.hypot(dx, dz);
      rabbit.heading = Math.atan2(dx, dz);
      if (left >= distance) {
         rabbit.position = rabbit.path.shift().slice();
         left -= distance;
         if (rabbit.pendingPlan || rabbit.routeRevision !== state.mapRevision || rabbit.needsReplan) break;
      }
      else {
         rabbit.position[0] += dx / distance * left;
         rabbit.position[1] += dz / distance * left;
         left = 0;
      }
   }
   if (rabbit.status === 'moving' && rabbit.path.length === 0) rabbit.status = 'arrived';
}

function refreshRoute(state) {
   const rabbit = state.rabbit, plan = rabbit.plan;
   rabbit.routeRevision = state.mapRevision;
   rabbit.needsReplan = false;
   rabbit.pendingPlan = null;
   if (!plan) return;
   const region = plan.action === 'explore' ? { cell: plan.cell, size: 1 } :
                  rabbit.known.find(region => region.id === plan.target && region.status !== 'missing');
   rabbit.path = region ? findPath(state, rabbit.position, region).slice(1) : [];
   const atGoal = region && interactionCells(state, region).some(cell => same(cell, rabbit.position));
   rabbit.status = rabbit.path.length ? 'moving' : atGoal ? 'arrived' : 'unreachable';
   rabbit.pathVersion++;
   if (rabbit.status === 'unreachable') {
      rabbit.behavior = 'stuck';
      rabbit.reason = 'The old route is blocked. My feet and I will have to rethink this.';
      remember(state, 'failed', rabbit.reason, rabbit.target);
   }
}

function checkTarget(state) {
   const rabbit = state.rabbit;
   if (!rabbit.target) return;
   const known = rabbit.known.find(region => region.id === rabbit.target);
   const actual = state.regions.find(region => region.id === rabbit.target);
   if (known && (!actual || !interactionCells(state, actual).some(cell => same(cell, rabbit.position)))) noticeMissing(state, known);
}

function chooseRule(state) {
   const options = planOptions(state);
   if (!options.length) {
      const rabbit = state.rabbit;
      rabbit.status = 'idle';
      rabbit.behavior = requiredAction(state) ? 'stuck' : 'exploring';
      rabbit.reason = requiredAction(state) ? "I can't reach what I need just yet. A brief flipper-planning pause." :
                                             "I've poked around this patch already. Taking a little breather.";
      return;
   }
   applyPlan(state, options[0]);
}

export function stepWorld(state, dt) {
   const rabbit = state.rabbit;
   state.time += dt;
   rabbit.needs.thirst = Math.min(1, rabbit.needs.thirst + .009 * dt);
   rabbit.needs.fatigue = Math.min(1, rabbit.needs.fatigue + (rabbit.behavior === 'resting' ? 0 : .005) * dt);
   if (state.time >= rabbit.nextSense) {
      perceive(state);
      rabbit.nextSense = state.time + .25;
   }
   if (['drinking', 'resting'].includes(rabbit.behavior)) checkTarget(state);
   if (onGrid(rabbit.position) && (rabbit.routeRevision !== state.mapRevision || rabbit.needsReplan)) refreshRoute(state);
   if (rabbit.status === 'arrived' && rabbit.behavior === 'drinking') rabbit.needs.thirst = Math.max(0, rabbit.needs.thirst - .22 * dt);
   if (rabbit.status === 'arrived' && rabbit.behavior === 'resting') rabbit.needs.fatigue = Math.max(0, rabbit.needs.fatigue - .14 * dt);
   if (rabbit.pendingPlan && onGrid(rabbit.position)) {
      const pending = rabbit.pendingPlan;
      rabbit.pendingPlan = null;
      if (pending.intent === rabbit.intent) applyPlan(state, pending.plan, pending.source);
   }
   const working = rabbit.status === 'arrived' && (rabbit.behavior === 'drinking' && rabbit.needs.thirst > .18 ||
                   rabbit.behavior === 'resting' && rabbit.needs.fatigue > .18 && rabbit.needs.thirst < .85);
   if (!working && state.time >= rabbit.nextDecision) {
      const required = requiredAction(state);
      const currentAction = rabbit.behavior === 'seekingWater' ? 'seekWater' :
                            rabbit.behavior === 'seekingHome' ? 'seekHome' : 'explore';
      if (rabbit.status !== 'moving' || required && required !== currentAction) chooseRule(state);
      rabbit.nextDecision = state.time + 1;
   }
   stepRabbit(state, dt);
   if (rabbit.status === 'arrived') {
      checkTarget(state);
      if (rabbit.status !== 'arrived') return;
      const region = rabbit.known.find(region => region.id === rabbit.target);
      if (region && interactionCells(state, region).some(cell => same(cell, rabbit.position))) {
         if (rabbit.behavior === 'seekingWater') {
            rabbit.behavior = 'drinking';
            rabbit.reason = 'Water break. Even intrepid waddlers need a refill.';
            remember(state, 'drinking', 'Reached ' + region.name + ' and started drinking.', region.id);
         }
         else if (rabbit.behavior === 'seekingHome') {
            rabbit.behavior = 'resting';
            rabbit.reason = 'Resting at home. Big plans, very small battery.';
            remember(state, 'resting', 'Returned to ' + region.name + ' and started resting.', region.id);
         }
      }
   }
}

export function snapshot(state) {
   const rabbit = state.rabbit;
   return JSON.parse(JSON.stringify({ time: Math.round(state.time), name: rabbit.name,
      needs: rabbit.needs, behavior: rabbit.behavior, reason: rabbit.reason,
      position: rabbit.position, target: rabbit.target, destination: rabbit.path.at(-1) || null,
      surprise: rabbit.surprise,
      known: rabbit.known, memories: rabbit.memories.slice(-10), options: planOptions(state) }));
}

export function describeState(state) {
   const rabbit = state.rabbit;
   const place = rabbit.known.find(region => region.id === rabbit.target);
   const note = place && place.status !== 'missing' ?
      (['drinking', 'resting'].includes(rabbit.behavior) ? " I'm at " : " I'm making my way to ") + place.name + '.' :
      rabbit.known.length ? ' In my notebook: ' + rabbit.known.slice(-2).map(region =>
         region.name + (region.status === 'missing' ? ' (missing from its old spot)' : '')).join(', ') + '.' :
      ' My little map still has plenty of question marks.';
   return `${rabbit.name} here! ${rabbit.reason}${note}`;
}
