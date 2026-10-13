export class VRHud {
   constructor() {
      this.canvas = document.createElement('canvas');
      this.canvas.width = 1024;
      this.canvas.height = 512;
      this.nextDraw = 0;
   }
   update(now, game, state) {
      if (now < this.nextDraw) return false;
      this.nextDraw = now + 100;
      const ctx = this.canvas.getContext('2d');
      ctx.clearRect(0, 0, 1024, 512);
      ctx.fillStyle = '#131d17ed';
      ctx.fillRect(0, 0, 1024, 512);
      ctx.strokeStyle = game.monster.mode === 'chase' ? '#dc786b' : '#c8bb78';
      ctx.lineWidth = 4;
      ctx.strokeRect(2, 2, 1020, 508);
      const text = (line, x, y, width, size = 25, color = '#e9e3bf') => {
         ctx.font = `${size}px sans-serif`;
         ctx.fillStyle = color;
         let row = '',
            baseline = y;
         for (const word of line.split(' ')) {
            const next = row ? row + ' ' + word : word;
            if (row && ctx.measureText(next).width > width) {
               ctx.fillText(row, x, baseline);
               baseline += size + 7;
               row = word;
            } else row = next;
         }
         ctx.fillText(row, x, baseline);
      };
      let title = game.powered ? 'RETURN TO THE COLONNADE EXIT' : 'RESTORE POWER IN THE PUMP ROOM';
      if (game.result) title = game.result === 'won' ? 'YOU ESCAPED THE FACILITY' : 'IT FOUND YOU';
      else if (!state.active) title = 'PAUSED';
      text(title, 28, 45, 970, 30);
      text(game.broadcast(), 28, 92, 965, 25, '#e4ce84');
      text(state.ai, 28, 172, 700, 19, '#a7b7aa');
      text(state.dialogue || 'Listen to the location feed. Chat is optional.', 28, 214, 680, 23);
      const item = game.interaction();
      const prompt = game.result
         ? 'Right trigger: restart'
         : !state.active
         ? 'Right trigger: resume'
         : state.notice ||
           (item ? `Right trigger: ${item.label}` : 'Follow the corridors. Close doors to buy time.');
      text(prompt, 28, 323, 700, 25, '#f3e39f');
      text('Left stick: move · Right stick: 30° turn · Left grip: run', 28, 416, 970, 21);
      text('A / B: pause · X: restart while paused · Desktop: E / P / R', 28, 456, 970, 21);
      if (state.map) ctx.drawImage(state.map, 768, 205, 240, 180);
      return true;
   }
}
