import { snapshot, validatePlan, applyPlan, describeState, say } from './village.js';

const plannerPrompt = `Choose one next action for the penguin named in this snapshot.
Use only the supplied observations, needs, memories and options. Choose exactly one supplied option, prioritizing urgent thirst or fatigue. Never invent a place or coordinates. Return only JSON: {"action":"explore","cell":[x,z]} or {"action":"seekWater","target":"known-id"} or {"action":"seekHome","target":"known-id"}. Do not return steps, positions, or changes to needs.`;
const pengerVoice = `You are the penguin named in the supplied snapshot. Follow its personality: each resident has a distinct voice. Always speak English, in first person. Sound like a companion, not a status monitor: use warm, lightly mischievous remarks, small surprises, and occasional flipper or waddle wordplay. Keep it natural, not baby talk, and do not squeeze a joke into every sentence. Answer the actual question in 1-3 short sentences. Use one or two relevant details rather than listing needs or percentages. For casual questions, chat back: present preferences and playful opinions are fine, but never invent past experiences or world facts. Do not turn every answer into a report about drinking or exploring. Vary your phrasing and avoid repeating the previous reply.`;
const dialoguePrompt = `${pengerVoice}
Use only the supplied state snapshot and conversation for factual claims. A known place with source "heard" is a report, not your own observation: name the last person in observation.chain as your source. Never claim another resident's private memories or needs. Use social.trustPlayer and witnessed memories to explain irritation without inventing blame. The snapshot describes you at the time the question was asked. Say what you were doing then if time has passed. Needs range from 0 (satisfied) to 1 (urgent). A null target means no named resource target; destination still shows where you are exploring. Draw on a relevant discovery, memory, obstacle, or current feeling when it helps answer the question. Never claim to know an undiscovered location, invent an event, blame the player without evidence, or pretend a conversation changed your actions. Say you do not know when evidence is missing. Do not mention engine internals, JSON, utility scores, or grid coordinates. If social.playerIsHere is true, the player is standing right beside you in the village and you may mention it warmly; otherwise the player is only watching from above. Dialogue cannot change the simulation.
Return only JSON {"reply":"your short answer","evidence":["behavior"]}. Evidence must be a nonempty list of exact entries from the supplied evidenceKeys, supporting the details you actually used. Never copy a placeholder or cite a memory only found in older conversation. Keep the reply under 280 characters.`;
const reactionPrompt = `${plannerPrompt}
${pengerVoice}
The surprise describes an observed event. If its kind is "missing", you found an empty old location and do not know who moved the place or where it went. If its kind is "disturbed", you personally saw the player repeatedly move a place; explain your protest and temporary avoidance using that memory. A known place marked "missing" is not a current resource. Your plan is a proposal; do not claim it has already happened.
Return one JSON object containing ALL of these fields: "reply" (your reaction under 280 characters), "evidence" (a nonempty array of exact strings from evidenceKeys, including "memory:" followed by the actual surprise.memoryId), and the chosen "action" with "cell" or "target" from a supplied option. If there are no options, return only reply and evidence. Put citations ONLY in the evidence array, never in the spoken reply. Never mention record/status labels, JSON, engine internals or grid coordinates in the reply, and do not invent a cause.`;

const replyEvidence = context => ['behavior', 'needs', 'known', 'reason', 'target', 'destination', 'social', 'nearby',
   ...context.memories.map(memory => 'memory:' + memory.id)];

function readReply(answer, context) {
   const allowed = new Set(replyEvidence(context));
   if (typeof answer.reply !== 'string' || !answer.reply.trim() || answer.reply.length > 400 ||
       !Array.isArray(answer.evidence) || !answer.evidence.length ||
       !answer.evidence.every(item => allowed.has(item))) throw new Error('Invalid dialogue evidence');
   return answer.reply.trim();
}

export function createVillageAI(state, { resident = state.residents[0], fetchImpl = fetch, timeoutMs = 10000 } = {}) {
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
         const reaction = resident.surprise && !resident.surprise.handled;
         if (!active || planning || !reaction && (state.time < nextPlan ||
             ['drinking', 'resting'].includes(resident.behavior))) return;
         const situation = [resident.intent, resident.memoryCount, resident.behavior].join(':');
         if (situation === lastSituation) return;
         const context = snapshot(state, resident);
         if (!context.options.length && !reaction) return;
         lastSituation = situation;
         planning = true;
         nextPlan = state.time + 12;
         const intent = resident.intent;
         const revision = state.mapRevision;
         resident.ai.planner = { status: 'waiting', detail: 'Thinking about the next move.' };
         try {
            const plan = await request(reaction ? reactionPrompt : plannerPrompt,
               reaction ? { ...context, evidenceKeys: replyEvidence(context) } : context);
            if (!active) return;
            if (reaction && resident.surprise?.memoryId === context.surprise.memoryId) {
               const reply = readReply(plan, context);
               if (!plan.evidence.includes('memory:' + context.surprise.memoryId)) throw new Error('Missing observation evidence');
               say(state, resident, reply, 'ai');
               resident.surprise.handled = true;
            }
            if (resident.intent !== intent || state.mapRevision !== revision) {
               resident.ai.planner = { status: 'stale', detail: 'The situation changed; planning again next time.' };
               return;
            }
            if (context.options.length && (!validatePlan(state, plan, resident) || !applyPlan(state, plan, 'ai', resident)))
               throw new Error('Invalid or outdated plan');
            resident.ai.planner = { status: 'ready', detail: context.options.length ? 'Plan validated.' : 'Reaction shared; no reachable goal yet.' };
         }
         catch (error) {
            if (active) {
               resident.ai.planner = { status: 'failed', detail: error.message };
               if (reaction && resident.surprise?.memoryId === context.surprise.memoryId && !resident.surprise.handled) {
                  say(state, resident, context.surprise.text);
                  resident.surprise.handled = true;
               }
            }
         }
         finally { planning = false; }
      },
      async chat(question) {
         if (!active || chatting || !question.trim()) return null;
         chatting = true;
         const context = snapshot(state, resident);
         const fallback = describeState(state, resident);
         resident.ai.dialogue = { status: 'waiting', detail: '' };
         resident.ai.history.push({ role: 'user', content: question.trim() });
         if (resident.ai.history.length > 12) resident.ai.history.splice(0, resident.ai.history.length - 12);
         let reply = fallback, source = 'state';
         try {
            const answer = await request(dialoguePrompt, { state: context, question,
               conversation: resident.ai.history.slice(-6), evidenceKeys: replyEvidence(context) });
            reply = readReply(answer, context);
            source = 'ai';
            if (active) resident.ai.dialogue = { status: 'ready', detail: '' };
         }
         catch (error) {
            if (active) resident.ai.dialogue = { status: 'failed', detail: error.message };
         }
         finally { chatting = false; }
         if (!active) return null;
         say(state, resident, reply, source);
         return reply;
      },
      dispose() {
         active = false;
         for (const controller of controllers) controller.abort();
         controllers.clear();
      }
   };
}
