/*
   This is a simple "hello world" example: A rotating cube.
*/

export const init = async model => {
   let cube = model.add('cube');
   model.move(0,1.5,0).scale(.3).animate(() => {
      cube.identity().turnY(model.time).scale(.5);
   });
}

