import { ControllerBeam } from "../render/core/controllerInput.js";
import { vs, fs } from "./penger.js";

function wobble(vertex, time) {
    const angle = 0.35 * Math.sin(time * 2.2);
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    return {
        x: vertex.x * c - vertex.y * s,
        y: vertex.x * s + vertex.y * c,
        z: vertex.z,
    };
}

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

    const edges = [];
    const edgeKeys = new Set();
    for (const face of fs) {
        for (let i = 0; i < face.length; ++i) {
            const a = face[i];
            const b = face[(i + 1) % face.length];
            const key = a < b ? `${a}:${b}` : `${b}:${a}`;
            if (!edgeKeys.has(key)) {
                edgeKeys.add(key);
                edges.push({ a, b });
            }
        }
    }

    const walkFoot = (vertex, index, time) => {
        const isLeftFoot = index >= 272 && index <= 297;
        const isRightFoot = index >= 298 && index <= 323;
        if (!isLeftFoot && !isRightFoot) return vertex;

        const phase = isLeftFoot ? 0 : Math.PI;
        const swing = Math.sin(time * 2.2 + phase);
        const angle = 0.38 * swing;
        const pivot = { x: isLeftFoot ? -0.322 : 0.322, y: -0.245, z: 0.08 };
        const dy = vertex.y - pivot.y;
        const dz = vertex.z - pivot.z;

        return {
            x: vertex.x,
            y: pivot.y + dy * Math.cos(angle) - dz * Math.sin(angle)
                + Math.max(0, swing) * 0.06,
            z: pivot.z + dy * Math.sin(angle) + dz * Math.cos(angle),
        };
    };

    let timeText = model.add('myText').color(0, 0.25, 5);
    let uiRect = model.add('square');
    uiRect.scale(0);

    let target = null;
    const spawnPenguin = () => {
        let x = (Math.random() - 0.5) * 0.8;
        let y = 1.0 + (Math.random() - 0.5) * 0.5;
        let z = -2.5;

        let mesh = model.add();
        let lines = edges.map(() => mesh.add('tubeZ').color(0, 1, 0));

        return {
            mesh: mesh,
            lines: lines,
            x: x, y: y, z: z,
            size: 0.25,
            isAlive: true
        };
    };


    const resetGame = () => {
        // initialize hit_count start time uiRectscale, and if exist, clean it
        hit_count = 0;
        start_time = 0;
        uiRect.scale(0);

        if (target && target.mesh) {
            target.mesh.scale(0);
        }
        target = spawnPenguin();
        phase = STATUS.PLAYING;
    }

    target = spawnPenguin();

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
                if (target) target.mesh.scale(0);
                return;
            }

            if (target && target.isAlive) {
                target.z += 0.015;
                target.mesh.identity()
                    .move(target.x, target.y, target.z)
                    .scale(target.size);

                const animatedVertices = vs.map((vertex, index) => {
                    const p = wobble(walkFoot(vertex, index, model.time), model.time);
                    return [p.x, p.y, p.z]; // link() expects coordinate arrays.
                });
                for (let i = 0; i < edges.length; ++i) {
                    const { a, b } = edges[i];
                    target.lines[i].identity()
                        .link(animatedVertices[a], animatedVertices[b], 0.006);
                }

                if (target.z > 0.5) {
                    target.mesh.scale(0);
                    target.isAlive = false;
                    setTimeout(() => {
                        target = spawnPenguin();
                    }, 500);
                }

                let uvdl = beamL.hitRect(target.mesh.getGlobalMatrix());
                if (uvdl) {
                    hit_count += 1;
                    let u = uvdl[0], v = uvdl[1];
                    let isHit = (u * u < 0.01) && (v * v < 0.01);
                    if (typeof vibrate === 'function') vibrate('left', isHit ? 1 : 0.3);

                    target.mesh.scale(0);
                    target.isAlive = false;

                    if (hit_count >= 15) {
                        phase = STATUS.ENDED;
                        return;
                    }

                    setTimeout(() => {
                        target = spawnPenguin();
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
