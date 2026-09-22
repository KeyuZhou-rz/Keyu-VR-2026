import * as cg from "../render/core/cg.js";
import {ControllerBeam} from "../render/core/controllerInput.js";

export const init = async model => {
    // initialize saber and use ComtrollerBeam
    let beamR = new ControllerBeam(model, 'right');
    let saber = model.add('cube');

    let cubeTar = null;
    const spawnCube = () => {
        let x = (Math.random() - 0.5) * 0.8;
        let y = 1.0 + (Math.random() - 0.5) * 0.5;
        let z = -2.5;

        let mesh = model.add('cube');

        return {
            mesh: mesh,
            x: x, y: y, z: z,
            size: 0.15, 
            isAlive: true
        };
    };

    cubeTar = spawnCube();

    model.animate(() => {
        beamR.update();
        // thin long cube as the saber
        let matrix = beamR.beamMatrix();
        let origin = matrix.slice(12, 15);

        saber.identity().move(origin).scale(0.02, 0.02, 0.8).color(1, 0.1, 0.1);
        // cube coming along
        if (cubeTar && cubeTar.isAlive){
            cubeTar.z += 0.015;
            cubeTar.mesh.identity().move(cubeTar.x, cubeTar.y, cubeTar.z).scale(cubeTar.size)
            .turnX(model.time * 2).color(0.2, 0.6, 1.0);
        // ray detect
            let uvdL = beamR.hitRect(cubeTar.mesh.getGlobalMatrix());
            if (uvdL){
                let u = uvdL[0], v = uvdL[1], d = uvdL[2];
                let isHit = u*u < .01 && v*v < .01;
                vibrate('right', isHit ? 1 : 0.3);
                    
                cubeTar.mesh.scale(0);
                cubeTar.isAlive = false;


                setTimeout(() => {
                    cubeTar = spawnCube();
                }, 1000);
            }

            if (cubeTar.z > 0.5){
                cubeTar.mesh.scale(0);
                cubeTar.isAlive = false;
                setTimeout(() => {
                    cubeTar = spawnCube();
                }, 500);
            }
        }
    });
}