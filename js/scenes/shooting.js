import { ControllerBeam } from "../render/core/controllerInput.js";

export const init = async model => {
    const STATUS = Object.freeze({
        FAILED: 0,
        PLAYING: 1,
        ENDED: 2
        
    });

    let phase = STATUS.PLAYING;
    let hit_count = 0;
    let start_time = 0.0;
    const time_limit = 20;
    
    let beamL = new ControllerBeam(model, 'left');

    let timeText = model.add('myText').color(0, 0.25, 5);
    let uiRect = model.add('square');
    uiRect.scale(0);

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


    const resetGame = () => {
        // initialize hit_count start time uiRectscale, and if exist, clean it
        hit_count = 0;
        start_time = 0;
        uiRect.scale(0);

        if  (cubeTar && cubeTar.mesh){
            cubeTar.mesh.scale(0);
        }
        cubeTar = spawnCube();
        phase = STATUS.PLAYING;
    }

    cubeTar = spawnCube();

    model.animate(() => {
        beamL.update();

        if (phase === STATUS.PLAYING) {
            if (start_time === 0) {
                start_time = Date.now() / 1000;
            }
            let time_now = Date.now() / 1000 - start_time;
            let time_remaining = Math.max(0, time_limit - time_now);

            clay.defineTextMesh('myText', `TIME: ${time_remaining.toFixed(1)}s\nHITS: ${hit_count}`);
            timeText.identity().move(-0.5, 1.5, 0);

            if (time_now >= time_limit) {
                phase = STATUS.FAILED;
                if (cubeTar) cubeTar.mesh.scale(0);
                return;
            }

            if (cubeTar && cubeTar.isAlive) {
                cubeTar.z += 0.015;
                cubeTar.mesh.identity()
                    .move(cubeTar.x, cubeTar.y, cubeTar.z)
                    .scale(cubeTar.size)
                    .turnX(model.time * 2)
                    .color(0.2, 0.6, 1.0);

                if (cubeTar.z > 0.5) {
                    cubeTar.mesh.scale(0);
                    cubeTar.isAlive = false;
                    setTimeout(() => {
                        cubeTar = spawnCube();
                    }, 500);
                }

                let uvdl = beamL.hitRect(cubeTar.mesh.getGlobalMatrix());
                if (uvdl) {
                    hit_count += 1;
                    let u = uvdl[0], v = uvdl[1];
                    let isHit = (u * u < 0.01) && (v * v < 0.01);
                    if (typeof vibrate === 'function') vibrate('left', isHit ? 1 : 0.3);

                    cubeTar.mesh.scale(0);
                    cubeTar.isAlive = false;

                    if (hit_count >= 15) {
                        phase = STATUS.ENDED;
                        return;
                    }

                    setTimeout(() => {
                        cubeTar = spawnCube();
                    }, 500);
                }
            }

        } else if (phase === STATUS.ENDED || phase === STATUS.FAILED) {
            let msg = (phase === STATUS.ENDED) ? "Congrats! Try again?" : "Time Limit! Try again?";
            clay.defineTextMesh('myText', msg);
            timeText.identity().move(-0.3, 1.6, 0);

            uiRect.identity().move(0, 1.3, 0).scale(0.2, 0.1, 1).color(0.25, 0.35, 0.5);

            let uvdl = beamL.hitRect(uiRect.getGlobalMatrix());
            if (uvdl) {
                uiRect.color(1, 0.5, 0.5);
                resetGame();
            }
        }
    });
};