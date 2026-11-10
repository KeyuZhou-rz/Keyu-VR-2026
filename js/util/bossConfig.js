// Boss fight tuning constants. Everything is in ARENA space: meters, y up,
// ground at y = 0, origin at the arena center. Times are in seconds.
// The mini player is rendered 1:1; the giant client renders the arena at 1/SCALE.

export const CFG = {
   SCALE: 12,                                   // giant view = arena / SCALE

   bounds: { minX: -5, maxX: 5, minZ: -5, maxZ: 5 },   // where the mini player may walk and orbs may land

   boss: {
      hp: 10,
      head: [0, 10, -9],                        // bot giant's head; a VR giant's real head replaces it
      headRadius: 1.2,                          // for the mini player's laser hit test
   },

   mini: {
      hp: 3,
      invuln: 1.0,                              // seconds of immunity after taking a hit
      bodyHalf: [0.4, 1.0, 0.4],                // half extents of the body box (standing), generous because a VR giant swings by hand
      crouchHeight: 0.9,                        // body height while crouching
   },

   orb: {                                       // starfall-style barrage, owned by the giant
      interval: 1.5,                            // seconds between orbs
      fall: 1.2,                                // seconds from spawn to impact
      blastRadius: 1.5,                         // ground damage radius at impact
   },

   slash: {
      bladeLen: 12,                             // blade length in arena meters
      bladeRadius: 0.5,                         // half thickness used by forseg (arena m; 0.5 = 4 cm for a VR giant)
      hilt: [0, 3, -5],                         // scripted (desktop/bot) chop: hand position, whole arena within reach
      arc: [1.3, -1.0],                         // scripted chop: blade elevation (rad) from raised high to past the ground.
                                                // It falls top-down in the vertical plane through the target, so you
                                                // dodge by stepping sideways (crouching no longer helps)
      windup: 0.8,                              // seconds the raised blade warns the mini player
      sweep: 0.6,                               // seconds of the actual swing
      cooldown: 3,                              // seconds between swings
   },

   bot: {                                       // solo mode: the AI plays the role nobody is playing
      swingEvery: 3,                            // giant: seconds between swing starts, aimed at the player
      orbEvery: 10,                             // giant: seconds between rocks
      rockAhead: 1.0,                           // giant: rock lands this far in front of where the player faces (inside the blast, so standing still is hit)
      fireOn: 1, fireOff: 1,                    // mini: fire for 1 s, pause 1 s, repeat
      walkSpeed: 1.5,                           // mini: never stops walking (m/s)
      gazeAvoid: 3,                             // mini: picks a new spot when the giant looks within this many m of it
   },

   laser: { speed: 30, length: 1.5, maxTravel: 60, width: 0.05, cooldown: 0.35 },
   moveSpeed: 3,                                // mini player walking speed on desktop (m/s)

   net: {
      poseHz: 20,                               // how often pose/blade events are sent
   },
};
