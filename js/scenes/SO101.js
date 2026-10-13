import * as cg from '../render/core/cg.js';

// Render the SO101 robot arm.

export const init = async model => {
   const joints = [
      { name: 'shoulder_pan' , parent: 'robotBaseFrame', xyz: [ 0.0388353,  0        ,  0.0624], rpy: [ 3.14159, 0        , -3.14159], lo: -1.91986 , hi: 1.91986 },
      { name: 'shoulder_lift', parent: 'shoulder_pan'  , xyz: [-0.0303992, -0.0182778, -0.0542], rpy: [-1.5708 ,-1.5708   ,  0      ], lo: -1.74533 , hi: 1.74533 },
      { name: 'elbow_flex'   , parent: 'shoulder_lift' , xyz: [-0.11257  , -0.028    ,  0     ], rpy: [ 0      , 0        ,  1.5708 ], lo: -1.69    , hi: 1.69    },
      { name: 'wrist_flex'   , parent: 'elbow_flex'    , xyz: [-0.1349   ,  0.0052   ,  0     ], rpy: [ 0      , 0        , -1.5708 ], lo: -1.65806 , hi: 1.65806 },
      { name: 'wrist_roll'   , parent: 'wrist_flex'    , xyz: [ 0        , -0.0611   ,  0.0181], rpy: [ 1.5708 , 0.0486795, 3.14159 ], lo: -2.74385 , hi: 2.84121 },

      // gripper_link has two children: the moving jaw and a fixed tool-tip frame.
      { name: 'gripper'      , parent: 'wrist_roll'   , xyz: [ 0.0202   ,  0.0188     , -0.0234   ], rpy: [ 1.5708 , 0      ,  0], lo: -0.174533, hi: 1.74533 },
      { name: 'gripper_frame', parent: 'wrist_roll'   , xyz: [-0.0079   , -0.000218121, -0.0981274], rpy: [ 0      , 3.14159,  0], fixed: true },
   ];

    let robotBaseFrame = model.add().move(0,1,-1).turnX(-Math.PI/2).scale(3);
    robotBaseFrame.add('tubeZ').scale(.04,.04,.005).color(.3,.3,.3);
    let node = {};
    node['robotBaseFrame'] = robotBaseFrame;

    for (let j of joints) {
      let parentNode = node[j.parent];              // Get parent node by name in the table.
      let currentJointName = j.name;                // Get name of the current table element.

      node[currentJointName] = parentNode.add().move(j.xyz)      // Add a child to previous joint node. This is new joint node that we are working with now.
                                               .turnZ(j.rpy[2])
                                               .turnY(j.rpy[1])
                                               .turnX(j.rpy[0]);
      let curJointNode = node[currentJointName];

      let length = cg.norm(j.xyz);                               // j.xyz is the xyz position relative to parent's object space (a vector from j1 to j2).
      curJointNode.add('sphere').scale(.008).color(1,0,0);
      if (length > 0)
         parentNode.add('cube').move(cg.scale(j.xyz,.5)).aimZ(j.xyz).scale(.006,.006,.5*length).color(.6,.6,.6);
    }

    model.animate(() => {
    });
}
