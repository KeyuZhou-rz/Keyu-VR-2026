# Village prototype: W5–W7

Open the course app and select **village**. Penger (green), Pip (gold), and Mox (blue) use the same penguin model, with independent needs, memories, knowledge, and conversations.

## Controls

- Desktop: choose a resident, ask a question, and watch **Village news**. Switch between 1× and 3× speed to observe longer interactions. Collapse **Conversation** to see the whole map in a narrow window.
- VR: use the right trigger on a resident tab or question. The speed button also uses the trigger.
- Hold the right grip while pointing at a house, water, or forest to drag it. Release to place it; invalid placements return to the original position.
- **Save state** downloads the complete JSON checkpoint, including all residents and message sources.

## God view and village view

- **God view** (default): the village is a tabletop board; grip drags places.
- **Village view**: press **V** (desktop), the **Enter village** button, or **B** in VR. The board scales up so one grid cell is half a meter and you stand on the ground at the nearest free cell. Walk with WASD or the **left** stick, and turn the village around you with the **right** stick; water, houses and trees block you. Dragging places is disabled here.
- Penguins within 2.5 cells turn toward you and greet you once (30 s cooldown), remember it, and route around you.
- The nearest penguin within 2.5 cells opens a **talk card** floating above it, turned toward your eyes: its latest line in large text plus four replies (How are you? / What are you up to? / Heard any news? / Bye for now). Point the right controller at a reply and pull the trigger, or press 1–4. The god-view panel is hidden in this mode. "Bye" closes the card until you step away and return.
- The talk partner is the selected resident, and its dialogue snapshot says `playerIsHere`.

## Things to try

1. Watch Pip and Mox near the cottage at the start. The cottage has one resting spot, so residents queue and move out of the doorway after resting.
2. Let residents explore and meet. News is exchanged within 2.5 grid cells, with an eight-second cooldown per pair. Ask who told them about a place. Reports retain their original observer and relay chain; observing the place personally confirms the report.
3. Move the same place three times within 60 simulated seconds while a resident is nearby. Witnesses protest, lose some trust, and avoid choosing that place for 30 simulated seconds. Urgent needs can override avoidance. After 30 calm seconds, trust gradually recovers.
4. Move something far from a resident. That resident keeps its old knowledge and cannot blame the player without witnessing the move.

Simulation, message delivery, queues, and protests run without an AI connection. AI chooses only validated actions and provides English dialogue grounded in the selected resident's snapshot. Physical reservations prevent residents from entering each other's current movement segments.

## Code and checks

- `js/scenes/village.json`: initial world and residents.
- `js/util/village.js`: view mode/player movement, BFS, needs, reservations, rest queues, observations, gossip, and disturbance effects.
- `js/util/villageAI.js`: one AI session per resident.
- `js/scenes/village.js` and `js/util/villageUI.js`: rendering, controls, and conversations.
- `js/util/pengerView.js`: one reusable animated wireframe mesh per resident.

Run the automated checks with a recent Node.js version that supports importing ES modules from `.js` files:

```sh
node --experimental-vm-modules --test tests/village*.test.mjs
```

The tests cover single-resident behavior, controller event routing, three-resident simulation, message provenance, rest contention, interference, and JSON continuation. Controller tests simulate XR input; headset performance and comfort still need device testing.
