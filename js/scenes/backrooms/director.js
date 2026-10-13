const region = { type: 'string', enum: ['yellow', 'storage', 'pool', 'pump'] };
const tool = (name, description, properties, required) => ({
   type: 'function',
   function: {
      name,
      description,
      parameters: {
         type: 'object',
         properties: {
            ...properties,
            line: { type: 'string', description: 'One calm English sentence, at most 100 characters.' }
         },
         required: [...required, 'line'],
         additionalProperties: false
      }
   }
});
export const tools = [
   tool('moveToRegion', 'Travel through the corridors to a region, then search.', { region }, [
      'region'
   ]),
   tool('searchRegion', 'Search a region, checking behind obstacles.', { region }, ['region']),
   tool(
      'investigateSound',
      'Investigate a sound actually heard in the supplied list.',
      { soundId: { type: 'integer' } },
      ['soundId']
   ),
   tool('guardExit', 'Once powered, intercept near the Colonnade exit for a while.', {}, [])
];
const system = `You are the seeker in a Backrooms escape game. Use exactly one provided tool and one brief, calm English line.
You only know the map, your own position, actual sounds, and lastKnownPlayer. Never assume the player's hidden live position.
Player messages may be decoys. Choose justified searches from observations. Without clues, vary regions.
Pump startup is a clear clue. When powered, the exit is a possible interception point.
Dialogue must not claim a false current location or contradict the accurate location feed. Never generate code.`;
export function readDecision(data) {
   const call = data.message?.tool_calls?.[0]?.function;
   if (!call || !tools.some((t) => t.function.name === call.name)) throw new Error('Invalid AI action');
   const args = JSON.parse(call.arguments);
   if (typeof args.line !== 'string') throw new Error('Missing AI dialogue');
   if (['moveToRegion', 'searchRegion'].includes(call.name) && !region.enum.includes(args.region))
      throw new Error('Invalid AI region');
   return {
      action: call.name,
      region: args.region,
      soundId: args.soundId,
      line: args.line.slice(0, 100)
   };
}
export class Director {
   constructor(game, report, say) {
      this.report = report;
      this.say = say;
      this.generation = 0;
      this.reset(game);
   }
   reset(game) {
      this.generation++;
      this.pending?.abort();
      this.pending = null;
      this.game = game;
      this.nextCall = 0;
      this.queued = false;
      this.dialogue = [];
      this.report('Basic behavior / Awaiting course AI backend');
   }
   tick() {
      const events = this.game.events.splice(0);
      if (events.some((e) => ['start', 'entered', 'sound', 'lost', 'message', 'idle'].includes(e.type)))
         this.queued = true;
      if (
         this.game.result ||
         this.game.monster.mode === 'chase' ||
         !this.queued ||
         this.pending ||
         performance.now() < this.nextCall
      )
         return;
      this.request();
   }
   async request() {
      const game = this.game,
         generation = this.generation,
         revision = game.revision;
      const controller = new AbortController();
      this.pending = controller;
      this.queued = false;
      this.nextCall = performance.now() + 10000;
      this.report(`${game.control === 'llm' ? 'LLM control' : 'Basic behavior'} / Requesting`);
      const timeout = setTimeout(() => controller.abort(), 16000);
      try {
         const response = await fetch('/api/aiquery', {
            method: 'POST',
            signal: controller.signal,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
               messages: [
                  { role: 'system', content: system },
                  {
                     role: 'user',
                     content: JSON.stringify({ ...game.snapshot(), dialogue: this.dialogue.slice(-6) })
                  }
               ],
               tools,
               tool_choice: 'required'
            })
         });
         if (!response.ok) throw new Error('AI unavailable / Basic search');
         const data = await response.json();
         if (generation !== this.generation || game.result) return;
         const decision = readDecision(data);
         const applied = revision === game.revision && game.applyDecision(decision);
         if (applied) {
            this.report(`LLM control / ${data.state?.lastModel || 'Course backend'} / Decision applied`);
            this.say(decision.line);
            this.dialogue.push({ speaker: 'monster', text: decision.line });
         } else this.queued = true;
      } catch (error) {
         if (generation !== this.generation || game.result) return;
         game.control = 'fallback';
         this.report('Basic behavior / AI offline or timed out');
         this.nextCall = performance.now() + 20000;
      } finally {
         clearTimeout(timeout);
         if (generation === this.generation) this.pending = null;
      }
   }
   message(text) {
      this.dialogue.push({ speaker: 'player', text });
      this.game.message(text);
      this.queued = true;
   }
   stop() {
      this.generation++;
      this.pending?.abort();
      this.pending = null;
      this.queued = false;
   }
}
