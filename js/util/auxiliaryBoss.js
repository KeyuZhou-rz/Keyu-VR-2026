import * as cg from "../render/core/cg.js";

// lasers: a factory that owns its laser meshes.
// fire(start, dir) spawns one laser; update(dt, target) advances them and returns
// true if any laser hit the target; clear() removes every laser mesh.
// target is { center: [x,y,z], radius } in world space, or null for no target.
export const createLasers = (model, opts = {}) => {
    const {
        laserLength = 0.25,
        laserSpeed  = 8,
        maxTravel   = 10,
        width       = 0.008,
        color       = [1, 0.1, 0.1],
    } = opts;

    const lasers = [];

    const fire = (start, dir) => {
        const mesh = model.add('tubeZ').color(color[0], color[1], color[2]).dull(1);
        lasers.push({ start, dir, age: 0, mesh });
    };

    const clear = () => {
        for (const laser of lasers) model.remove(laser.mesh);
        lasers.length = 0;
    };

    // reuse of the hw3 laser update: returns true if a laser hit this frame
    const update = (dt, target) => {
        let hit = false;
        for (let i = lasers.length - 1; i >= 0; --i) {
            const laser = lasers[i];
            const previousTravel = laserSpeed * laser.age;
            laser.age += dt;
            const travel = laserSpeed * laser.age;
            const pointAt = distance => laser.start.map((value, axis) => value + laser.dir[axis] * distance);
            const tail = pointAt(travel);
            const head = pointAt(travel + laserLength);
            let laserHit = false;

            if (target && !hit) {
                const center = target.center;
                const sweepStart = pointAt(previousTravel);
                const sweep = cg.subtract(head, sweepStart);
                const offset = cg.subtract(center, sweepStart);
                const t = Math.max(0, Math.min(1, cg.dot(offset, sweep) / cg.dot(sweep, sweep)));
                const closest = cg.add(sweepStart, cg.scale(sweep, t));
                laserHit = cg.distance(closest, center) < target.radius;
                hit = laserHit;
            }

            if (laserHit || travel > maxTravel) {
                model.remove(laser.mesh);
                lasers.splice(i, 1);
            } else {
                laser.mesh.identity().link(tail, head, width);
            }
        }
        return hit;
    };

    return { fire, update, clear };
};

export let bladePoints = (beamM, bladeLen) => {
    return {
        hilt: cg.mTransform(beamM, [0,0,0]),
        tip: cg.mTransform(beamM, [0,0,-bladeLen]),
    };
}

// here we use a cross to implement the judge logic
// each segment is a [A, B] pair of world-space points
export let sweepSeg = (prev, cur) => {
    const seg = [];
    seg.push([prev.hilt, prev.tip]);
    seg.push([cur.hilt, cur.tip]);
    seg.push([cur.hilt, prev.tip]);
    seg.push([prev.hilt, cur.tip]);
    seg.push([prev.tip, cur.tip]);

    return seg
}

// slab test: does segment A-B (local space) intersect the box [-1,1]^3 grown by r
let segHitsLocalBox = (A, B, r) => {
    let tMin = 0, tMax = 1;
    const D = [B[0]-A[0], B[1]-A[1], B[2]-A[2]];
    for (let i = 0; i < 3; i++) {
        const lo = -1 - r, hi = 1 + r;
        if (Math.abs(D[i]) < 1e-9) {
            if (A[i] < lo || A[i] > hi) return false;
        } else {
            let t1 = (lo - A[i]) / D[i];
            let t2 = (hi - A[i]) / D[i];
            if (t1 > t2) [t1, t2] = [t2, t1];
            tMin = Math.max(tMin, t1);
            tMax = Math.min(tMax, t2);
            if (tMin > tMax) return false;
        }
    }
    return true;
}

// function two: test every segment from sweepSeg against one target.
// segs: world-space [A, B] pairs; invObj: inverse of the target's world matrix
// (computed by the caller in update); r: blade half-thickness.
export let forseg = (segs, invObj, r) => {
    for (const [P, Q] of segs) {
        const A = cg.mTransform(invObj, P);
        const B = cg.mTransform(invObj, Q);
        if (segHitsLocalBox(A, B, r)) return true;
    }
    return false;
}

// Top-down chop: blade from `hilt`, `len` long, in the vertical plane that heads toward
// `center` (radians around +y, 0 = +z), tilted `elev` radians above the horizon.
export let chopBlade = (hilt, len, center, elev) => {
    const d = [Math.sin(center) * Math.cos(elev), Math.sin(elev), Math.cos(center) * Math.cos(elev)];
    return { hilt, tip: hilt.map((v, i) => v + len * d[i]) };
}

// Swept hit test that also covers the area BETWEEN two blade samples.
// sweepSeg only tests the two blade lines plus the tip/diagonal edges, so a target
// thinner than the gap between samples (a VR giant moves the tip ~25 cm = 3 arena m
// between 20 Hz samples, the mini body is 0.8 arena m wide) slips through. Here the
// motion is cut into sub-steps no longer than maxStep before testing each one.
export let sweepHit = (prev, cur, invObj, r, maxStep = 0.25) => {
    const lerp = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
    const move = Math.max(cg.distance(prev.hilt, cur.hilt), cg.distance(prev.tip, cur.tip));
    const n = Math.min(64, Math.max(1, Math.ceil(move / maxStep)));
    let a = prev;
    for (let k = 1; k <= n; k++) {
        const t = k / n;
        const b = { hilt: lerp(prev.hilt, cur.hilt, t), tip: lerp(prev.tip, cur.tip, t) };
        if (forseg(sweepSeg(a, b), invObj, r)) return true;
        a = b;
    }
    return false;
}

// function three: speed detection and cooldown (all times in seconds)
const SLASH_SPEED = 1.5;       // m/s, tip speed that starts a swing (tune)
const SLASH_END_RATIO = 0.5;   // swing ends when speed drops below SLASH_SPEED * this
const COOLDOWN_S = 0.3;        // same target cannot be hit again within this window

export let createSlashState = () => ({
    lastTime: null,
    swinging: false,
    hitThisSwing: new Set(),
    lastHitAt: new Map(),
});

// call once per frame with the previous and current blade points (world space)
// now: current time in seconds. Returns whether a swing is in progress.
export let checkSwing = (state, prev, cur, now) => {
    const dt = state.lastTime === null ? 1 / 60 : Math.max(now - state.lastTime, 1e-3);
    state.lastTime = now;
    const speed = cg.distance(cur.tip, prev.tip) / dt;

    if (!state.swinging && speed > SLASH_SPEED) {
        state.swinging = true;
        state.hitThisSwing.clear();
    } else if (state.swinging && speed < SLASH_SPEED * SLASH_END_RATIO) {
        state.swinging = false;
    }
    return state.swinging;
}

// true if this target may be hit now: inside a swing, not yet hit in this swing, off cooldown
export let canHit = (state, target, now) =>
    state.swinging &&
    !state.hitThisSwing.has(target) &&
    now - (state.lastHitAt.get(target) ?? -Infinity) > COOLDOWN_S;

// call after a confirmed hit (forseg returned true and canHit returned true)
export let recordHit = (state, target, now) => {
    state.hitThisSwing.add(target);
    state.lastHitAt.set(target, now);
}

// starfall: spheres drop onto given points and land with a red warning first.
// Points are added with spawnAt(x, z, now) into a queue; update(now) reads the
// queue and launches a falling sphere for each entry. When a sphere lands,
// opts.onLand(x, z) is called.
//
// Usage:
//    const starfall = createStarfall(model, { onLand: (x, z) => { ... } });
//    starfall.spawnAt(x, z, model.time);
//    model.animate(() => starfall.update(model.time));
export const createStarfall = (model, opts = {}) => {
   const {
      fallTime      = 1.0,   // seconds from the sky to the ground
      dropHeight    = 3.0,   // height at which a star starts falling
      warnTime      = 0.5,   // how long before landing the red highlight appears
      starRadius    = 0.12,
      groundY       = 0,
      starColor     = [1, 0.85, 0.2],
      warnColor     = [1, 0, 0],
      onLand        = null,  // (x, z) => void, called on impact
   } = opts;

   const landings = [];   // queue of { x, z, now }, filled by spawnAt, drained by update
   const stars = [];      // stars currently in the air

   const spawnAt = (x, z, now) => {
      landings.push({ x, z, now });
   };

   const launch = (point) => {
      const mesh = model.add();                                  // falling sphere
      const warn = model.add('diskY').scale(0);                  // landing marker, hidden until warning
      return {
         x: point.x,
         z: point.z,
         launchTime: point.now,
         landTime: point.now + fallTime,
         mesh: mesh,
         warn: warn,
         sphere: mesh.add('sphere').scale(starRadius).color(starColor[0], starColor[1], starColor[2]),
      };
   };

   const update = now => {
      // 1. read the queue and launch a star for each stored point
      while (landings.length > 0) {
         stars.push(launch(landings.shift()));
      }

      // 2. move stars, show the warning, remove those that have landed
      for (let i = stars.length - 1; i >= 0; i--) {
         const s = stars[i];
         const f = Math.min(1, (now - s.launchTime) / fallTime);   // 0 at drop, 1 at impact
         const y = groundY + dropHeight * (1 - f * f);             // accelerating fall

         s.mesh.identity().move(s.x, y, s.z);

         const remaining = s.landTime - now;
         if (remaining <= warnTime) {
            s.warn.identity().move(s.x, groundY + 0.005, s.z)
                              .scale(starRadius * 3)
                              .color(warnColor[0], warnColor[1], warnColor[2]);
         }

         if (f >= 1) {
            model.remove(s.mesh);
            model.remove(s.warn);
            stars.splice(i, 1);
            if (onLand) onLand(s.x, s.z);
         }
      }
   };

   const clear = () => {
      for (const s of stars) {
         model.remove(s.mesh);
         model.remove(s.warn);
      }
      stars.length = 0;
      landings.length = 0;
   };

   return { spawnAt, update, clear };
};
