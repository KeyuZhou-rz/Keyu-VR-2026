import { vs, fs } from '../scenes/penger.js';
import * as cg from '../render/core/cg.js';

function walkFoot(vertex, index, time) {
   const left = index >= 272 && index <= 297;
   const right = index >= 298 && index <= 323;
   if (!left && !right) return vertex;
   const swing = Math.sin(time * 2.2 + (left ? 0 : Math.PI));
   const angle = .38 * swing, y = -.245, z = .08;
   return { x: vertex.x,
      y: y + (vertex.y - y) * Math.cos(angle) - (vertex.z - z) * Math.sin(angle) + Math.max(0, swing) * .06,
      z: z + (vertex.y - y) * Math.sin(angle) + (vertex.z - z) * Math.cos(angle) };
}

function wobble(vertex, time) {
   const angle = .35 * Math.sin(time * 2.2), c = Math.cos(angle), s = Math.sin(angle);
   return [vertex.x * c - vertex.y * s, vertex.x * s + vertex.y * c, vertex.z];
}

export function createPenger(parent, size, color = [.3, 1, .45], form = 'village-penger') {
   const edges = [], seen = new Set();
   for (const face of fs)
      for (let i = 0; i < face.length; i++) {
         const a = face[i], b = face[(i + 1) % face.length];
         const key = a < b ? a + ':' + b : b + ':' + a;
         if (!seen.has(key)) { seen.add(key); edges.push([a, b]); }
      }
   const mesh = new Float32Array(edges.length * 18 * 16);
   mesh.isTriangles = true;
   const template = clay.vertexArray([0, 0, 0], [0, 1, 0]);
   for (let i = 0; i < mesh.length; i += 16) mesh.set(template, i);
   clay.defineMesh(form, mesh);
   const root = parent.add(form).color(color).dull();
   const circle = Array.from({ length: 3 }, (_, i) => [Math.cos(i * 2 * Math.PI / 3), Math.sin(i * 2 * Math.PI / 3)]);
   let wasMoving = true;
   let walkTime = 0;
   return {
      update(x, z, heading, moving, dt) {
         if (moving) walkTime += dt * 7;
         const vertices = vs.map((vertex, index) => moving ? wobble(walkFoot(vertex, index, walkTime), walkTime) :
                                                                   [vertex.x, vertex.y, vertex.z]);
         const floor = Math.min(...vertices.map(vertex => vertex[1]));
         root.identity().move(x, .006 - floor * size, z).turnY(heading).scale(size);
         if (!moving && !wasMoving) return;
         wasMoving = moving;
         let index = 0;
         const write = (point, offset) => {
            for (let axis = 0; axis < 3; axis++) mesh[index + axis] = point[axis] + offset[axis];
            index += 16;
         };
         for (const [i, j] of edges) {
            const a = vertices[i], b = vertices[j], direction = cg.normalize(cg.subtract(b, a));
            const u = cg.normalize(cg.cross(direction, Math.abs(direction[1]) < .9 ? [0, 1, 0] : [1, 0, 0]));
            const v = cg.cross(direction, u);
            const offsets = circle.map(([c, s]) => cg.scale(cg.add(cg.scale(u, c), cg.scale(v, s)), .012));
            for (let side = 0; side < 3; side++) {
               const p = offsets[side], q = offsets[(side + 1) % 3];
               write(a, p); write(b, p); write(a, q);
               write(a, q); write(b, p); write(b, q);
            }
         }
      }
   };
}
