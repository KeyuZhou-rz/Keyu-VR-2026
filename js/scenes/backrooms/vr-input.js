import { move } from './world.js';
import { rigMatrix } from './xr-math.js';

export function stick(gamepad) {
   const axes = gamepad?.axes || [],
      offset = axes.length >= 4 ? 2 : 0;
   const x = axes[offset] || 0,
      y = axes[offset + 1] || 0,
      length = Math.hypot(x, y);
   if (length <= 0.18) return { x: 0, y: 0 };
   const strength = Math.min(1, (length - 0.18) / 0.82);
   return { x: (x / length) * strength, y: (y / length) * strength };
}
export class VRInput {
   constructor() {
      this.reset(0);
   }
   reset(yaw) {
      this.yaw = yaw;
      this.lastHead = null;
      this.align = true;
      this.snapReady = true;
      this.buttons = new Map();
   }
   recenter() {
      this.lastHead = null;
      this.align = true;
   }
   update(game, pose, sources, active) {
      const head = pose.transform.matrix,
         p = game.player;
      const headYaw = Math.atan2(-head[8], head[10]);
      if (this.align) {
         this.yaw = p.yaw - headYaw;
         this.align = false;
      }
      if (active && this.lastHead) {
         const dx = head[12] - this.lastHead[0],
            dz = head[14] - this.lastHead[1];
         const c = Math.cos(this.yaw),
            s = Math.sin(this.yaw);
         move(game.world, p, c * dx - s * dz, s * dx + c * dz);
      }
      this.lastHead = [head[12], head[14]];
      const left = [...sources].find((s) => s.handedness === 'left')?.gamepad;
      const right = [...sources].find((s) => s.handedness === 'right')?.gamepad;
      const walking = stick(left),
         turning = stick(right);
      if (Math.abs(turning.x) < 0.25) this.snapReady = true;
      if (active && this.snapReady && Math.abs(turning.x) > 0.65) {
         this.yaw += (Math.sign(turning.x) * Math.PI) / 6;
         this.snapReady = false;
      }
      p.yaw = this.yaw + headYaw;
      const edge = (id, down) => {
         const pressed = !!down && !this.buttons.get(id);
         this.buttons.set(id, !!down);
         return pressed;
      };
      return {
         forward: -walking.y,
         right: walking.x,
         sprint: !!left?.buttons[1]?.pressed,
         interact: edge('trigger', right?.buttons[0]?.pressed),
         pause: edge('pause', right?.buttons[4]?.pressed),
         restart: edge('restart', left?.buttons[4]?.pressed),
         exit: edge('exit', right?.buttons[5]?.pressed)
      };
   }
   transform(game, pose) {
      const head = pose.transform.position,
         c = Math.cos(this.yaw),
         s = Math.sin(this.yaw);
      return rigMatrix(
         game.player.x - c * head.x + s * head.z,
         game.player.z - s * head.x - c * head.z,
         this.yaw
      );
   }
}
