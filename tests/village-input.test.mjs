import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createContext, runInContext, SourceTextModule, SyntheticModule } from 'node:vm';
import * as cg from '../js/render/core/cg.js';
import * as village from '../js/util/village.js';
import { questionAt, questions, paintDialogue, residentAt, speedAt } from '../js/util/villageUI.js';

const claySource = await readFile(new URL('../js/render/core/clay.js', import.meta.url), 'utf8');
const textureMethods = claySource.slice(claySource.indexOf('   this.setTxtr ='),
   claySource.indexOf('\n}\n\nwindow._canvas_txtr'));
const uploadSource = claySource.slice(claySource.indexOf('   if (_canvas_txtr[txtr]'),
   claySource.indexOf("   setUniform('1i', 'uTxtr'"));

class Node {
   constructor(parent = null) {
      this.parent = parent; this.children = []; this.textureMethods = parent?.textureMethods; this.identity();
   }
   add() { const node = new Node(this); this.children.push(node); return node; }
   child(index) { return this.children[index]; }
   nChildren() { return this.children.length; }
   remove(index) { this.children.splice(index, 1); }
   identity() { this.matrix = cg.mIdentity(); return this; }
   setMatrix(matrix) { this.matrix = matrix; return this; }
   move(...args) { this.matrix = cg.mMultiply(this.matrix, cg.mTranslate(...args)); return this; }
   scale(...args) { this.matrix = cg.mMultiply(this.matrix, cg.mScale(...args)); return this; }
   turnX(angle) { this.matrix = cg.mMultiply(this.matrix, cg.mRotateX(angle)); return this; }
   getMatrixFromRoot() { return this.getGlobalMatrix(); }
   getGlobalMatrix() {
      return this.parent ? cg.mMultiply(this.parent.getGlobalMatrix(), this.matrix) : this.matrix;
   }
   color() { return this; }
   info() { return this; }
   dull() { return this; }
   opacity(value) { this.alpha = value; return this; }
   setTxtr(...args) { this.textureMethods.call(this); return this.setTxtr(...args); }
   animate(callback) { this.frame = callback; }
}

async function setup(allResidents = false) {
   const state = JSON.parse(await readFile(new URL('../js/scenes/village.json', import.meta.url)));
   if (!allResidents) state.residents = state.residents.slice(0, 1);
   state.grid = { width: 20, depth: 20, cellSize: .075 };
   state.regions = [{ id: 'pond', kind: 'water', cell: [4, 4], size: 2 }];
   state.obstacles = [];
   state.residents[0].position = [1, 4];
   state.residents[0].path = [];
   const root = new Node(), asked = [], askedResidents = [], disposed = [], uploads = [];
   const canvas = { commands: [], getContext: () => drawing };
   const drawing = {
      fillRect(x, y, w, h) {
         if (x === 0 && y === 0) canvas.commands = [];
         canvas.commands.push(['rect', this.fillStyle, x, y, w, h]);
      },
      fillText(text) { canvas.commands.push(['text', text]); },
      measureText(text) { return { width: text.length * 20 }; },
   };
   let immersive = true;
   const context = createContext({ console, URL, isXR: () => immersive, handtracking: false,
      fetch: async () => ({ ok: true, json: async () => state }),
      document: { createElement: () => canvas },
      _canvas_txtr: [], txtrManager: { setTextureToChannel() {} },
      gl: { activeTexture() {}, bindTexture() {}, createTexture() { return {}; }, texParameteri() {},
         texImage2D(...args) { uploads.push(structuredClone(args.at(-1).commands)); } },
      clay: { inverseRootMatrix: cg.mIdentity(), views: [{}], root: () => root,
         pose: { transform: { matrix: cg.mTranslate(0, 1.6, 0) } } },
      clientState: { finger: () => [0, 1, 0], pinch: () => false, button: () => false },
      clientID: 0, clients: [],
   });
   context.window = context;
   root.textureMethods = runInContext('(function () { ' + textureMethods + ' })', context);
   const upload = runInContext('(txtr => { ' + uploadSource + ' })', context);
   const model = root.add();
   model.deltaTime = .016;
   model.time = 0;
   function exportsModule(values) {
      return new SyntheticModule(Object.keys(values), function () {
         for (const name in values) this.setExport(name, values[name]);
      }, { context });
   }
   const cgModule = exportsModule(cg);
   async function load(path, imports) {
      const url = new URL(path, import.meta.url);
      const module = new SourceTextModule(await readFile(url, 'utf8'), {
         context, identifier: url.href, initializeImportMeta(meta) { meta.url = url.href; },
      });
      await module.link(name => {
         assert.ok(imports[name], 'unexpected import: ' + name);
         return imports[name];
      });
      await module.evaluate();
      return module;
   }
   const controllers = await load('../js/render/core/controllerInput.js', {
      './cg.js': cgModule, '../../util/corelink_sender.js': exportsModule({ corelink_event() {} }),
   });
   const events = await load('../js/render/core/inputEvents.js', {
      './cg.js': cgModule, './controllerInput.js': controllers,
      '../../global.js': exportsModule({ gltfRoot: {} }),
      '/js/util/sync.js': exportsModule({ syncBound() {}, setOriginPos() {} }),
   });
   const input = context.inputEvents = new events.namespace.InputEvents();
   const previous = { onPress() {}, onDrag() {}, onRelease() {}, onClick() {}, onMove() {}, onDoublePress() {} };
   Object.assign(input, previous);
   const scene = await load('../js/scenes/village.js', {
      '../render/core/cg.js': cgModule, '../render/core/controllerInput.js': controllers,
      '../util/village.js': exportsModule({ ...village, stepWorld() {} }),
      '../util/villageAI.js': exportsModule({ createVillageAI: () => ({ tick() {}, dispose() { disposed.push('ai'); } }) }),
      '../util/pengerView.js': exportsModule({ createPenger: () => ({ update() {} }) }),
      '../util/villageUI.js': exportsModule({ questions, questionAt, paintDialogue, residentAt, speedAt,
         createVillageUI: () => ({ update() {}, ask(question) { asked.push(question); askedResidents.push(state.selectedResident); }, dispose() { disposed.push('ui'); } }) }),
   });
   const lifetime = {};
   await scene.namespace.init(model, {}, lifetime);
   const buttons = { left: Array.from({ length: 7 }, () => ({ pressed: false })),
      right: Array.from({ length: 7 }, () => ({ pressed: false })) };
   const avatar = { leftController: { matrix: cg.mIdentity() }, rightController: { matrix: cg.mIdentity() } };
   function aim(cell) {
      const { cellSize, width, depth } = state.grid;
      avatar.rightController.matrix = cg.mMultiply(cg.mTranslate(
         (cell[0] - (width - 1) / 2) * cellSize, 1.8,
         -1.5 + (cell[1] - (depth - 1) / 2) * cellSize + .02), cg.mRotateX(-Math.PI / 4));
   }
   function frame() {
      for (const hand of ['left', 'right'])
         controllers.namespace.updateController(avatar, { handedness: hand, buttons: buttons[hand], axes: [0, 0, 0, 0] });
      input.update();
      model.time += model.deltaTime;
      model.frame();
      for (const node of model.children)
         if (node._txtr >= 0 && node.alpha !== 0) upload(node._txtr);
   }
   const press = (down, hand = 'right', button = 0) => { buttons[hand][button].pressed = down; frame(); };
   const aimPanel = (px, py) => {
      const x = (px / 400 - 1) * .55, y = 1.72 + (1 - py / 190) * .26125;
      avatar.rightController.matrix = cg.mMultiply(cg.mTranslate(x, y - .02, -.1), cg.mRotateX(Math.PI / 4));
   };
   return { state, input, previous, asked, askedResidents, disposed, uploads, aim, aimPanel, frame, press,
      grip(down) { press(down, 'right', 1); },
      leaveXR() { immersive = false; },
      aimQuestion() {
         aimPanel(140, 331);
      },
      dispose() { scene.namespace.deinit(model, {}, lifetime); },
   };
}

test('right grip moves a region through real controller input and ray hits, including one-view XR', async () => {
   const s = await setup();
   s.aim([4.4, 4.4]); s.grip(true);
   s.aim([13.4, 1.4]); s.frame();
   assert.deepEqual([...s.state.regions[0].cell], [4, 4], 'hold only previews');
   s.grip(false);
   assert.deepEqual([...s.state.regions[0].cell], [13, 1]);
   assert.equal(s.state.events.filter(event => event.type === 'ObjectMoved').length, 1);
   assert.deepEqual(s.asked, []);
});

test('release reads the current controller pose even without an intervening drag frame', async () => {
   const s = await setup();
   s.aim([4, 4]); s.grip(true);
   s.aim([12, 2]); s.grip(false);
   assert.deepEqual([...s.state.regions[0].cell], [12, 2]);
});

test('invalid placement returns the region to its original cell', async () => {
   const s = await setup();
   s.aim([4, 4]); s.grip(true);
   s.aim([-2, 2]); s.grip(false);
   assert.deepEqual([...s.state.regions[0].cell], [4, 4]);
   assert.equal(s.state.mapRevision, 0);
});

test('dialogue trigger asks once across hold and release without dragging terrain', async () => {
   const s = await setup();
   s.aimQuestion(); s.press(true); s.frame(); s.press(false);
   assert.deepEqual(s.asked, [questions[0]]);
   assert.equal(s.state.mapRevision, 0);
});

test('VR button hover reaches the displayed texture after the initial frame', async () => {
   const s = await setup();
   s.aim([0, 0]); s.frame();
   const initialUploads = s.uploads.length;
   s.aimQuestion(); s.frame();
   assert.ok(s.uploads.length > initialUploads, 'hover must upload a new canvas frame');
   assert.ok(s.uploads.at(-1).some(command => command[0] === 'rect' && command[1] === '#497b57' && command[2] === 20 && command[3] === 300));
});

test('VR dialogue visibly updates from waiting to the received answer', async () => {
   const s = await setup();
   s.aimQuestion(); s.frame(); s.press(true);
   assert.deepEqual(s.asked, [questions[0]]);
   s.state.residents[0].ai.dialogue.status = 'waiting'; s.frame();
   const displayedText = () => s.uploads.at(-1).filter(command => command[0] === 'text').map(command => command[1]).join(' ');
   assert.ok(displayedText().includes('One moment… gathering my very important penguin thoughts.'));
   s.state.residents[0].ai.dialogue.status = 'idle';
   s.state.residents[0].ai.history.push({ role: 'assistant', content: "I'm a little thirsty." });
   s.frame();
   assert.ok(displayedText().includes("I'm a little thirsty."));
});

test('dialogue triggers cannot start a terrain drag', async () => {
   const s = await setup();
   for (const [hand, button] of [['left', 0], ['right', 0]]) {
      s.aim([4, 4]); s.press(true, hand, button);
      s.aim([13, 1]); s.press(false, hand, button);
   }
   assert.equal(s.state.mapRevision, 0);
   assert.deepEqual(s.asked, []);
});

test('exiting XR cancels an unfinished drag and ignores inline trigger input', async () => {
   const s = await setup();
   s.aim([4, 4]); s.grip(true);
   s.aim([13, 1]); s.frame(); s.leaveXR(); s.grip(false);
   s.aim([4, 4]); s.grip(true); s.aim([13, 1]); s.grip(false);
   assert.equal(s.state.mapRevision, 0);
});

test('scene disposal restores input callbacks without overwriting a newer scene handler', async () => {
   const s = await setup();
   const nextPress = () => {};
   s.input.onPress = nextPress;
   s.dispose();
   assert.equal(s.input.onPress, nextPress);
   for (const name of ['onDrag', 'onRelease', 'onClick', 'onMove', 'onDoublePress'])
      assert.equal(s.input[name], s.previous[name]);
   assert.deepEqual(s.disposed, ['ai', 'ui']);
});

test('VR trigger selects a resident and routes the next question to that resident', async () => {
   const s = await setup(true);
   s.aimPanel(392, 110); s.press(true); s.press(false);
   assert.equal(s.state.selectedResident, 'pip');
   assert.deepEqual(s.asked, []);
   s.aimQuestion(); s.press(true); s.press(false);
   assert.deepEqual(s.askedResidents, ['pip']);
   s.aimPanel(644, 110); s.press(true); s.press(false);
   assert.equal(s.state.selectedResident, 'mox');
});

test('VR speed control toggles once per trigger press without asking or moving a region', async () => {
   const s = await setup();
   s.aimPanel(710, 27); s.press(true); s.frame();
   assert.equal(s.state.speed, 3);
   s.press(false); s.press(true); s.press(false);
   assert.equal(s.state.speed, 1);
   assert.deepEqual(s.asked, []);
   assert.equal(s.state.mapRevision, 0);
});
