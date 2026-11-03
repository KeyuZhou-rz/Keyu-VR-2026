import * as cg from "../render/core/cg.js";
import { controllerMatrix, buttonState } from "../render/core/controllerInput.js";
import { keyWentDown, KEY_V } from "../util/input_keyboard.js";
import { createTree } from "./miniatureTree.js";

// ---- M0: shared "real person -> tabletop person" transform --------------
//
//   A = T(a) * R(yaw0) * S(1/12) * T(-o)
//
// o : floor point under the user at calibration time (fixed afterwards).
// a : point on the tabletop where the miniature avatar stands.
// Everything is expressed in model coordinates.

export const SCALE      = 1 / 12;
export const FLOOR_Y    = 0;                   // real floor height in model coords
export const TABLE_Y    = 0.75;                // tabletop height
export const TABLE_POS  = [0, TABLE_Y, -1.0];  // centre of the tabletop surface
export const TABLE_SIZE = [1.5, 0.04, 0.8];    // width, thickness, depth
export const AVATAR_POS = [0, TABLE_Y, -1.2];  // where the miniature stands
export const YAW0       = 0;                   // miniature's facing

export const TREE_POS = [AVATAR_POS[0], TABLE_Y, AVATAR_POS[2] - .12];  // just in front of the miniature

let tree = null;
export const getTree = () => tree;

const FALLBACK_FRAMES = 90;                   // no headset: calibrate with defaults

let ready = false;
let o = [0, FLOOR_Y, 0];
let A = cg.mIdentity();
let Ainv = cg.mIdentity();

export const isReady = () => ready;
export const getO    = () => o.slice();
export const getA    = () => A.slice();
export const getAinv = () => Ainv.slice();

const buildA = () => {
    A = cg.mMultiply(
            cg.mTranslate(AVATAR_POS),
            cg.mMultiply(
                cg.mRotateY(YAW0),
                cg.mMultiply(cg.mScale(SCALE), cg.mTranslate(-o[0], -o[1], -o[2]))));
    Ainv = cg.mInverse(A);
};

const calibrate = (x, z) => {
    o = [x, FLOOR_Y, z];
    buildA();
    ready = true;
};

// console-checkable sanity table (expected values in the comments)
export const selfCheck = () => {
    const p = (m, v) => cg.mTransform(m, v).map(x => +x.toFixed(4));
    const e = (dx, dy, dz) => [o[0] + dx, o[1] + dy, o[2] + dz];
    console.log("A*o            ", p(A, e(0, 0, 0)),    "expect", AVATAR_POS);
    console.log("A*(o+12cm x)   ", p(A, e(.12, 0, 0)),  "expect x +0.01");
    console.log("A*(o+1.8m y)   ", p(A, e(0, 1.8, 0)),  "expect y +0.15");
    console.log("Ainv*A*p       ", p(Ainv, cg.mTransform(A, e(.3, 1.1, -.4))), "expect", e(.3, 1.1, -.4));
};

// ---- M3/M4: view switching and interaction ------------------------------
//
// Two display modes share one world (table coordinates):
//   giant : sceneRoot = I      -> you see the table at real size, hands are real hands
//   mini  : sceneRoot = A^-1   -> you see through the miniature's eyes, hands are A * real hands

const GRAB_BUTTON  = 1;      // grip
const VIEW_BUTTON  = 5;      // right B
const TREE_GRAB_R  = .18;    // giant mode: hand to tree centre
const APPLE_PICK_R = .02;    // mini mode: hand to apple (in table metres)

const dist = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);

export const init = async model => {

    const HANDS = ["left", "right"];
    let mode = "giant";

    // sceneRoot holds the whole shared world; only its matrix changes per mode
    const sceneRoot = model.add();

    // table: unit cube has half-extent 1, so scale by half sizes
    const table = sceneRoot.add("cube");
    table.color(.55, .38, .22);
    table.identity()
         .move(TABLE_POS[0], TABLE_POS[1] - TABLE_SIZE[1] / 2, TABLE_POS[2])
         .scale(TABLE_SIZE[0] / 2, TABLE_SIZE[1] / 2, TABLE_SIZE[2] / 2);

    // objectRoot: everything the user can pick up; positions stay in table coords
    const objectRoot = sceneRoot.add();
    tree = createTree(objectRoot, TREE_POS);

    // avatarRoot carries A; children use real-world (model-space) poses and sizes
    const avatarRoot = sceneRoot.add();
    avatarRoot.setMatrix(cg.mScale(0));

    const head = avatarRoot.add();
    head.add("sphere").scale(.10);

    const leftHand = avatarRoot.add();
    leftHand.add("cube").scale(.035, .025, .06);

    const rightHand = avatarRoot.add();
    rightHand.add("cube").scale(.035, .025, .06);

    const body = avatarRoot.add("cube");
    const leftArm = avatarRoot.add("tubeZ");
    const rightArm = avatarRoot.add("tubeZ");

    // ---- interaction state ----
    const held = { left: null, right: null };       // { kind: "tree", G } | { kind: "apple", apple }
    const wasDown = { left: false, right: false };
    let wasToggle = false;
    let frames = 0;

    // hand pose in TABLE coordinates (real hand in giant mode, miniature hand in mini mode)
    const handMatrix = hand => {
        const c = controllerMatrix[hand];
        if (!c || c.length < 16) return null;
        const real = cg.mMultiply(clay.inverseRootMatrix, c);
        return mode == "mini" ? cg.mMultiply(A, real) : real;
    };

    // drop the tree flat on the tabletop, keeping only position and yaw
    const placeTree = O => {
        const hx = TABLE_SIZE[0] / 2 - .05, hz = TABLE_SIZE[2] / 2 - .05;
        const x = Math.max(TABLE_POS[0] - hx, Math.min(TABLE_POS[0] + hx, O[12]));
        const z = Math.max(TABLE_POS[2] - hz, Math.min(TABLE_POS[2] + hz, O[14]));
        tree.root.setMatrix(cg.mMultiply(
            cg.mTranslate(x, TABLE_Y, z),
            cg.mRotateY(Math.atan2(O[8], O[10]))));
    };

    const treeHeld = () => HANDS.some(h => held[h]?.kind == "tree");

    const tryGrab = (hand, C) => {
        const p = C.slice(12, 15);
        if (mode == "giant") {
            if (treeHeld()) return;
            const T = tree.root.getMatrix();
            if (dist(p, cg.mTransform(T, [0, .1, 0])) < TREE_GRAB_R)
                held[hand] = { kind: "tree", G: cg.mMultiply(cg.mInverse(C), T) };
        }
        else {
            let best = null, bestD = APPLE_PICK_R;
            for (const a of tree.apples) {
                const d = dist(p, a.pos);
                if (a.state != "held" && d < bestD) { best = a; bestD = d; }
            }
            if (best) {
                tree.grab(best);
                held[hand] = { kind: "apple", apple: best };
            }
        }
    };

    const releaseHand = hand => {
        const h = held[hand];
        if (!h) return;
        if (h.kind == "tree") placeTree(tree.root.getMatrix());
        else tree.release(h.apple);
        held[hand] = null;
    };

    const setMode = m => {
        for (const hand of HANDS) releaseHand(hand);
        mode = m;
    };

    model.animate(() => {
        const dt = Math.min(model.deltaTime || 1 / 60, .05);

        const H = cg.mMultiply(
            clay.inverseRootMatrix,
            cg.mix(
                clay.root().inverseViewMatrix(0),
                clay.root().inverseViewMatrix(1),
                .5
            )
        );

        // wait for a plausible headset pose before locking the floor anchor
        if (!ready) {
            frames++;
            const valid = H[13] > .3;
            if (valid || frames > FALLBACK_FRAMES) {
                calibrate(valid ? H[12] : 0, valid ? H[14] : 0);
                selfCheck();
            }
        }

        // hidden (zero scale) until calibrated
        avatarRoot.setMatrix(ready ? A : cg.mScale(0));
        if (!ready) { tree.update(dt); return; }

        // ---- view switch: right B (or V on keyboard), once per press ----
        const toggle = !!buttonState.right[VIEW_BUTTON]?.pressed;
        if (keyWentDown(KEY_V) || (toggle && !wasToggle))
            setMode(mode == "giant" ? "mini" : "giant");
        wasToggle = toggle;

        sceneRoot.setMatrix(mode == "mini" ? Ainv : cg.mIdentity());

        // ---- grab / carry / release ----
        for (const hand of HANDS) {
            const C = handMatrix(hand);
            const down = !!buttonState[hand][GRAB_BUTTON]?.pressed;
            if (C) {
                if (down && !wasDown[hand]) tryGrab(hand, C);
                const h = held[hand];
                if (h?.kind == "tree") tree.root.setMatrix(cg.mMultiply(C, h.G));
                if (h?.kind == "apple") h.apple.pos = C.slice(12, 15);
            }
            if (!down && wasDown[hand]) releaseHand(hand);
            wasDown[hand] = down;
        }

        tree.update(dt);

        // ---- avatar pose (real-world coords, scaled by avatarRoot = A) ----
        const L = controllerMatrix.left .length == 16
                ? cg.mMultiply(clay.inverseRootMatrix, controllerMatrix.left )
                : cg.mTranslate(H[12] - .2, H[13] - .4, H[14] - .3);
        const R = controllerMatrix.right.length == 16
                ? cg.mMultiply(clay.inverseRootMatrix, controllerMatrix.right)
                : cg.mTranslate(H[12] + .2, H[13] - .4, H[14] - .3);

        const yaw = Math.atan2(H[8], H[10]);

        // in mini mode the camera is inside the head: hide it
        head.setMatrix(mode == "mini" ? cg.mScale(0) : H);
        leftHand.setMatrix(L);
        rightHand.setMatrix(R);

        body.identity()
            .move(H[12], H[13] - .35, H[14])
            .turnY(yaw)
            .scale(.14, .23, .08);

        const torso = cg.mMultiply(
            cg.mTranslate(H[12], H[13] - .35, H[14]),
            cg.mRotateY(yaw)
        );

        const shoulderL = cg.mTransform(torso, [-.16, 0, 0]);
        const shoulderR = cg.mTransform(torso, [.16, 0, 0]);

        leftArm.placeLimb(shoulderL, L.slice(12, 15), .025);
        rightArm.placeLimb(shoulderR, R.slice(12, 15), .025);
    });
}
