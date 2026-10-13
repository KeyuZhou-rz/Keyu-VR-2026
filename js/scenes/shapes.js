/*
   This scene creates objects with a variety of shapes,
   applies color and texture to each object,
   and animates object position, rotation and scale.
*/

export const init = async model => {

   // ASSIGN A TEXTURE SLOT TO A TEXTURE SOURCE IMAGE.

   model.txtrSrc(1, '../media/textures/brick.png');

   // VARIOUS PREDEFINED SHAPES.

   let shapeNames = `
       coneX coneY coneZ cube cube,rounded cubeXZ
       pyramidX pyramidY pyramidZ ringX ringY ringZ
       sphere square octahedron torusX torusY torusZ
       tubeX tubeY tubeZ diskX diskY diskZ`;

   let shapes = shapeNames.replace(/\s+/g, ' ').split(' ');

   // CREATE OBJECTS, AND ADD COLORS AND TEXTURES.

   for (let n = 0 ; n < shapes.length ; n++)
      model.add(shapes[n]);
   for (let n = 0 ; n < shapes.length ; n += 2)
      model.child(n).txtr(1);
   for (let n = 1 ; n < shapes.length ; n += 2)
      model.child(n).color(1.23*n%1,2.34*n%1,3.45*n%1);

   // AT EVERY ANIMATION FRAME, PLACE AND ROTATE OBJECTS.

   model.move(0,1.8,0).scale(.4).animate(() => {
      for (let n = 0 ; n < shapes.length ; n++) {
         let row = n / 6 >> 0;
         let col = n % 6;
         model.child(n).identity().move(col - 2.5, row - 2.5, 0)
	               .turnX(.5 * model.time)
	               .turnY(.8 * model.time)
	               .scale(.35);
      }
   });
}
