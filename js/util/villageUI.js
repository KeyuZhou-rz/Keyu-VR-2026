export const questions = ['How are you?', "What's the plan?", 'Any discoveries?'];
export const behaviorNames = { exploring: 'Exploring', seekingWater: 'Finding water', drinking: 'Water break',
   seekingHome: 'Heading home', resting: 'Resting', stuck: 'Finding a way' };

export function questionAt(hit) {
   if (!hit) return -1;
   const x = (hit[0] + 1) * 400, y = (1 - hit[1]) * 190;
   if (y < 300 || y > 362) return -1;
   const index = Math.floor((x - 20) / 252);
   return index >= 0 && index < 3 && x <= 260 + index * 252 ? index : -1;
}

export function createVillageUI(state, ai) {
   const root = document.createElement('section');
   root.id = 'village-dialogue';
   root.setAttribute('aria-label', 'Chat with Penger');
   root.style.cssText = 'position:fixed;right:12px;bottom:12px;width:min(340px,calc(100vw - 24px));box-sizing:border-box;padding:14px;background:#15221fee;color:#e9f4ed;border:1px solid #588371;border-radius:12px;font:14px/1.5 sans-serif;z-index:20';
   root.innerHTML = `<strong>Penger</strong><div data-status></div><div data-reason style="color:#acd0b7;margin:5px 0"></div>
      <div data-log role="log" aria-live="polite" style="max-height:150px;overflow:auto;margin:8px 0"></div>
      <div data-questions style="display:flex;gap:5px;flex-wrap:wrap;margin-bottom:8px"></div>
      <form style="display:flex;gap:6px"><input aria-label="Talk to Penger" placeholder="Ask Penger…" maxlength="300" style="min-width:0;flex:1;padding:7px;border:1px solid #588371;border-radius:6px;background:#24372e;color:white"><button type="submit">Send</button></form>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px;font-size:12px"><span data-ai></span><button type="button" data-save>Save state</button></div>
      <div style="font-size:12px;color:#acd0b7;margin-top:7px">VR: aim with your right hand. Hold grip to move a place; release to place it. Aim at a chat button and press trigger to ask.</div>`;
   for (const button of root.querySelectorAll('button'))
      button.style.cssText = 'cursor:pointer;border:1px solid #588371;border-radius:6px;background:#2b4938;color:white;padding:5px 8px';
   const status = root.querySelector('[data-status]'), reason = root.querySelector('[data-reason]');
   const log = root.querySelector('[data-log]'), info = root.querySelector('[data-ai]');
   const form = root.querySelector('form'), input = root.querySelector('input');
   let lastHistory = '', active = true;
   const ask = async question => {
      if (state.ai.dialogue.status === 'waiting') return;
      const answer = ai.chat(question);
      update();
      await answer;
      if (active) update();
   };
   for (const question of questions) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = question;
      button.style.cssText = 'cursor:pointer;border:1px solid #588371;border-radius:6px;background:#2b4938;color:white;padding:5px 8px;font-size:12px';
      button.onclick = () => ask(question);
      root.querySelector('[data-questions]').append(button);
   }
   form.onsubmit = event => {
      event.preventDefault();
      if (!input.value.trim()) return;
      const question = input.value.trim();
      input.value = '';
      ask(question);
   };
   root.querySelector('[data-save]').onclick = () => {
      const url = URL.createObjectURL(new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = 'penger-state.json';
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
   };
   document.body.append(root);
   function update(inVR = false) {
      root.hidden = inVR;
      const rabbit = state.rabbit;
      status.textContent = `${behaviorNames[rabbit.behavior]} · Thirst ${Math.round(rabbit.needs.thirst * 100)}% · Fatigue ${Math.round(rabbit.needs.fatigue * 100)}%`;
      reason.textContent = rabbit.reason;
      info.textContent = state.ai.dialogue.status === 'waiting' ? 'Penger is thinking…' :
                         state.ai.dialogue.status === 'failed' ? 'AI unavailable · State-based reply' :
                         state.ai.planner.status === 'failed' ? 'Waddling along · Rule-based decisions' : 'Waddling along';
      const history = JSON.stringify(state.ai.history);
      if (history !== lastHistory) {
         lastHistory = history;
         log.replaceChildren();
         for (const item of state.ai.history.slice(-6)) {
            const line = document.createElement('div');
            line.style.marginBottom = '7px';
            line.textContent = (item.role === 'user' ? 'You: ' : 'Penger: ') + item.content;
            log.append(line);
         }
         log.scrollTop = log.scrollHeight;
      }
      for (const button of root.querySelectorAll('button:not([data-save])'))
         button.disabled = state.ai.dialogue.status === 'waiting';
   }
   update();
   return { update, ask, dispose() { active = false; root.remove(); } };
}

export function paintDialogue(canvas, state, hovered = -1) {
   const context = canvas.getContext('2d'), rabbit = state.rabbit;
   context.fillStyle = '#15221f';
   context.fillRect(0, 0, canvas.width, canvas.height);
   context.fillStyle = '#c9f8d4';
   context.font = 'bold 30px sans-serif';
   context.fillText('Penger · ' + behaviorNames[rabbit.behavior], 24, 42);
   context.font = '22px sans-serif';
   context.fillText(`Thirst ${Math.round(rabbit.needs.thirst * 100)}%     Fatigue ${Math.round(rabbit.needs.fatigue * 100)}%`, 24, 78);
   context.font = '18px sans-serif';
   context.fillText('Right grip: move a place. Trigger on a chat button: ask Penger.', 24, 105);
   context.font = '22px sans-serif';
   const last = state.ai.history.filter(item => item.role === 'assistant').at(-1);
   const text = state.ai.dialogue.status === 'waiting' ? 'One moment… gathering my very important penguin thoughts.' : last?.content || rabbit.reason;
   context.fillStyle = '#ecf3ef';
   let line = '', y = 140;
   for (const word of text.split(/\s+/)) {
      const next = line ? line + ' ' + word : word;
      if (line && context.measureText(next).width > canvas.width - 48) {
         context.fillText(line, 24, y);
         line = word;
         y += 29;
         if (y > 265) break;
      }
      else line = next;
   }
   if (y <= 265) context.fillText(line, 24, y);
   for (let i = 0; i < questions.length; i++) {
      const x = 20 + i * 252;
      context.fillStyle = hovered === i ? '#497b57' : '#2b4938';
      context.fillRect(x, 300, 240, 62);
      context.fillStyle = '#ffffff';
      context.font = '21px sans-serif';
      context.fillText(questions[i], x + 12, 339);
   }
}
