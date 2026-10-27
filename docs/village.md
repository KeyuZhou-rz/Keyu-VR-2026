# Village prototype: W5–W7

Open the course app and select **village**. Penger (green), Pip (gold), and Mox (blue) use the same penguin model, with independent needs, memories, knowledge, and conversations.

## Controls

- Desktop: choose a resident, ask a question, and watch **Village news**. Switch between 1× and 3× speed to observe longer interactions. Collapse **Conversation** to see the whole map in a narrow window.
- VR: use the right trigger on a resident tab or question. The speed button also uses the trigger.
- Hold the right grip while pointing at a house, water, or forest to drag it. Release to place it; invalid placements return to the original position.
- **Save state** downloads the complete JSON checkpoint, including all residents and message sources.

## Things to try

1. Watch Pip and Mox near the cottage at the start. The cottage has one resting spot, so residents queue and move out of the doorway after resting.
2. Let residents explore and meet. News is exchanged within 2.5 grid cells, with an eight-second cooldown per pair. Ask who told them about a place. Reports retain their original observer and relay chain; observing the place personally confirms the report.
3. Move the same place three times within 60 simulated seconds while a resident is nearby. Witnesses protest, lose some trust, and avoid choosing that place for 30 simulated seconds. Urgent needs can override avoidance. After 30 calm seconds, trust gradually recovers.
4. Move something far from a resident. That resident keeps its old knowledge and cannot blame the player without witnessing the move.

Simulation, message delivery, queues, and protests run without an AI connection. AI chooses only validated actions and provides English dialogue grounded in the selected resident's snapshot. Physical reservations prevent residents from entering each other's current movement segments.

## Code and checks

- `js/scenes/village.json`: initial world and residents.
- `js/util/village.js`: BFS, needs, reservations, rest queues, observations, gossip, and disturbance effects.
- `js/util/villageAI.js`: one AI session per resident.
- `js/scenes/village.js` and `js/util/villageUI.js`: rendering, controls, and conversations.
- `js/util/pengerView.js`: one reusable animated wireframe mesh per resident.

Run the automated checks with a recent Node.js version that supports importing ES modules from `.js` files:

```sh
node --experimental-vm-modules --test tests/village*.test.mjs
```

The tests cover single-resident behavior, controller event routing, three-resident simulation, message provenance, rest contention, interference, and JSON continuation. Controller tests simulate XR input; headset performance and comfort still need device testing.
