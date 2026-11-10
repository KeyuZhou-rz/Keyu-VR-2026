// Pure game logic for the boss fight. No rendering, no network, no DOM, so it
// can be tested in node. Everything is in arena space (see bossConfig.js).
//
//    const game = createGame('mini', deps);
//    handleEvent(game, ev);          // for every event from bossNet
//    step(game, dt, local);          // once per frame
//    for (const o of game.outbox.splice(0)) net.emit(o.type, o.payload);
//
// deps (injected so this file stays free of cg.js / browser code):
//    bladeHit(prev, cur, invBody, radius) -> bool    (wraps sweepSeg + forseg)
//    rng()                                -> [0,1)   (default Math.random)
//
// Authority: the giant owns boss hp and the orb timer; the mini player owns its
// own hp and judges every hit on itself (orb blast, blade).

import { CFG } from './bossConfig.js';

export const createGame = (role, deps = {}, cfg = CFG) => ({
   role,
   cfg,
   deps: { rng: Math.random, ...deps },
   t: 0,
   phase: 'fighting',                       // 'fighting' | 'win' | 'lose'
   boss: { hp: cfg.boss.hp, maxHp: cfg.boss.hp, head: cfg.boss.head.slice() },
   mini: { hp: cfg.mini.hp, maxHp: cfg.mini.hp, pos: [0, 0, 0], headY: 1.6, invuln: 0 },
   orbs: [],                                // { id, x, z, landAt }
   rings: [],                               // { x, z, born } for the fx layer
   blade: null,                             // { prev, cur, swinging, swingId } (mini side)
   lastSwingHit: -1,
   nextOrbIn: 1.0,
   nextId: 1,
   outbox: [],                              // [{ type, payload }]
});

const emit = (g, type, payload = {}) => g.outbox.push({ type, payload });

const refreshPhase = g => {
   if (g.boss.hp <= 0) g.phase = 'win';
   else if (g.mini.hp <= 0) g.phase = 'lose';
};

// The mini player's body as an inverse matrix of a [-1,1]^3 box (column-major),
// which is what forseg() expects.
export const miniBodyInverse = g => {
   const crouched = g.mini.headY < g.cfg.mini.crouchHeight + 0.2;
   const [hx, hy0, hz] = g.cfg.mini.bodyHalf;
   const hy = crouched ? g.cfg.mini.crouchHeight / 2 : hy0;
   const [px, , pz] = g.mini.pos;
   const cy = hy;                           // box sits on the ground
   return [1 / hx, 0, 0, 0,
           0, 1 / hy, 0, 0,
           0, 0, 1 / hz, 0,
           -px / hx, -cy / hy, -pz / hz, 1];
};

const damageMini = (g, src) => {
   if (g.phase !== 'fighting' || g.mini.invuln > 0) return;
   g.mini.hp = Math.max(0, g.mini.hp - 1);
   g.mini.invuln = g.cfg.mini.invuln;
   emit(g, 'state', { miniHp: g.mini.hp, src });
   refreshPhase(g);
};

// ---------------------------------------------------------------- events ---

export const handleEvent = (g, ev) => {
   switch (ev.type) {

   case 'orb':                              // both sides simulate the same fall
      g.orbs.push({ id: ev.id, x: ev.x, z: ev.z, landAt: g.t + ev.fall });
      break;

   case 'pose':                             // mini -> giant, for display and aiming
      if (g.role === 'giant') {
         g.mini.pos = ev.pos;
         g.mini.headY = ev.headY;
      }
      break;

   case 'blade':                            // giant -> mini, the mini judges the cut
      if (g.role !== 'mini') break;
      if (ev.head) g.boss.head = ev.head;      // a VR giant's real head is the weak point
      g.blade = { prev: g.blade ? g.blade.cur : { hilt: ev.hilt, tip: ev.tip },
                  cur: { hilt: ev.hilt, tip: ev.tip },
                  swinging: ev.swinging, swingId: ev.swingId };
      if (g.phase === 'fighting' && ev.swinging && ev.swingId !== g.lastSwingHit && g.mini.invuln <= 0 &&
          g.deps.bladeHit(g.blade.prev, g.blade.cur, miniBodyInverse(g), g.cfg.slash.bladeRadius)) {
         g.lastSwingHit = ev.swingId;
         damageMini(g, 'slash');
      }
      break;

   case 'hitBoss':                          // mini -> giant
      if (g.role === 'giant' && g.phase === 'fighting') {
         g.boss.hp = Math.max(0, g.boss.hp - (ev.dmg ?? 1));
         emit(g, 'state', { bossHp: g.boss.hp });
         refreshPhase(g);
      }
      break;

   case 'state':                            // each owner broadcasts its own hp
      if (ev.bossHp !== undefined) g.boss.hp = ev.bossHp;
      if (ev.miniHp !== undefined) g.mini.hp = ev.miniHp;
      refreshPhase(g);
      break;

   case 'reset': {
      const fresh = createGame(g.role, g.deps, g.cfg);
      const keep = { role: g.role, deps: g.deps, cfg: g.cfg, outbox: g.outbox };
      Object.assign(g, fresh, keep);
      break;
   }
   }
};

// ------------------------------------------------------------------ step ---

// local: what this client knows about itself this frame.
//    mini : { pos:[x,y,z], headY }
//    giant: { head:[x,y,z], orbEvery, orbAt:[x,z] } (all optional; the bot giant uses
//           orbEvery/orbAt to drop a rock every 10 s where the player is heading)
export const step = (g, dt, local = {}) => {
   g.t += dt;
   g.mini.invuln = Math.max(0, g.mini.invuln - dt);

   if (g.role === 'mini') {
      if (local.pos) g.mini.pos = local.pos;
      if (local.headY !== undefined) g.mini.headY = local.headY;
   } else if (local.head) {
      g.boss.head = local.head;
   }

   // The giant picks orb landing points and announces them; everyone simulates the fall.
   if (g.role === 'giant' && g.phase === 'fighting') {
      g.nextOrbIn -= dt;
      if (g.nextOrbIn <= 0) {
         g.nextOrbIn += local.orbEvery ?? g.cfg.orb.interval;
         const b = g.cfg.bounds, r = g.deps.rng, clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
         const [x, z] = local.orbAt ? [clamp(local.orbAt[0], b.minX, b.maxX), clamp(local.orbAt[1], b.minZ, b.maxZ)]
                                    : [b.minX + r() * (b.maxX - b.minX), b.minZ + r() * (b.maxZ - b.minZ)];
         emit(g, 'orb', { id: g.nextId++, x, z, fall: g.cfg.orb.fall });
      }
   }

   // Impact: spawn a ring; the mini player judges whether it stood inside the blast.
   for (let i = g.orbs.length - 1; i >= 0; i--) {
      const o = g.orbs[i];
      if (g.t < o.landAt) continue;
      g.orbs.splice(i, 1);
      g.rings.push({ x: o.x, z: o.z, born: g.t });
      if (g.role === 'mini' && Math.hypot(g.mini.pos[0] - o.x, g.mini.pos[2] - o.z) < g.cfg.orb.blastRadius)
         damageMini(g, 'orb');
   }
   g.rings = g.rings.filter(r => g.t - r.born < 1.0);
};
