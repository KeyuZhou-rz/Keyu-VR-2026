import { vs, fs } from '../scenes/penger.js';

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

export function createPenger(parent, size) {
   const edges = [], seen = new Set();
   for (const face of fs)
      for (let i = 0; i < face.length; i++) {
         const a = face[i], b = face[(i + 1) % face.length];
         const key = a < b ? a + ':' + b : b + ':' + a;
         if (!seen.has(key)) { seen.add(key); edges.push([a, b]); }
      }
   const root = parent.add();
   const lines = edges.map(() => root.add('tubeZ').color([.3, 1, .45]).dull());
   let walkTime = 0;
   return {
      update(x, z, heading, moving, dt) {
         if (moving) walkTime += dt * 7;
         const vertices = vs.map((vertex, index) => moving ? wobble(walkFoot(vertex, index, walkTime), walkTime) :
                                                                   [vertex.x, vertex.y, vertex.z]);
         const floor = Math.min(...vertices.map(vertex => vertex[1]));
         root.identity().move(x, .006 - floor * size, z).turnY(heading).scale(size);
         for (let i = 0; i < edges.length; i++)
            lines[i].identity().link(vertices[edges[i][0]], vertices[edges[i][1]], .008);
      }
   };
}
