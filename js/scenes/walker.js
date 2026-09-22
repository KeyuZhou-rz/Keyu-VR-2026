/*
   A small Star-Wars-style walker made from the same hierarchical joints
   used by jointed.js.
*/

const makeLeg = (body, x, z, phase) => {
   const upperLength = .55;
   const lowerLength = .55;

   const hip   = body.add().move(x, -.12, z);
   const knee  = hip.add();
   const ankle = knee.add();

   hip.add('sphere').scale(.11).color(.18, .2, .22);
   hip.add('tubeY').move(0, -upperLength / 2, 0)
      .scale(.08, upperLength / 2, .08).color(.28, .3, .32);

   knee.add('sphere').scale(.09).color(.12, .14, .16);
   knee.add('tubeY').move(0, -lowerLength / 2, 0)
      .scale(.065, lowerLength / 2, .065).color(.24, .26, .28);

   ankle.add('cube').move(0, -.04, .04)
      .scale(.14, .06, .18).color(.16, .18, .2);

   return (time) => {
      const swing = Math.sin(time * 2.2 + phase);
      const lift  = Math.max(0, swing) * .12;

      hip.identity().move(x, -.12 + lift, z)
         .turnX(.42 * swing);
      knee.identity().move(0, -upperLength, 0)
          .turnX(.55 - .28 * swing);
      ankle.identity().move(0, -lowerLength, 0)
          .turnX(-.18 * swing);
   };
};

export const init = async model => {
   const walker = model.add();

   // Main body: one rectangular block.
   walker.add('cube').scale(.85, .2, .5).color(.2, .22, .24);


   const animateLegs = [
      makeLeg(walker, -.65, -.36, 0),
      makeLeg(walker,  .65,  .36, 0),
      makeLeg(walker, -.65,  .36, Math.PI),
      makeLeg(walker,  .65, -.36, Math.PI)
   ];

   // Keep the walker fixed at the center; only its legs animate.
   model.move(0, 1.45, 0).scale(.55).animate(() => {
      const t = model.time;

      walker.identity();

      animateLegs.forEach(animate => animate(t));
   });
};
