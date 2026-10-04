/*
   Use a controller beam to move a sphere.
*/

import * as cg from "../render/core/cg.js";
import { buttonState } from "../render/core/controllerInput.js";
import { lcb, rcb } from '../handle_scenes.js';

let center = [0,1.5,0], radius = 0.1;

export const init = async model => {
   let ball = model.add('sphere');
   model.animate(() => {
      let point = lcb.projectOntoBeam(center);
      let diff = cg.subtract(point, center);
      let hit = cg.norm(diff) < radius;
      let lt = buttonState.left[0].pressed;
      if (hit && lt)
	 center = point;
      ball.color(hit ? lt ? [1,0,0] : [1,.5,.5] : [1,1,1]);
      ball.identity().move(center).scale(radius);
   });
}

