import { selectedResident } from './village.js';

export const questions = ['How are you?', "What's the plan?", 'Any news?'];
export const behaviorNames = { exploring: 'Exploring', seekingWater: 'Finding water', drinking: 'Water break',
   seekingHome: 'Heading home', resting: 'Resting', stuck: 'Finding a way', waiting: 'Waiting for a nap' };

export function questionAt(hit) {
   return buttonAt(hit, 300, 362);
}

export function residentAt(hit) {
   return buttonAt(hit, 94, 126);
}

export function speedAt(hit) {
   if (!hit) return false;
   const x = (hit[0] + 1) * 400, y = (1 - hit[1]) * 190;
   return x >= 640 && x <= 780 && y >= 10 && y <= 44;
}

function buttonAt(hit, top, bottom) {
   if (!hit) return -1;
   const x = (hit[0] + 1) * 400, y = (1 - hit[1]) * 190;
   if (y < top || y > bottom) return -1;
   const index = Math.floor((x - 20) / 252);
   return index >= 0 && index < 3 && x <= 260 + index * 252 ? index : -1;
}

export function createVillageUI(state, ai) {
   const root = document.createElement('section');
   root.id = 'village-dialogue';
   root.setAttribute('aria-label', 'Village conversations');
   root.style.cssText = 'position:fixed;right:12px;bottom:12px;width:min(340px,calc(100vw - 24px));box-sizing:border-box;padding:14px;background:#15221fee;color:#e9f4ed;border:1px solid #588371;border-radius:12px;font:14px/1.5 sans-serif;z-index:20';
   root.innerHTML = `<div data-residents style="display:flex;gap:6px;margin-bottom:8px"></div>
      <details open><summary style="cursor:pointer;margin-bottom:8px">Conversation</summary>
      <strong data-name>Penger</strong><div data-status></div><div data-reason style="color:#acd0b7;margin:5px 0"></div>
      <div data-log role="log" aria-live="polite" style="max-height:150px;overflow:auto;margin:8px 0"></div>
      <div data-questions style="display:flex;gap:5px;flex-wrap:wrap;margin-bottom:8px"></div>
      <form style="display:flex;gap:6px"><input aria-label="Talk to Penger" placeholder="Ask Penger…" maxlength="300" style="min-width:0;flex:1;padding:7px;border:1px solid #588371;border-radius:6px;background:#24372e;color:white"><button type="submit">Send</button></form>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px;font-size:12px"><span data-ai></span><button type="button" data-speed>1× speed</button><button type="button" data-save>Save state</button></div>
      <div style="margin-top:8px;font-size:12px;color:#acd0b7"><strong>Village news</strong><div data-news style="max-height:70px;overflow:auto"></div></div>
      <div style="font-size:12px;color:#acd0b7;margin-top:7px">VR: aim with your right hand. Hold grip to move a place; release to place it. Aim at a chat button and press trigger to ask.</div></details>`;
   for (const button of root.querySelectorAll('button'))
      button.style.cssText = 'cursor:pointer;border:1px solid #588371;border-radius:6px;background:#2b4938;color:white;padding:5px 8px';
   const status = root.querySelector('[data-status]'), reason = root.querySelector('[data-reason]');
   const log = root.querySelector('[data-log]'), info = root.querySelector('[data-ai]');
   const form = root.querySelector('form'), input = root.querySelector('input');
   let lastHistory = '', lastNews = '', active = true, immersive = false;
   for (const resident of state.residents) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = resident.name;
      button.dataset.resident = resident.id;
      button.onclick = () => { state.selectedResident = resident.id; update(); };
      root.querySelector('[data-residents]').append(button);
   }
   const ask = async question => {
      if (selectedResident(state).ai.dialogue.status === 'waiting') return;
      const answer = ai.chat(question);
      update();
      await answer;
      if (active) update();
   };
   root.querySelector('[data-speed]').onclick = () => { state.speed = state.speed === 1 ? 3 : 1; update(); };
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
      link.download = 'village-state.json';
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
   };
   document.body.append(root);
   function update(inVR = immersive) {
      immersive = inVR;
      root.hidden = immersive;
      const resident = selectedResident(state), aiState = resident.ai;
      root.querySelector('[data-name]').textContent = resident.name;
      input.setAttribute('aria-label', 'Talk to ' + resident.name);
      input.placeholder = 'Ask ' + resident.name + '…';
      status.textContent = `${behaviorNames[resident.behavior]} · Thirst ${Math.round(resident.needs.thirst * 100)}% · Fatigue ${Math.round(resident.needs.fatigue * 100)}% · Trust ${Math.round(resident.trust * 100)}%`;
      reason.textContent = resident.reason;
      info.textContent = aiState.dialogue.status === 'waiting' ? resident.name + ' is thinking…' :
                         aiState.dialogue.status === 'failed' ? 'AI unavailable · State-based reply' : 'Waddling along';
      root.querySelector('[data-speed]').textContent = state.speed + '× speed';
      for (const button of root.querySelectorAll('[data-resident]')) {
         const selected = button.dataset.resident === resident.id;
         button.setAttribute('aria-pressed', String(selected));
         button.style.cssText = 'cursor:pointer;border:1px solid #588371;border-radius:6px;color:white;padding:5px 8px;background:' + (selected ? '#497b57' : '#2b4938');
      }
      const history = resident.id + JSON.stringify(aiState.history);
      if (history !== lastHistory) {
         lastHistory = history;
         log.replaceChildren();
         for (const item of aiState.history.slice(-6)) {
            const line = document.createElement('div');
            line.style.marginBottom = '7px';
            line.textContent = (item.role === 'user' ? 'You: ' : resident.name + ': ') + item.content;
            log.append(line);
         }
         log.scrollTop = log.scrollHeight;
      }
      const news = state.events.filter(item => item.text).slice(-3).map(item => item.text).join('\n');
      if (news !== lastNews) {
         lastNews = news;
         root.querySelector('[data-news]').textContent = news || 'Neighbors are getting to know the village.';
         root.querySelector('[data-news]').style.whiteSpace = 'pre-line';
      }
      for (const button of root.querySelectorAll('[data-questions] button, button[type="submit"]'))
         button.disabled = aiState.dialogue.status === 'waiting';
   }
   update();
   return { update, ask, dispose() { active = false; root.remove(); } };
}

export function paintDialogue(canvas, state, hovered = -1, hoveredResident = -1) {
   const context = canvas.getContext('2d'), resident = selectedResident(state);
   context.fillStyle = '#15221f';
   context.fillRect(0, 0, canvas.width, canvas.height);
   context.fillStyle = '#c9f8d4';
   context.font = 'bold 30px sans-serif';
   context.fillText(resident.name + ' · ' + behaviorNames[resident.behavior], 24, 42);
   context.fillStyle = '#2b4938';
   context.fillRect(640, 10, 140, 34);
   context.fillStyle = '#ffffff';
   context.font = '20px sans-serif';
   context.fillText(state.speed + '× speed', 655, 34);
   context.font = '22px sans-serif';
   context.fillText(`Thirst ${Math.round(resident.needs.thirst * 100)}%    Fatigue ${Math.round(resident.needs.fatigue * 100)}%    Trust ${Math.round(resident.trust * 100)}%`, 24, 78);
   for (let i = 0; i < state.residents.length; i++) {
      const x = 20 + i * 252;
      context.fillStyle = hoveredResident === i || state.residents[i].id === resident.id ? '#497b57' : '#2b4938';
      context.fillRect(x, 94, 240, 32);
      context.fillStyle = '#ffffff';
      context.font = '20px sans-serif';
      context.fillText(state.residents[i].name, x + 12, 117);
   }
   context.font = '22px sans-serif';
   const last = resident.ai.history.filter(item => item.role === 'assistant').at(-1);
   const text = resident.ai.dialogue.status === 'waiting' ? 'One moment… gathering my very important penguin thoughts.' : last?.content || resident.reason;
   context.fillStyle = '#ecf3ef';
   let line = '', y = 155;
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
   context.font = '14px sans-serif';
   const news = state.events.filter(item => item.text).at(-1);
   if (news) context.fillText(news.text.slice(0, 94), 24, 284);
   for (let i = 0; i < questions.length; i++) {
      const x = 20 + i * 252;
      context.fillStyle = hovered === i ? '#497b57' : '#2b4938';
      context.fillRect(x, 300, 240, 62);
      context.fillStyle = '#ffffff';
      context.font = '21px sans-serif';
      context.fillText(questions[i], x + 12, 339);
   }
   context.font = '14px sans-serif';
   context.fillText('Right grip: move a place. Trigger: select a neighbor or ask a question.', 24, 377);
}
