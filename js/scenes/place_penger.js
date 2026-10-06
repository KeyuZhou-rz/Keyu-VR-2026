import * as cg from "../render/core/cg.js";
import { ControllerBeam, buttonState } from "../render/core/controllerInput.js";
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
    let beamR = new ControllerBeam(model, 'right');
    // spawn the floor in the very beginning
    const coords = [];
    const speed = 0.3;
    let prev_frame_time = 0;

    const spawnFloor = () => {
    const groundY = 0;
    const ground = model.add('square')
    .move(0, groundY,-2)
    .turnX(-Math.PI /2)
    .scale(2,2,1)
    .color(0.3, 0.3,0.3);

    return ground;

    };
    let ground = spawnFloor();
    

    const edges = [];
    const edgeKeys = new Set();
    for (const face of fs){
        for (let i=0; i<face.length;i++){
            const a = face[i];
            const b = face[(i + 1) % face.length];
            const key = a < b ? `${a}:${b}` : `${b}:${a}`;
            if (!edgeKeys.has(key)) {
                edgeKeys.add(key);
                edges.push({ a, b });
            }
        }
    };

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

    const spawnPenguin = () => {
        let x = 0;
        let y = 0;
        let z = -1.5;

        let mesh = model.add();
        let lines = edges.map(() => mesh.add('tubeZ').color(0, 1, 0));

        return {
            mesh:mesh,
            lines:lines,
            x:x,y:y,z:z,
            size:0.25,
            isAlive:true,
            heading:0,
            walkTime:0

        };



    }

    inputEvents.onClick = hand => {
    let hit = beamR.hitPoint(ground.getGlobalMatrix());
    if(hit){
        const marker = model.add('sphere').move(hit[0], hit[1], hit[2]).color(1, 0.5, 0).scale(0.01);
        coords.push({x:hit[0], y:hit[1], z:hit[2], marker:marker});
        }
    }

    const moveAlongPath = dt => {
        if (!coords.length) return false;

        const target = coords[0];
        const dx = target.x - penguin.x;
        const dz = target.z - penguin.z;
        const distance = Math.hypot(dx, dz);

        if (distance === 0) {
            model.remove(target.marker);
            coords.shift();
            return false;
        }

        const step = Math.min(speed * dt, distance);
        penguin.heading = Math.atan2(dx, dz);
        penguin.walkTime += step / speed;

        if (step === distance) {
            penguin.x = target.x;
            penguin.z = target.z;
            model.remove(target.marker)
            coords.shift();
        } else {
            penguin.x += dx / distance * step;
            penguin.z += dz / distance * step;
        }

        return true;
    };

    const renderPenguin = moving => {
        const vertices = vs.map((vertex, index) => {
            const p = moving
                ? wobble(walkFoot(vertex, index, penguin.walkTime), penguin.walkTime)
                : vertex;
            return [p.x, p.y, p.z];
        });

        // Keep the lowest animated vertex on the floor.
        penguin.y = -Math.min(...vertices.map(vertex => vertex[1])) * penguin.size;
        penguin.mesh.identity()
            .move(penguin.x, penguin.y, penguin.z)
            .turnY(penguin.heading)
            .scale(penguin.size);

        for (let i = 0; i < edges.length; i++) {
            const { a, b } = edges[i];
            penguin.lines[i].identity().link(vertices[a], vertices[b], 0.006);
        }
    };




    let penguin = spawnPenguin();
    model.animate(()=>{
        beamR.update();
        const now = Date.now() / 1000;
        const dt = prev_frame_time === 0 ? 0 : now - prev_frame_time;
        prev_frame_time = now;
        const moving = moveAlongPath(dt);
        renderPenguin(moving);
    })

}
