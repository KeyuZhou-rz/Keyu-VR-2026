/*
   Manually build the alphabet from linefont.js and render it.
*/

import * as cg from "../render/core/cg.js";
import { Structure } from "../render/core/structure.js";
import { linefont } from "../render/core/linefont.js";

export const init = async model => {
   let myPaths = [];
   for (let n = 1 ; n < linefont.length ; n++) {
      let x = -.25+(n % 16     ) * .04;
      let y =  .50-(n / 16 >> 0) * .08;
      let paths = linefont[n].paths;
      for (let i = 0 ; i < paths.length ; i++) {
         let myPath = [];
         let path = paths[i];
         for (let j = 0 ; j < path.length ; j++) {
            let p = path[j];
            myPath.push([x + .0005 * p[0], y - .0005 * p[1], 0]);
         }
         myPaths.push(myPath);
      }
   }
   let pathsMesh = clay.definePathsMesh('myPaths', .004, myPaths);
   model.add('myPaths');
   model.animate(() => {
      model.identity().move(.24,.5,0).scale(3.5);
   });
}

