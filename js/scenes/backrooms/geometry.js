import { basin } from './world.js';

export class Mesh {
   constructor() {
      this.data = [];
   }
   quad(points, normal, material, uv = null) {
      for (const i of [0, 1, 2, 0, 2, 3])
         this.data.push([...points[i], ...normal, ...(uv ? uv[i] : [material, 0])]);
   }
   box(x, y, z, w, h, d, material) {
      const a = [x, y, z],
         b = [x + w, y + h, z + d];
      this.quad(
         [
            [a[0], a[1], a[2]],
            [a[0], b[1], a[2]],
            [a[0], b[1], b[2]],
            [a[0], a[1], b[2]]
         ],
         [-1, 0, 0],
         material
      );
      this.quad(
         [
            [b[0], a[1], b[2]],
            [b[0], b[1], b[2]],
            [b[0], b[1], a[2]],
            [b[0], a[1], a[2]]
         ],
         [1, 0, 0],
         material
      );
      this.quad(
         [
            [a[0], a[1], a[2]],
            [b[0], a[1], a[2]],
            [b[0], a[1], b[2]],
            [a[0], a[1], b[2]]
         ],
         [0, -1, 0],
         material
      );
      this.quad(
         [
            [a[0], b[1], b[2]],
            [b[0], b[1], b[2]],
            [b[0], b[1], a[2]],
            [a[0], b[1], a[2]]
         ],
         [0, 1, 0],
         material
      );
      this.quad(
         [
            [b[0], a[1], a[2]],
            [b[0], b[1], a[2]],
            [a[0], b[1], a[2]],
            [a[0], a[1], a[2]]
         ],
         [0, 0, -1],
         material
      );
      this.quad(
         [
            [a[0], a[1], b[2]],
            [a[0], b[1], b[2]],
            [b[0], b[1], b[2]],
            [b[0], a[1], b[2]]
         ],
         [0, 0, 1],
         material
      );
   }
   sign(x, y, z, direction, row, width = 1.8) {
      const dx = (Math.cos(direction) * width) / 2,
         dz = (Math.sin(direction) * width) / 2;
      this.quad(
         [
            [x - dx, y - 0.28, z - dz],
            [x + dx, y - 0.28, z + dz],
            [x + dx, y + 0.28, z + dz],
            [x - dx, y + 0.28, z - dz]
         ],
         [-Math.sin(direction), 0, Math.cos(direction)],
         9,
         [
            [0, (row + 1) / 16],
            [1, (row + 1) / 16],
            [1, row / 16],
            [0, row / 16]
         ]
      );
   }
}
export function buildWorld(world) {
   const mesh = new Mesh(),
      signMesh = new Mesh();
   for (const cell of world.cells.values()) {
      const x = cell.x * 2,
         z = cell.z * 2,
         pool = cell.region === 'pool';
      const inWater = x >= basin.x && x < basin.x + basin.w && z >= basin.z && z < basin.z + basin.d;
      mesh.box(
         x,
         inWater ? -1.45 : -0.12,
         z,
         2,
         0.12,
         2,
         pool ? 3 : cell.region === 'pump' ? 4 : cell.region === 'storage' ? 2 : 1
      );
      mesh.box(x, pool ? 5.5 : 3.8, z, 2, 0.1, 2, 5);
      if (cell.x % 2 === 0 && cell.z % 2 === 0)
         mesh.box(x + 0.3, pool ? 5.46 : 3.76, z + 0.7, 1.4, 0.025, 0.55, 6);
   }
   for (const box of world.solids) {
      if (box.pit) continue;
      mesh.box(box.x, 0, box.z, box.w, box.h, box.d, box.material);
      if (box.shelf)
         for (const y of [0.2, 1.2, 2.2]) mesh.box(box.x - 0.08, y, box.z, box.w + 0.16, 0.08, box.d, 4);
      if (box.machine) mesh.box(box.x + 0.2, box.h, box.z + 0.7, box.w - 0.4, 0.18, 0.3, 8);
   }
   for (const [x, z, w, d] of [
      [3.85, 30, 0.15, 12.15],
      [14, 30, 0.15, 12.15],
      [4, 29.85, 10, 0.15],
      [4, 42, 10, 0.15]
   ])
      mesh.box(x, -1.4, z, w, 1.4, d, 3);
   for (const z of [33, 41]) {
      for (let i = 0; i < 32; i++) {
         const a = (i * Math.PI) / 32,
            b = ((i + 1) * Math.PI) / 32;
         const points = [
            [9 + 6.6 * Math.cos(a), 3.1 + 2.35 * Math.sin(a), z],
            [9 + 6.6 * Math.cos(b), 3.1 + 2.35 * Math.sin(b), z],
            [9 + 6.6 * Math.cos(b), 3.1 + 2.35 * Math.sin(b), z + 0.65],
            [9 + 6.6 * Math.cos(a), 3.1 + 2.35 * Math.sin(a), z + 0.65]
         ];
         mesh.quad(points, [-Math.cos((a + b) / 2), -Math.sin((a + b) / 2), 0], 3);
         for (const zz of [z, z + 0.65])
            mesh.quad(
               [
                  [points[0][0], points[0][1], zz],
                  [points[1][0], points[1][1], zz],
                  [points[1][0], 5.5, zz],
                  [points[0][0], 5.5, zz]
               ],
               [0, 0, 1],
               3
            );
      }
   }
   const signs = [
      [17.75, 2.8, 7, Math.PI / 2, 0],
      [26.25, 2.8, 7, -Math.PI / 2, 3],
      [7, 2.8, 15.75, Math.PI, 1],
      [7, 2.8, 26.25, 0, 3],
      [29, 2.8, 13.75, Math.PI, 1],
      [17.75, 2.8, 29, Math.PI / 2, 0],
      [35, 2.8, 13.75, Math.PI, 2],
      [35, 2.8, 30.25, 0, 0],
      [17.75, 2.8, 37, Math.PI / 2, 2],
      [28.25, 2.8, 37, -Math.PI / 2, 1],
      [0.22, 2.6, 7, -Math.PI / 2, 4],
      [39.75, 2.6, 41, Math.PI / 2, 5],
      [9, 1.1, 29.84, Math.PI, 6]
   ];
   for (const sign of signs) signMesh.sign(...sign);
   mesh.box(0.12, 0, 6, 0.12, 2.25, 2, 4);
   mesh.box(39.65, 1.0, 40.6, 0.22, 0.8, 0.8, 4);
   mesh.quad(
      [
         [4, -0.1, 30],
         [14, -0.1, 30],
         [14, -0.1, 42],
         [4, -0.1, 42]
      ],
      [0, 1, 0],
      12
   );
   return { mesh: mesh.data, signs: signMesh.data };
}
