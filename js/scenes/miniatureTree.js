import * as cg from "../render/core/cg.js";

// ---- M2: miniature apple tree + apple state ------------------------------
//
// The tree is ~20 cm tall (2.4 m to the 1/12 person). Apples are NOT children
// of the tree node: each one keeps its own world position, so picking an apple
// never needs re-parenting and survives the tree being moved.
//
//   hanging : pos follows the tree (tree matrix * local offset)
//   held    : pos is driven by the caller (e.g. the miniature hand)
//   dropped : pos stays wherever it was released

export const APPLE_RADIUS = .007;
const GRAVITY = 9.8 / 12;     // scaled so falls look natural at 1/12 size

// offsets from the tree base; the +z side faces the miniature avatar
const APPLE_LOCAL = [
    [ .000, .100,  .058],
    [ .030, .090,  .050],
    [-.035, .090,  .045],
    [ .000, .110, -.060],
];

export const createTree = (parent, pos) => {

    const root = parent.add();
    root.identity().move(pos[0], pos[1], pos[2]);

    // trunk: tubeY has half-length 1, so centre it at half the height
    root.add("tubeY").color(.40, .26, .14).move(0, .04, 0).scale(.012, .04, .012);

    // canopy
    root.add("sphere").color(.15, .50, .18).move(0, .14, 0).scale(.07);
    root.add("sphere").color(.18, .55, .20).move( .04, .12,  .02).scale(.05);
    root.add("sphere").color(.18, .55, .20).move(-.04, .12, -.02).scale(.05);

    const apples = APPLE_LOCAL.map((local, id) => {
        const node = parent.add("sphere");
        node.color(.85, .08, .08);
        return { id, state: "hanging", local, pos: [0, 0, 0], vel: 0, node };
    });

    const floorY = pos[1] + APPLE_RADIUS;     // resting height on the tabletop

    // call every frame: hanging apples follow the tree, dropped ones fall to the table
    const update = (dt = 0) => {
        const T = root.getMatrix();
        for (const a of apples) {
            if (a.state == "hanging")
                a.pos = cg.mTransform(T, a.local);
            else if (a.state == "dropped") {
                a.vel -= GRAVITY * dt;
                a.pos[1] += a.vel * dt;
                if (a.pos[1] < floorY) { a.pos[1] = floorY; a.vel = 0; }
            }
            a.node.setMatrix(cg.mMultiply(
                cg.mTranslate(a.pos),
                cg.mScale(APPLE_RADIUS)));
        }
    };

    const grab = a => { a.state = "held"; a.vel = 0; };

    const release = (a, p) => {
        if (p) a.pos = p.slice();
        a.state = "dropped";
        a.vel = 0;
    };

    update();
    return { root, apples, update, grab, release };
};
