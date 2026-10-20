import { snapshot, validatePlan, applyPlan, describeState } from './village.js';

const plannerPrompt = `You choose one next action for Penger, a small penguin living in a grid world.
Use only the supplied observations, needs, memories and options. Choose exactly one supplied option, prioritizing urgent thirst or fatigue. Never invent a place or coordinates. Return only JSON: {"action":"explore","cell":[x,z]} or {"action":"seekWater","target":"known-id"} or {"action":"seekHome","target":"known-id"}. Do not return steps, positions, or changes to needs.`;
const pengerVoice = `You are Penger, a curious, cheeky little penguin with big expedition energy and tiny waddling feet. Always speak English, in first person. Sound like a companion, not a status monitor: use warm, lightly mischievous remarks, small surprises, and occasional flipper or waddle wordplay. Keep it natural, not baby talk, and do not squeeze a joke into every sentence. Answer the actual question in 1-3 short sentences. Use one or two relevant details rather than listing needs or percentages. For casual questions, chat back: present preferences and playful opinions are fine, but never invent past experiences or world facts. Do not turn every answer into a report about drinking or exploring. Vary your phrasing and avoid repeating the previous reply.`;
const dialoguePrompt = `${pengerVoice}
Use only the supplied state snapshot and conversation for factual claims. The snapshot describes you at the time the question was asked. Say what you were doing then if time has passed. Needs range from 0 (satisfied) to 1 (urgent). A null target means no named resource target; destination still shows where you are exploring. Draw on a relevant discovery, memory, obstacle, or current feeling when it helps answer the question. Never claim to know an undiscovered location, invent an event, blame the player without evidence, or pretend a conversation changed your actions. Say you do not know when evidence is missing. Do not mention engine internals, JSON, utility scores, or grid coordinates. Dialogue cannot change the simulation.
Return only JSON {"reply":"your short answer","evidence":["behavior"]}. Evidence must be a nonempty list of exact entries from the supplied evidenceKeys, supporting the details you actually used. Never copy a placeholder or cite a memory only found in older conversation. Keep the reply under 280 characters.`;
const reactionPrompt = `${plannerPrompt}
${pengerVoice}
A remembered place was not found at its old location. Its known record may now have status "missing": do not treat that record as a current resource. You do not know where it went or who moved it. Also include a reply under 280 characters expressing puzzled surprise and your intended next step, as Penger rather than a navigation report. Never mention record/status labels, JSON, engine internals or grid coordinates, and do not invent a cause. Include evidence citing the surprise.memoryId as "memory:" followed by its actual number; choose exact entries from evidenceKeys. If there are no options, omit the action and just reply. Your plan is a proposal; do not claim it has already happened.`;

const replyEvidence = context => ['behavior', 'needs', 'known', 'reason', 'target', 'destination',
   ...context.memories.map(memory => 'memory:' + memory.id)];

function readReply(answer, context) {
   const allowed = new Set(replyEvidence(context));
   if (typeof answer.reply !== 'string' || !answer.reply.trim() || answer.reply.length > 400 ||
       !Array.isArray(answer.evidence) || !answer.evidence.length ||
       !answer.evidence.every(item => allowed.has(item))) throw new Error('Invalid dialogue evidence');
   return answer.reply.trim();
}

function addReply(state, content, source, time) {
   state.ai.history.push({ role: 'assistant', content, source, time });
   if (state.ai.history.length > 12) state.ai.history.splice(0, state.ai.history.length - 12);
}

export function createVillageAI(state, { fetchImpl = fetch, timeoutMs = 10000 } = {}) {
   let active = true, planning = false, chatting = false, nextPlan = 0, lastSituation = '';
   const controllers = new Set();

   async function request(prompt, input) {
      const controller = new AbortController();
      controllers.add(controller);
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      try {
         const response = await fetchImpl('/api/aiquery', {
            method: 'POST', signal: controller.signal,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ provider: 'deepseek', response_format: { type: 'json_object' },
               max_tokens: 500, messages: [{ role: 'system', content: prompt },
                                         { role: 'user', content: JSON.stringify(input) }] })
         });
         const data = await response.json();
         if (!active || controller.signal.aborted) throw new Error('Request cancelled');
         if (!response.ok) throw new Error(data.details || data.error || 'AI request failed');
         return JSON.parse(data.message?.content || data.response || '');
      }
      finally {
         clearTimeout(timeout);
         controllers.delete(controller);
      }
   }

   return {
      async tick() {
         const reaction = state.rabbit.surprise && !state.rabbit.surprise.handled;
         if (!active || planning || !reaction && (state.time < nextPlan ||
             ['drinking', 'resting'].includes(state.rabbit.behavior))) return;
         const situation = [state.rabbit.intent, state.rabbit.memoryCount, state.rabbit.behavior].join(':');
         if (situation === lastSituation) return;
         const context = snapshot(state);
         if (!context.options.length && !reaction) return;
         lastSituation = situation;
         planning = true;
         nextPlan = state.time + 12;
         const intent = state.rabbit.intent;
         const revision = state.mapRevision;
         state.ai.planner = { status: 'waiting', detail: 'Thinking about the next move.' };
         try {
            const plan = await request(reaction ? reactionPrompt : plannerPrompt,
               reaction ? { ...context, evidenceKeys: replyEvidence(context) } : context);
            if (!active) return;
            if (reaction && state.rabbit.surprise?.memoryId === context.surprise.memoryId) {
               const reply = readReply(plan, context);
               if (!plan.evidence.includes('memory:' + context.surprise.memoryId)) throw new Error('Missing observation evidence');
               addReply(state, reply, 'ai', context.time);
               state.rabbit.surprise.handled = true;
            }
            if (state.rabbit.intent !== intent || state.mapRevision !== revision) {
               state.ai.planner = { status: 'stale', detail: 'The situation changed; planning again next time.' };
               return;
            }
            if (context.options.length && (!validatePlan(state, plan) || !applyPlan(state, plan, 'ai')))
               throw new Error('Invalid or outdated plan');
            state.ai.planner = { status: 'ready', detail: context.options.length ? 'Plan validated.' : 'Reaction shared; no reachable goal yet.' };
         }
         catch (error) {
            if (active) {
               state.ai.planner = { status: 'failed', detail: error.message };
               if (reaction && state.rabbit.surprise?.memoryId === context.surprise.memoryId && !state.rabbit.surprise.handled) {
                  addReply(state, context.surprise.text, 'state', context.time);
                  state.rabbit.surprise.handled = true;
               }
            }
         }
         finally { planning = false; }
      },
      async chat(question) {
         if (!active || chatting || !question.trim()) return null;
         chatting = true;
         const context = snapshot(state);
         const fallback = describeState(state);
         state.ai.dialogue = { status: 'waiting', detail: '' };
         state.ai.history.push({ role: 'user', content: question.trim() });
         if (state.ai.history.length > 12) state.ai.history.splice(0, state.ai.history.length - 12);
         let reply = fallback, source = 'state';
         try {
            const answer = await request(dialoguePrompt, { state: context, question,
               conversation: state.ai.history.slice(-6), evidenceKeys: replyEvidence(context) });
            reply = readReply(answer, context);
            source = 'ai';
            if (active) state.ai.dialogue = { status: 'ready', detail: '' };
         }
         catch (error) {
            if (active) state.ai.dialogue = { status: 'failed', detail: error.message };
         }
         finally { chatting = false; }
         if (!active) return null;
         addReply(state, reply, source, context.time);
         return reply;
      },
      dispose() {
         active = false;
         for (const controller of controllers) controller.abort();
         controllers.clear();
      }
   };
}
