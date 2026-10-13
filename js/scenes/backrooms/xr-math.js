export function rigMatrix(x, z, yaw) {
   const c = Math.cos(yaw),
      s = Math.sin(yaw);
   return new Float32Array([c, 0, s, 0, 0, 1, 0, 0, -s, 0, c, 0, x, 0, z, 1]);
}
export function transformPoint(m, x, y, z) {
   return [
      m[0] * x + m[4] * y + m[8] * z + m[12],
      m[1] * x + m[5] * y + m[9] * z + m[13],
      m[2] * x + m[6] * y + m[10] * z + m[14]
   ];
}
