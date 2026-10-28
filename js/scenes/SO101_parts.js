import * as cg from '../render/core/cg.js';
import { stl } from '../render/core/stl.js';

// LOAD AND RENDER THE PARTS OF AN SO101 ROBOT ARM FROM STL FILES.

let partNames = 'base_motor_holder_so101_v1 base_so101_v2 motor_holder_so101_base_v1 motor_holder_so101_wrist_v1 moving_jaw_so101_v1 rotation_pitch_so101_v1 sts3215_03a_no_horn_v1 sts3215_03a_v1 under_arm_so101_v1 upper_arm_s0101_v1 waveshare_mounting_plate_so101_v2 wrist_roll_follower_so101_v1 wrist_roll_pitch_so101_v2'.split(' ');

export const init = async model => {

    // START THE ASYNCHRONOUS PROCESS OF LOADING ALL THE PARTS.

    for (let i = 0 ; i < partNames.length ; i++) {
       partNames[i] = 'SO101/' + partNames[i];
       stl(partNames[i]);
    }
    let part = {};

    model.animate(() => {

       // WHENEVER A PART HAS FINISHED LOADING, INSTANTIATE IT AS AN OBJECT IN THE SCENE.

       for (let i = 0 ; i < partNames.length ; i++) 
          if (clay.formMesh(partNames[i]) && ! part[partNames[i]])
             part[partNames[i]] = model.add(partNames[i]);

       // RENDER ALL PARTS THAT ARE READY TO RENDER.

       for (let i = 0 ; i < partNames.length ; i++) 
          if (part[partNames[i]])
             part[partNames[i]].identity().move(.12 * ((i-8)%4), 1.8 + .12 * ((i-6)/4>>0), 0).turnY(model.time).turnX(model.time/3);
    });
}
