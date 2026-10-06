import * as cg from "../render/core/cg.js";
import { ControllerBeam } from "../render/core/controllerInput.js";
import { vs, fs } from "./penger.js";
import { createSoundSource, playSound, updatePosition, stopSound, resumeAudio }
    from "../util/spatial-audio.js";

const SOUND = { POINT: 20, STEP: 21, ARRIVE: 22 };
const stepInterval = Math.PI / 2.2;

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

// Only waypoint coordinates are shared. Each client keeps its own movement progress.
server.init('penguinState', { coords: [] });

export const init = async model => {
    let beamR = new ControllerBeam(model, 'right');
    // spawn the floor in the very beginning
    const markers = [];
    let nextPoint = 0;
    const speed = 0.3;
    let prev_frame_time = 0;
    let nextStepTime = 0;

    const playAt = (sound, position) => {
        // Shared scene coordinates must be converted to this headset's XR coordinates.
        updatePosition(sound, cg.mTransform(model.getGlobalMatrix(), position));
        playSound(sound);
    };

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

    inputEvents.onPress = hand => {
        if (hand === 'right') resumeAudio();
    };

    inputEvents.onClick = hand => {
        if (hand !== 'right') return;
        beamR.update();
        const hit = beamR.hitPoint(ground.getGlobalMatrix());
        if (hit)
            server.send('penguinState', { x: hit[0], y: hit[1], z: hit[2] });
    };

    const updateMarkers = () => {
        while (markers.length < penguinState.coords.length) {
            const point = penguinState.coords[markers.length];
            const marker = model.add('sphere')
                .move(point.x, point.y, point.z)
                .color(1, 0.5, 0)
                .scale(0.01);
            markers.push(marker);
            playAt(SOUND.POINT, [point.x, point.y, point.z]);
        }
    };

    const finishPoint = () => {
        const point = penguinState.coords[nextPoint];
        playAt(SOUND.ARRIVE, [point.x, point.y, point.z]);
        model.remove(markers[nextPoint]);
        markers[nextPoint] = null;
        nextPoint++;
    };

    const moveAlongPath = dt => {
        if (nextPoint >= penguinState.coords.length) return false;

        const target = penguinState.coords[nextPoint];
        const dx = target.x - penguin.x;
        const dz = target.z - penguin.z;
        const distance = Math.hypot(dx, dz);

        if (distance === 0) {
            finishPoint();
            return false;
        }

        const step = Math.min(speed * dt, distance);
        penguin.heading = Math.atan2(dx, dz);
        penguin.walkTime += step / speed;

        if (step === distance) {
            penguin.x = target.x;
            penguin.z = target.z;
            finishPoint();
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
    await Promise.all([
        createSoundSource(SOUND.POINT,
            './media/sound/SFXs/demoBalls/SFX_Ball_Create_Mono_01.wav', [0, 0, -1.5], false, 0.4),
        createSoundSource(SOUND.STEP,
            './media/sound/bounce/0.wav', [0, 0, -1.5], false, 0.3),
        createSoundSource(SOUND.ARRIVE,
            './media/sound/SFXs/demoBalls/SFX_Ball_Delete_Mono_01.wav', [0, 0, -1.5], false, 0.4)
    ]);

    model.animate(()=>{
        server.sync('penguinState', msgs => {
            if (!isMasterClient()) return;
            for (const id in msgs)
                penguinState.coords.push(msgs[id]);
            server.broadcastGlobal('penguinState');
        });

        beamR.update();
        updateMarkers();

        const now = Date.now() / 1000;
        const dt = prev_frame_time === 0 ? 0 : now - prev_frame_time;
        prev_frame_time = now;
        const moving = moveAlongPath(dt);
        renderPenguin(moving);

        updatePosition(SOUND.STEP, penguin.mesh.getGlobalMatrix().slice(12, 15));
        if (moving) {
            if (penguin.walkTime >= nextStepTime) {
                playSound(SOUND.STEP);
                nextStepTime = penguin.walkTime + stepInterval;
            }
        } else {
            nextStepTime = penguin.walkTime;
            stopSound(SOUND.STEP);
        }
    })

}

export const deinit = () => {
    for (const sound of Object.values(SOUND)) stopSound(sound);
};

