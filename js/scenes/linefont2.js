/*
   Use defineTextMesh() to create displayable text.
*/

import * as cg from "../render/core/cg.js";
import { Structure } from "../render/core/structure.js";

export const init = async model => {
   let textObj = clay.defineTextMesh('myText', `\
Now is the time
for all good men
to come to the aid
of their party.`);
   model.add('myText').color(0,.25,.5);
   model.animate(() => {
      model.identity().move(-.1,1.5,0);
   });
}

