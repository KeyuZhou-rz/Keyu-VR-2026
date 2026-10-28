import * as cg from '../render/core/cg.js';
import { stl } from '../render/core/stl.js';

// DIGITAL DOUBLE OF AN SO101 EDUCATIONAL ROBOT ARM

let motion = time => [         // EXAMPLE OF JOINT ANIMATION INPUT FOR THE ROBOT ARM
  .3 * Math.cos(time * 1.2),
  .3 * Math.sin(time * 1.3),
  .3 * Math.cos(time * 1.4),
  .3 * Math.sin(time * 1.5),
  .3 * Math.cos(time * 1.6),
  .2 * Math.sin(time * 1.7)
];

export const init = async model => {
   const printed = [1,.82,.12], motor = [.1,.1,.1];     // COLOR PALETTE FOR THE ROBOT PARTS

   // THE MESH OF EACH LINK IS THE NAME OF A FILE IN media/stl/SO101. EACH LINK'S xyz AND rpy ARE RELATIVE TO THAT LINK'S FRAME.

   const links = {
      base_link: [
         { stl: 'base_motor_holder_so101_v1'       , xyz: [-0.00636471, -0.0000994414, -0.0024], rpy: [1.5708, 0, 1.5708], color: printed },
         { stl: 'base_so101_v2'                    , xyz: [-0.00636471, 0, -0.0024], rpy: [1.5708, 0, 1.5708], color: printed },
         { stl: 'sts3215_03a_v1'                   , xyz: [0.0263353, 0, 0.0437], rpy: [0, 0, 0], color: motor },
         { stl: 'waveshare_mounting_plate_so101_v2', xyz: [-0.0309827, -0.000199441, 0.0474], rpy: [1.5708, 0, 1.5708], color: printed },
      ],
      shoulder_link: [
         { stl: 'sts3215_03a_v1'            , xyz: [-0.0303992, 0.000422241, -0.0417], rpy: [1.5708, 1.5708, 0], color: motor },
         { stl: 'motor_holder_so101_base_v1', xyz: [-0.0675992, -0.000177759, 0.0158499], rpy: [1.5708, -1.5708, 0], color: printed },
         { stl: 'rotation_pitch_so101_v1'   , xyz: [0.0122008, 0.0000222413, 0.0464], rpy: [-1.5708, 0, 0], color: printed },
      ],
      upper_arm_link: [
         { stl: 'sts3215_03a_v1'    , xyz: [-0.11257, -0.0155, 0.0187], rpy: [-3.14159, 0, -1.5708], color: motor },
         { stl: 'upper_arm_s0101_v1', xyz: [-0.065085, 0.012, 0.0182], rpy: [3.14159, 0, 0], color: printed },
      ],
      lower_arm_link: [
         { stl: 'under_arm_so101_v1'         , xyz: [-0.0648499, -0.032, 0.0182], rpy: [3.14159, 0, 0], color: printed },
         { stl: 'motor_holder_so101_wrist_v1', xyz: [-0.0648499, -0.032, 0.018], rpy: [-3.14159, 0, 0], color: printed },
         { stl: 'sts3215_03a_v1'             , xyz: [-0.1224, 0.0052, 0.0187], rpy: [-3.14159, 0, -3.14159], color: motor },
      ],
      wrist_link: [
         { stl: 'sts3215_03a_no_horn_v1'   , xyz: [0, -0.0424, 0.0306], rpy: [1.5708, 1.5708, 0], color: motor },
         { stl: 'wrist_roll_pitch_so101_v2', xyz: [0, -0.028, 0.0181], rpy: [-1.5708, -1.5708, 0], color: printed },
      ],
      gripper_link: [
         { stl: 'sts3215_03a_v1'              , xyz: [0.0077, 0.0001, -0.0234], rpy: [-1.5708, 0, 0], color: motor },
         { stl: 'wrist_roll_follower_so101_v1', xyz: [0, -0.000218214, 0.000949706], rpy: [-3.14159, 0, 0], color: printed },
      ],
      gripper_frame_link: [],
      moving_jaw_so101_v1_link: [
         { stl: 'moving_jaw_so101_v1', xyz: [0, 0, 0.0189], rpy: [0, 0, 0], color: printed },
      ],
   };

   const joints = [
      { name: 'shoulder_pan' , parent: 'robotBaseFrame', xyz: [ 0.0388353,  0          ,  0.0624   ], rpy: [ 3.14159, 0        , -3.14159], lo: -1.91986 , hi: 1.91986, link: 'shoulder_link'            },
      { name: 'shoulder_lift', parent: 'shoulder_pan'  , xyz: [-0.0303992, -0.0182778  , -0.0542   ], rpy: [-1.5708 ,-1.5708   ,  0      ], lo: -1.74533 , hi: 1.74533, link: 'upper_arm_link'           },
      { name: 'elbow_flex'   , parent: 'shoulder_lift' , xyz: [-0.11257  , -0.028      ,  0        ], rpy: [ 0      , 0        ,  1.5708 ], lo: -1.69    , hi: 1.69   , link: 'lower_arm_link'           },
      { name: 'wrist_flex'   , parent: 'elbow_flex'    , xyz: [-0.1349   ,  0.0052     ,  0        ], rpy: [ 0      , 0        , -1.5708 ], lo: -1.65806 , hi: 1.65806, link: 'wrist_link'               },
      { name: 'wrist_roll'   , parent: 'wrist_flex'    , xyz: [ 0        , -0.0611     ,  0.0181   ], rpy: [ 1.5708 , 0.0486795,  3.14159], lo: -2.74385 , hi: 2.84121, link: 'gripper_link'             },
      { name: 'gripper'      , parent: 'wrist_roll'    , xyz: [ 0.0202   ,  0.0188     , -0.0234   ], rpy: [ 1.5708 , 0        ,  0      ], lo: -0.174533, hi: 1.74533, link: 'moving_jaw_so101_v1_link' },
      { name: 'gripper_frame', parent: 'wrist_roll'    , xyz: [-0.0079   , -0.000218121, -0.0981274], rpy: [ 0      , 3.14159  ,  0      ], fixed: true,                link: 'gripper_frame_link'       },
   ];

   for (const meshList of Object.values(links))         // START LOADING THE ROBOT PARTS
      for (let mesh of meshList)
            stl('SO101/' + mesh.stl);

   let robotBaseFrame = model.add().move(-.1,1.5,0).turnX(-Math.PI/2);

   let node = {};                                        // CREATE THE KINEMATIC JOINT HIERARCHY
   node['robotBaseFrame'] = robotBaseFrame;
   for (let j of joints)
      node[j.name] = node[j.parent].add();

   model.animate(() => {
      for(let mesh of links['base_link']) {             // CREATE THE ROBOT BASE
         let partName = 'SO101/' + mesh.stl;
         if (clay.formMesh(partName) && ! mesh.part)
            mesh.part = node['robotBaseFrame'].add(partName).move(mesh.xyz)
                                                            .turnZ(mesh.rpy[2])
                                                            .turnY(mesh.rpy[1])
                                                            .turnX(mesh.rpy[0])
                                                            .color(mesh.color);
      }

      for(let j of joints)                              // CREATE THE ALL THE OTHER ROBOT PARTS
      for(let mesh of links[j.link]) {
         let partName = 'SO101/' + mesh.stl;
         if (clay.formMesh(partName) && ! mesh.part)
            mesh.part = node[j.name].add(partName).move(mesh.xyz)
                                                  .turnZ(mesh.rpy[2])
                                                  .turnY(mesh.rpy[1])
                                                  .turnX(mesh.rpy[0])
                                                  .color(mesh.color);
      }

      let m = [0,0,0,0,0,0];
//    let m = motion(model.time);

      let i = 0;                                        // ANIMATE THE ROBOT
      for (let j of joints) {  
         let z = j.rpy[2], y = j.rpy[1], x = j.rpy[0];
         switch (i) {
         case 0: case 2: case 3: z += m[i]; break;
         case 1: case 4: case 5: y += m[i]; break;
         }
         node[j.name].identity().move(j.xyz).turnZ(z).turnY(y).turnX(x);
         i++;
      }
   });
}
