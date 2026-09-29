/*
   This shows how to incorporate GLTF models that were
   previously created in external modeling programs.
*/
import * as cg from "../render/core/cg.js";
import * as global from "../global.js";
import { Gltf2Node } from "../render/nodes/gltf2.js";

let buddha = new Gltf2Node({ url: './media/gltf/buddha_statue_broken/scene.gltf'});

export const init = async model => {
    buddha.translation = [0, 1.16, 0]; // 1.16 is pedestal height
    buddha.scale = [1.5,1.5,1.5];
    global.gltfRoot.addNode(buddha);

    let startTime = performance.now();
    model.animate(() => {
        let angle = (performance.now() - startTime) * 0.001;
        let matrix = cg.mRotateY(angle);
        let q = cg.mToQuaternion(matrix);
        buddha.rotation = [q.x, q.y, q.z, q.w];
    });
 }
