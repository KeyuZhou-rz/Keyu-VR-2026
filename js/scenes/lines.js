/*
   Use definePathsMesh() to create lines.
*/

import * as cg from "../render/core/cg.js";
import { Structure } from "../render/core/structure.js";
import { linefont } from "../render/core/linefont.js";

export const init = async model => {
/*
   let myPaths = [
     [
        [-.1, .1, .1],
        [ .1, .1,-.1],
        [-.1,-.1,-.1],
        [ .1,-.1, .1],
     ],
   ];
*/
   let myPaths = [];
   let myPath = [];
   let N = 200;
   for (let n = -1 ; n <= 1 ; n += 2)
      for (let i = 0 ; i <= N ; i++)
         myPath.push([.4 * (i/N-.5), .1 * Math.cos(10*Math.PI * i/N), .04 * Math.sin(10*Math.PI * i/N)]);
   myPaths.push(myPath);

   let pathsMesh = clay.definePathsMesh('myPaths', .01, myPaths);
   model.add('myPaths');
   model.animate(() => {
      model.identity().move(0,1.5,0);
   });
}

