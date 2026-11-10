// Player-facing UI for the boss fight: your own hp bar, the enemy's bar, hit feedback
// (controller vibration, red flash / screen shake) and the end-of-fight result screen.
//
//    const ui = createBossUI(model);
//    ui.hurt(now);   ui.landed(now);              // you were hit / you hit the other side
//    ui.update({ inXR, now, own, enemy, result, hudText });   // once per frame
//       own / enemy: { name, hp, max, color:[r,g,b] }
//       result     : null while fighting, else { title, color:[r,g,b], lines:[...] }
//
// In VR everything is head-locked (bars at the bottom of your view, result panel in front).
// On desktop the bars live in the top-left HUD and the result is a centred overlay.

import * as cg from '../render/core/cg.js';

const vibrate = (hand, intensity, ms) => {
   try { window.vibrate?.(hand, intensity, ms); } catch (e) { }       // controllers without haptics: ignore
};
const css = c => `rgb(${c.map(v => Math.round(255 * Math.min(1, v))).join(',')})`;

export const createBossUI = model => {
   // ---- desktop DOM -------------------------------------------------------------------------------
   const hud = document.createElement('div');
   hud.style.cssText = 'position:fixed;left:8px;top:8px;color:#fff;font:14px monospace;background:#0008;padding:6px 8px;white-space:pre;z-index:9';
   document.body.appendChild(hud);
   const overlay = document.createElement('div');
   overlay.style.cssText = 'position:fixed;left:50%;top:40%;transform:translate(-50%,-50%);color:#fff;font:18px monospace;' +
                           'background:#000c;padding:24px 40px;text-align:center;z-index:10;display:none;border-radius:8px';
   document.body.appendChild(overlay);
   const canvas = () => document.querySelector('canvas');

   // ---- VR head-locked panel ---------------------------------------------------------------------
   const panel = model.add().scale(0);                       // hidden until the first update
   const flash = panel.add('square').color(1, 0, 0).dull();
   const makeBar = () => ({ bg: panel.add('cube').color(.1, .1, .1).dull(), fill: panel.add('cube').dull(),
                            label: panel.add('label').info(' ').color(1, 1, 1).dull() });
   const bars = [makeBar(), makeBar()];
   const resBg = panel.add('cube').color(0, 0, 0).dull();
   const resTitle = panel.add('label').info(' ').dull();
   const resLines = [0, 1, 2].map(() => panel.add('label').info(' ').color(1, 1, 1).dull());

   const fx = { hurtUntil: -1, hitUntil: -1, now: 0 };

   const hurt = now => {
      fx.hurtUntil = now + .3;
      vibrate('left', 1, 250);
      vibrate('right', 1, 250);
   };
   const landed = now => {
      fx.hitUntil = now + .2;
      vibrate('right', .5, 80);
   };

   const drawBarXR = (bar, info, y) => {
      const W = .24, H = .012, Z = -.6, x0 = -W / 2, f = Math.max(0, info.hp / info.max);
      bar.bg.identity().move(0, y, Z).scale(W / 2, H / 2, .001);
      bar.fill.identity().move(x0 + W * f / 2, y, Z + .002).scale(Math.max(1e-4, W * f / 2), H / 2, .001).color(info.color);
      bar.label.info(`${info.name}  ${info.hp}/${info.max}`).identity().move(0, y + .016, Z).scale(.01);
   };
   const barHTML = (info, flashing) => {
      const f = Math.max(0, info.hp / info.max) * 100;
      return `<div style="margin-top:4px">${info.name} ${info.hp}/${info.max}</div>` +
             `<div style="width:220px;height:12px;background:#222;outline:${flashing ? '2px solid #f33' : 'none'}">` +
             `<div style="width:${f}%;height:100%;background:${css(info.color)}"></div></div>`;
   };

   const update = ({ inXR, now, own, enemy, result, hudText }) => {
      fx.now = now;
      const hurting = now < fx.hurtUntil, hitting = now < fx.hitUntil;

      if (inXR) {
         panel.setMatrix(cg.mMultiply(clay.inverseRootMatrix, clay.pose.transform.matrix));
         drawBarXR(bars[0], own, -.16);
         drawBarXR(bars[1], enemy, -.21);
         const a = hurting ? (fx.hurtUntil - now) / .3 : 0;          // red flash fades out
         flash.identity().move(0, 0, -.3).scale(a > 0 ? .6 : 0).opacity(.45 * a);
         if (result) {
            resBg.identity().move(0, .02, -.92).scale(.34, .17, .001).opacity(.85);
            resTitle.info(result.title).color(result.color).identity().move(0, .1, -.9).scale(.05);
            result.lines.forEach((t, i) => resLines[i]?.info(t).identity().move(0, .02 - i * .05, -.9).scale(.018));
         } else {
            resBg.identity().scale(0); resTitle.identity().scale(0);
            for (const l of resLines) l.identity().scale(0);
         }
         hud.style.display = overlay.style.display = 'none';
      } else {
         panel.identity().scale(0);
         hud.style.display = '';
         hud.innerHTML = hudText.replace(/&/g, '&amp;').replace(/</g, '&lt;') +
                         barHTML(own, hurting) + barHTML(enemy, hitting) +
                         (hitting ? '<div style="color:#ff0;font-weight:bold">HIT!</div>' : '');
         const c = canvas();                                          // desktop "vibration": shake the view
         if (c) c.style.transform = hurting ? `translate(${(Math.random() - .5) * 16}px,${(Math.random() - .5) * 16}px)` : '';
         if (result) {
            overlay.style.display = '';
            overlay.innerHTML = `<div style="font-size:48px;font-weight:bold;color:${css(result.color)}">${result.title}</div>` +
                                result.lines.map(t => `<div style="margin-top:8px">${t}</div>`).join('');
         } else overlay.style.display = 'none';
      }
   };

   const dispose = () => {
      hud.remove(); overlay.remove();
      const c = canvas(); if (c) c.style.transform = '';
   };

   return { hud, hurt, landed, update, dispose };
};
