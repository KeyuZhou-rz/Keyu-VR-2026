// Giant vs miniature boss fight.
//
// On entry you choose your role in a menu (point the right controller at a button and pull the
// trigger, or press 1 = giant, 2 = mini; ?role=giant|mini skips the menu). You play ONE role at a time
// and can switch later like village.js switches views: V on the keyboard, or B (right controller).
// Switching restarts the fight.
//
//    giant: keyboard Q chops top-down (raised blade + red ground strip = warning, then it falls), 1/12 table
//           diorama; VR: you stand over the arena shrunk to 1/12 on the floor in front of you. Your real
//           head is the boss's head (the weak point) and the right controller IS the sword: swing it low.
//    mini : keyboard WASD walk, C crouch, F fire (auto-aimed at the head);
//           VR: left stick walks, physically crouch, right trigger fires along the controller.
//    both : R resets. Your own hp bar and the enemy's (VR: head-locked at the bottom of your view),
//           controller vibration + red flash when you are hit, a short buzz when you land a hit, and a
//           VICTORY / DEFEAT screen at the end (R or, in VR, the trigger plays again). See bossUI.js.
//
// SOLO (only one client connected): this page runs BOTH sides locally and an AI plays the
// role you are not playing. AI giant: a top-down chop aimed at where you stand every 3 s and a rock
// every 10 s that lands just ahead of where your headset faces. AI mini: never stops walking, fires
// at the giant's head for 1 s, pauses 1 s, repeats, walks away from where your headset looks, and
// sidesteps half the chops. Both read the human's headset: its position (head = boss head / mini
// position) and its facing. ONLINE (a second client connects): each client runs only its own
// role and the other side arrives as events (see bossNet.js). ?role=giant|mini picks the start role.
//
// All gameplay lives in ../util/bossGame.js; this file wires input, bots, network and meshes.

import * as cg from '../render/core/cg.js';
import { ControllerBeam, buttonState, joyStickState } from '../render/core/controllerInput.js';
import { keyIsDown, keyWentDown, KEY_W, KEY_A, KEY_S, KEY_D, KEY_C, KEY_F, KEY_Q, KEY_R, KEY_V } from '../util/input_keyboard.js';
import { CFG } from '../util/bossConfig.js';
import { createBossNet, roleFromURL } from '../util/bossNet.js';
import { createGame, handleEvent, step } from '../util/bossGame.js';
import { createLasers, createStarfall, bladePoints, sweepHit, chopBlade, createSlashState, checkSwing } from '../util/auxiliaryBoss.js';
import { createBossUI } from '../util/bossUI.js';

export const init = async (model, ctx, ctxForever = {}) => {
   ctxForever.disposeBoss?.();

   const net = createBossNet();
   const deps = { bladeHit: (prev, cur, invBody, radius) => sweepHit(prev, cur, invBody, radius) };
   const games = { giant: createGame('giant', deps), mini: createGame('mini', deps) };
   let myRole = roleFromURL();                               // the human's role; null = still in the menu
   let wasOnline = false;
   let clock = 0;                                            // scene time (s), drives the starfall visuals

   const online = () => net.isOnline();
   // Events go to the game(s) this page simulates: both when solo, only mine when online.
   const targets = () => online() && myRole ? [games[myRole]] : [games.giant, games.mini];
   const view = () => games[myRole || 'giant'];              // the game we draw from
   window.bossGames = games;                                 // debug handle for the console

   // ---- scene graph: giant sees the arena as a 1/SCALE diorama; XR mini sees it 1:1 -----------------
   const DIORAMA = [0, .8, -1.5];                            // desktop: table-top view of the arena
   const FLOOR = [0, 0, -.8];                                // VR giant: arena center on the floor in front of you
   const arena = model.add();
   const ground = arena.add('cube').move(0, -.05, 0).scale(5, .05, 5).color(.2, .26, .2).dull();
   const torso = arena.add('cube').color(.35, .08, .08).dull();
   const head = arena.add('sphere').color(.7, .15, .15).dull();
   const mini = arena.add('cube').scale(.25, .9, .25).color(.2, .8, 1).dull();
   const dyn = arena.add();                                  // rebuilt every frame: rings, hp bars, blade

   const lasers = createLasers(arena, { laserLength: CFG.laser.length, laserSpeed: CFG.laser.speed,
                                        maxTravel: CFG.laser.maxTravel, width: CFG.laser.width });
   const starfall = createStarfall(arena, { fallTime: CFG.orb.fall, dropHeight: 12,
                                            starRadius: CFG.orb.blastRadius / 3 });
   const beam = new ControllerBeam(model, 'right');

   const ui = createBossUI(model);                           // own/enemy hp bars, hit feedback, result screen
   const hud = ui.hud;

   // ---- state shared by the input code ----------------------------------------------------------
   let bladeVis = null;                                      // blade to draw: { hilt, tip, swinging }
   const slashState = createSlashState();
   const slash = { phase: 'idle', t: 0, cooldown: 0, swingId: 0, wasSwinging: false, prev: null, acc: 0, center: 0 };
   const walk = [0, 0];                                      // XR mini: arena = world + walk
   let bladePrev = null, laserCooldown = 0, poseAcc = 0, switchHeld = false;
   const botGiant = { nextSwing: 2 };
   const botMini = { pos: [0, 0, 3], target: [0, 0, 3], fireT: 0, cool: 0, wasSwinging: false };
   // What the AI knows about the human's headset (arena space). Solo only, both games live on this page.
   const humanMini = { pos: [0, 0, 3], fwd: [0, 0, -1] };   // human mini: where it stands and which way it faces
   const humanGiant = { gaze: null };                         // human VR giant: [x,0,z] its gaze hits the floor, or null
   // This fight, from the human's point of view (for vibration and the result screen).
   const fight = { start: 0, end: null, dealt: 0, taken: 0, miniHp: CFG.mini.hp, bossHp: CFG.boss.hp };
   let restartHeld = true;
   const onHpChange = ev => {                               // 'state' events: someone lost hp
      if (!myRole) return;
      const hurtMe = () => { fight.taken++; ui.hurt(clock); }, hitThem = () => { fight.dealt++; ui.landed(clock); };
      if (ev.miniHp !== undefined && ev.miniHp < fight.miniHp) (myRole === 'mini' ? hurtMe : hitThem)();
      if (ev.bossHp !== undefined && ev.bossHp < fight.bossHp) (myRole === 'giant' ? hurtMe : hitThem)();
      if (ev.miniHp !== undefined) fight.miniHp = ev.miniHp;
      if (ev.bossHp !== undefined) fight.bossHp = ev.bossHp;
   };

   // ---- network -> games and fx -------------------------------------------------------------------
   for (const type of ['orb', 'pose', 'blade', 'hitBoss', 'state', 'reset'])
      net.on(type, ev => {
         for (const g of targets()) handleEvent(g, ev);
         if (type === 'orb') starfall.spawnAt(ev.x, ev.z, clock);
         if (type === 'blade') bladeVis = ev.active ? { hilt: ev.hilt, tip: ev.tip, swinging: ev.swinging } : null;
         if (type === 'state') onHpChange(ev);
         if (type === 'reset') {
            starfall.clear(); lasers.clear(); bladeVis = null;
            slash.phase = 'idle'; slash.cooldown = 0; slash.wasSwinging = false; slash.prev = null; bladePrev = null;
            walk[0] = walk[1] = 0;
            botGiant.nextSwing = 2; botMini.pos = [0, 0, 3]; botMini.target = [0, 0, 3]; botMini.fireT = 0; botMini.cool = 0;
            humanMini.pos = [0, 0, 3]; humanMini.fwd = [0, 0, -1]; humanGiant.gaze = null;
            Object.assign(fight, { start: clock, end: null, dealt: 0, taken: 0, miniHp: CFG.mini.hp, bossHp: CFG.boss.hp });
         }
      });
   net.on('shot', ev => lasers.fire(ev.start, ev.dir));

   const switchRole = () => {
      myRole = myRole === 'giant' ? 'mini' : 'giant';
      net.emit('reset');
   };

   // ---- giant: scripted top-down chop (keyboard player and the solo AI) ---------------------------
   // The blade is raised (warning), then falls in the vertical plane heading toward slash.center.
   // A red strip on the ground shows that plane during the windup: step sideways out of it.
   const bladeAt = elev => chopBlade(CFG.slash.hilt, CFG.slash.bladeLen, slash.center, elev);
   // aimAt: arena point the chop falls on (the AI aims at the player); null = straight ahead (+z).
   const driveSlash = (dt, trigger, aimAt = null) => {
      const s = CFG.slash;
      slash.cooldown = Math.max(0, slash.cooldown - dt);
      if (slash.phase === 'idle') {
         if (trigger && slash.cooldown <= 0 && games.giant.phase === 'fighting') {
            slash.phase = 'windup'; slash.t = 0; slash.prev = null;
            slash.center = aimAt ? Math.atan2(aimAt[0] - s.hilt[0], aimAt[2] - s.hilt[2]) : 0;   // locked at windup: you can dodge
         }
         else return;
      }
      slash.t += dt;
      let angle = s.arc[0];
      if (slash.phase === 'windup' && slash.t >= s.windup) { slash.phase = 'sweep'; slash.t = 0; }
      if (slash.phase === 'sweep') angle = s.arc[0] + (s.arc[1] - s.arc[0]) * Math.min(1, slash.t / s.sweep);
      const cur = bladeAt(angle);
      const swinging = checkSwing(slashState, slash.prev || cur, cur, clock);
      if (swinging && !slash.wasSwinging) slash.swingId++;
      slash.wasSwinging = swinging;
      slash.prev = cur;
      const finished = slash.phase === 'sweep' && slash.t >= s.sweep;
      slash.acc += dt;
      if (swinging || slash.acc >= 1 / CFG.net.poseHz || finished) {
         slash.acc = 0;
         net.emit('blade', { ...cur, swinging: finished ? false : swinging, swingId: slash.swingId, active: !finished });
      }
      if (finished) { slash.phase = 'idle'; slash.cooldown = s.cooldown; slash.wasSwinging = false; }
   };

   // ---- giant in XR: the right controller is the blade ---------------------------------------------
   const rayMatrix = () => cg.mMultiply(beam.m, cg.mMultiply(cg.mRotateX(-Math.PI / 4), cg.mTranslate([0, .02, 0])));
   const toArena = p => [-(p[0] - FLOOR[0]) * CFG.SCALE, (p[1] - FLOOR[1]) * CFG.SCALE, -(p[2] - FLOOR[2]) * CFG.SCALE];
   const giantXR = dt => {
      const real = bladePoints(rayMatrix(), CFG.slash.bladeLen / CFG.SCALE);        // real meters, so the swing
      const swinging = checkSwing(slashState, bladePrev || real, real, clock);       // threshold keeps its meaning
      bladePrev = real;
      if (swinging && !slash.wasSwinging) slash.swingId++;
      slash.wasSwinging = swinging;
      const cur = { hilt: toArena(real.hilt), tip: toArena(real.tip) };
      const eye = cg.mMultiply(clay.inverseRootMatrix, clay.pose.transform.matrix);
      const headArena = toArena([eye[12], eye[13], eye[14]]);                         // your head = the boss's head
      const look = [eye[8], -eye[9], eye[10]];              // headset forward (-Z) mapped into the arena (turned by PI)
      humanGiant.gaze = look[1] < -.05                      // where your gaze meets the arena floor; the AI mini avoids it
         ? [headArena[0] - headArena[1] / look[1] * look[0], 0, headArena[2] - headArena[1] / look[1] * look[2]] : null;
      bladeVis = { ...cur, swinging };
      slash.acc += dt;                                                                // every frame while swinging,
      if (swinging || slash.acc >= 1 / CFG.net.poseHz) {                              // so the mini judges a dense sweep
         slash.acc = 0;
         net.emit('blade', { ...cur, swinging, swingId: slash.swingId, active: true, head: headArena });
      }
      return headArena;
   };

   // ---- mini: keyboard, XR and bot -----------------------------------------------------------------
   const shoot = (start, dir) => net.emit('shot', { start, dir });
   const shootAtBoss = (pos, headY) => {
      const o = [pos[0], headY, pos[2]], v = games.mini.boss.head.map((x, i) => x - o[i]), n = Math.hypot(...v);
      shoot(o, v.map(x => x / n));
   };
   const miniKeyboard = dt => {
      const b = CFG.bounds, p = games.mini.mini.pos.slice();
      const dx = (keyIsDown(KEY_D) ? 1 : 0) - (keyIsDown(KEY_A) ? 1 : 0);
      const dz = (keyIsDown(KEY_S) ? 1 : 0) - (keyIsDown(KEY_W) ? 1 : 0);
      if (dx || dz) humanMini.fwd = [dx / Math.hypot(dx, dz), 0, dz / Math.hypot(dx, dz)];   // facing = last walk direction
      p[0] = Math.max(b.minX, Math.min(b.maxX, p[0] + dx * CFG.moveSpeed * dt));
      p[2] = Math.max(b.minZ, Math.min(b.maxZ, p[2] + dz * CFG.moveSpeed * dt));
      return { pos: p, headY: keyIsDown(KEY_C) ? CFG.mini.crouchHeight : 1.6 };
   };
   const miniXR = dt => {
      const head = cg.mMultiply(clay.inverseRootMatrix, clay.pose.transform.matrix);
      const x = joyStickState.left.x || 0, y = joyStickState.left.y || 0, len = Math.hypot(x, y);
      if (len > .2) {
         const yaw = Math.atan2(head[8], head[10]), c = Math.cos(yaw), s = Math.sin(yaw);
         const k = CFG.moveSpeed * dt / Math.max(1, len);
         walk[0] += (c * x + s * y) * k;
         walk[1] += (-s * x + c * y) * k;
      }
      const fl = Math.hypot(head[8], head[10]);              // headset facing on the ground plane
      if (fl > 1e-3) humanMini.fwd = [-head[8] / fl, 0, -head[10] / fl];
      const b = CFG.bounds;                                  // keep the arena position inside the bounds
      walk[0] = Math.max(b.minX - head[12], Math.min(b.maxX - head[12], walk[0]));
      walk[1] = Math.max(b.minZ - head[14], Math.min(b.maxZ - head[14], walk[1]));
      return { pos: [head[12] + walk[0], 0, head[14] + walk[1]], headY: head[13] };
   };
   const fireXR = () => {
      const M = rayMatrix(), d = cg.normalize(M.slice(8, 11).map(v => -v));
      shoot([M[12] + walk[0], M[13], M[14] + walk[1]], d);
   };
   // AI mini: always walking; picks spots away from where the giant's headset looks; fires 1 s, pauses 1 s.
   const miniBot = dt => {
      const B = CFG.bot, b = CFG.bounds, p = botMini.pos, gaze = humanGiant.gaze;
      const rand = () => [b.minX + Math.random() * (b.maxX - b.minX), 0, b.minZ + Math.random() * (b.maxZ - b.minZ)];
      const fromGaze = q => gaze ? Math.hypot(q[0] - gaze[0], q[2] - gaze[2]) : 0;
      const pick = () => { let best = rand(); for (let i = 0; i < 5; i++) { const c = rand(); if (fromGaze(c) > fromGaze(best)) best = c; } return best; };
      let t = botMini.target;
      if (Math.hypot(t[0] - p[0], t[2] - p[2]) < .2 || (gaze && fromGaze(t) < B.gazeAvoid)) t = botMini.target = pick();
      const dx = t[0] - p[0], dz = t[2] - p[2], d = Math.hypot(dx, dz);
      if (d > 1e-6) { const k = Math.min(d, B.walkSpeed * dt) / d; p[0] += dx * k; p[2] += dz * k; }
      const raised = !!bladeVis && !bladeVis.swinging && bladeVis.tip[1] - bladeVis.hilt[1] > CFG.slash.bladeLen * .5;
      if (raised && !botMini.wasSwinging && Math.random() < .5) {   // half the time: sidestep out of the chop plane
         const yaw = Math.atan2(bladeVis.tip[0] - bladeVis.hilt[0], bladeVis.tip[2] - bladeVis.hilt[2]), side = Math.random() < .5 ? 2 : -2;
         botMini.target = [Math.max(b.minX, Math.min(b.maxX, p[0] + Math.cos(yaw) * side)), 0,
                           Math.max(b.minZ, Math.min(b.maxZ, p[2] - Math.sin(yaw) * side))];
      }
      botMini.wasSwinging = raised;
      const headY = 1.6;
      botMini.fireT = (botMini.fireT + dt) % (B.fireOn + B.fireOff);
      botMini.cool = Math.max(0, botMini.cool - dt);
      if (botMini.fireT < B.fireOn && botMini.cool <= 0 && games.mini.phase === 'fighting') {
         shootAtBoss(p, headY);                              // aims at the boss head = the VR giant's real head
         botMini.cool = CFG.laser.cooldown;
      }
      return { pos: p.slice(), headY };
   };

   // ---- role menu -------------------------------------------------------------------------------
   // Two big buttons. VR: point the right controller and pull the trigger. Desktop: press 1 or 2.
   const choices = [
      { role: 'giant', text: 'GIANT', x: -.38, color: [.8, .2, .15], hover: [1, .5, .3] },
      { role: 'mini',  text: 'MINI',  x:  .38, color: [.1, .55, .8], hover: [.4, .9, 1] },
   ];
   for (const c of choices) {
      c.pad = model.add('square').dull();
      c.label = model.add('label').info(c.text).color(1, 1, 1).dull();
   }
   const title = model.add('label').info('Choose your role').color(1, 1, 1).dull();
   let menuTrigger = false;
   const showMenu = (visible, inXR) => {
      const headM = cg.mMultiply(clay.inverseRootMatrix, clay.pose.transform.matrix);
      const put = (node, x, y, z) => (inXR ? node.setMatrix(headM) : node.identity()).move(x, inXR ? y : y + 1.35, inXR ? z : -1.2);
      let picked = null;
      for (const c of choices) {
         if (!visible) { c.pad.identity().scale(0); c.label.identity().scale(0); continue; }
         put(c.pad, c.x, 0, -1.3).scale(.32, .22, 1);
         const hit = inXR ? beam.hitRect(c.pad.getGlobalMatrix()) : null;
         c.pad.color(hit ? c.hover : c.color);
         put(c.label, c.x, 0, -1.29).scale(.07);
         if (hit) picked = c.role;
      }
      if (!visible) title.identity().scale(0);
      else put(title, 0, .3, -1.3).scale(.05);
      if (picked && inXR && !!buttonState.right[0]?.pressed && !menuTrigger) { menuTrigger = true; return picked; }
      menuTrigger = !!buttonState.right[0]?.pressed;
      if (visible && !inXR && keyWentDown(49)) return 'giant';
      if (visible && !inXR && keyWentDown(50)) return 'mini';
      return null;
   };

   // ---- drawing ---------------------------------------------------------------------------------
   const draw = inXR => {
      const g = view(), m = online() ? g.mini : games.mini.mini;
      const xrMini = myRole === 'mini' && inXR, xrGiant = myRole === 'giant' && inXR;
      if (xrMini) arena.identity().move(-walk[0], 0, -walk[1]);                         // 1:1 around the player
      else if (xrGiant) arena.identity().move(...FLOOR).turnY(Math.PI).scale(1 / CFG.SCALE);   // 1/12 on the floor
      else arena.identity().move(...DIORAMA).scale(1 / CFG.SCALE);                      // desktop table diorama
      const bh = g.boss.head, R = CFG.boss.headRadius;
      head.identity().move(bh[0], bh[1], bh[2]).scale(R).opacity(xrGiant ? 0 : 1);      // the giant's own body stays hidden
      torso.identity().move(bh[0], (bh[1] - R) / 2, bh[2]).scale(2.2, Math.max(.1, (bh[1] - R) / 2), 1.2).opacity(xrGiant ? 0 : 1);
      const crouched = m.headY < CFG.mini.crouchHeight + .2;
      const h = crouched ? CFG.mini.crouchHeight / 2 : CFG.mini.bodyHalf[1];
      mini.identity().move(m.pos[0], h, m.pos[2]).scale(.3, h, .3).opacity(xrMini ? 0 : m.invuln > 0 ? .4 : 1);
      ground.color(g.phase === 'win' ? [.2, .6, .2] : g.phase === 'lose' ? [.6, .15, .15] : [.2, .26, .2]);

      while (dyn.nChildren()) dyn.remove(0);
      for (const r of g.rings) {                             // shockwave rings
         const age = g.t - r.born;
         dyn.add('diskY').move(r.x, .03, r.z).scale(CFG.orb.blastRadius * (.4 + .6 * age)).color(1, .5, 0).opacity(1 - age);
      }
      const bw = 6 * g.boss.hp / g.boss.maxHp;               // boss hp bar: over the head, or over the arena for the VR giant
      const barAt = xrGiant ? [0, 12, 0] : [bh[0], bh[1] + 2, bh[2]];
      dyn.add('cube').move(barAt[0] - (6 - bw) / 2, barAt[1], barAt[2]).scale(bw / 2, .15, .15).color(1, .1, .1);
      for (let i = 0; i < m.maxHp; i++)                      // mini hp: crystals on the ground
         dyn.add('sphere').move(m.pos[0] - .5 + i * .5, .15, m.pos[2] + .6).scale(.12)
            .color(i < m.hp ? [.3, 1, 1] : [.15, .15, .15]);
      if (bladeVis) {                                        // blade: orange while idle, red while a swing counts
         const tube = dyn.add('tubeZ').color(bladeVis.swinging ? [1, .1, .1] : [1, .6, .1]);
         tube.identity().link(bladeVis.hilt, bladeVis.tip, .12);
         const { hilt: H, tip: T } = bladeVis, L = CFG.slash.bladeLen;
         if (!bladeVis.swinging && T[1] - H[1] > L * .5) {     // raised blade: mark the strip it will chop down on
            const yaw = Math.atan2(T[0] - H[0], T[2] - H[2]);
            dyn.add('cube').move(H[0] + Math.sin(yaw) * L / 2, .03, H[2] + Math.cos(yaw) * L / 2)
               .turnY(yaw).scale(.6, .01, L / 2).color(1, 0, 0).opacity(.45);
         }
      }

      // own / enemy bars, result screen
      const giantInfo = { name: 'GIANT', hp: g.boss.hp, max: g.boss.maxHp, color: [1, .3, .2] };
      const miniInfo  = { name: 'MINI',  hp: m.hp,      max: m.maxHp,      color: [.3, 1, 1] };
      const own = myRole === 'mini' ? miniInfo : giantInfo, enemy = myRole === 'mini' ? giantInfo : miniInfo;
      let result = null;
      if (g.phase !== 'fighting') {
         if (fight.end === null) fight.end = clock;
         const won = (g.phase === 'win') === (myRole === 'mini');
         result = { title: won ? 'VICTORY' : 'DEFEAT', color: won ? [.3, 1, .4] : [1, .3, .3],
                    lines: [`Time ${(fight.end - fight.start).toFixed(1)} s`,
                            `Damage dealt ${fight.dealt}    Hits taken ${fight.taken}`,
                            inXR ? 'Trigger: play again    B: switch role' : 'R: play again    V: switch role'] };
      }
      const hudText = `you: ${myRole}   mode: ${online() ? 'online' : 'solo (AI plays ' + (myRole === 'giant' ? 'mini' : 'giant') + ')'}\n` +
         (myRole === 'mini' ? 'WASD walk · C crouch · F fire' : 'Q chop') + ' · V (VR: B) switch role · R reset' +
         (online() ? '' : myRole === 'mini' ? '\nAI giant: chop aimed at you every 3 s · rock every 10 s where you face'
                                            : '\nAI mini: always moving · fires 1 s on / 1 s off · avoids your gaze');
      ui.update({ inXR, now: clock, own: { ...own, name: 'YOU (' + own.name + ')' }, enemy, result, hudText });
   };

   // ---- main loop -------------------------------------------------------------------------------
   let last = null;
   model.animate(() => {
      const now = model.time;
      const dt = last === null ? 0 : Math.min(.1, Math.max(0, now - last));
      last = now;

      const inXR = !!window.isXR?.();
      beam.isEnabled = inXR;
      beam.update();                                         // sets beam.m in XR, hides the beam on desktop

      if (!myRole) {                                         // role menu: nothing else runs until you choose
         arena.identity().scale(0);
         hud.textContent = 'Choose your role:  1 = GIANT   2 = MINI   (VR: point and pull the trigger)';
         const picked = showMenu(true, inXR);
         if (picked) { myRole = picked; showMenu(false, inXR); net.emit('reset'); }
         return;
      }
      clock += dt;

      net.poll();                                            // events -> handleEvent / fx

      const toggle = inXR && !!buttonState.right[5]?.pressed;            // same buttons as village.js
      if (keyWentDown(KEY_V) || (toggle && !switchHeld)) switchRole();
      switchHeld = toggle;
      if (keyWentDown(KEY_R)) net.emit('reset');
      if (online() !== wasOnline) { wasOnline = online(); net.emit('reset'); }   // a second client joined or left

      const runGiant = !online() || myRole === 'giant';
      const runMini = !online() || myRole === 'mini';

      if (runGiant) {
         let local = {};
         if (myRole === 'giant') {
            if (inXR) local = { head: giantXR(dt) };
            else driveSlash(dt, keyWentDown(KEY_Q));
         } else {                                            // AI giant: aimed swing every 3 s, rock every 10 s
            const B = CFG.bot, p = humanMini.pos, f = humanMini.fwd;
            botGiant.nextSwing -= dt;
            const go = botGiant.nextSwing <= 0 && slash.phase === 'idle';
            if (go) { botGiant.nextSwing = B.swingEvery; slash.cooldown = 0; }
            driveSlash(dt, go, p);                           // swing centred on where your headset stands
            local = { orbEvery: B.orbEvery,                  // rock lands just ahead of where your headset faces
                      orbAt: [p[0] + f[0] * B.rockAhead, p[2] + f[2] * B.rockAhead] };
         }
         step(games.giant, dt, local);
      }

      if (runMini) {
         let local;
         if (myRole === 'mini') {
            local = inXR ? miniXR(dt) : miniKeyboard(dt);
            laserCooldown = Math.max(0, laserCooldown - dt);
            const trigger = inXR ? !!buttonState.right[0]?.pressed : keyIsDown(KEY_F);
            if (trigger && laserCooldown <= 0 && games.mini.phase === 'fighting') {
               inXR ? fireXR() : shootAtBoss(local.pos, local.headY);
               laserCooldown = CFG.laser.cooldown;
            }
            humanMini.pos = local.pos;
         } else local = miniBot(dt);
         poseAcc += dt;
         if (poseAcc >= 1 / CFG.net.poseHz) { poseAcc = 0; net.emit('pose', { pos: local.pos, headY: local.headY }); }
         step(games.mini, dt, local);
      }

      starfall.update(clock);
      const hit = runMini && lasers.update(dt, { center: games.mini.boss.head, radius: CFG.boss.headRadius });
      if (!runMini) lasers.update(dt, null);
      if (hit) net.emit('hitBoss', { dmg: 1 });

      for (const g of [games.giant, games.mini])             // inactive games never queue anything
         for (const o of g.outbox.splice(0)) net.emit(o.type, o.payload);
      draw(inXR);

      const trig = inXR && !!buttonState.right[0]?.pressed;   // VR: trigger on the result screen plays again
      if (fight.end !== null && clock - fight.end > 1 && trig && !restartHeld) net.emit('reset');
      restartHeld = trig;
   });

   ctxForever.disposeBoss = () => { ui.dispose(); lasers.clear(); starfall.clear(); };
};

export const deinit = (model, ctx, ctxForever) => ctxForever.disposeBoss?.();
