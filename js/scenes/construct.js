import * as cg from "../render/core/cg.js";
import { loadSound, playSoundAtPosition, playLoopingSoundAtPosition02, 
         stopLoopingSound02, updateSound02Position } from "../util/positional-audio.js";

// LOAD SOUND FILES

let createSoundBuffer = null;
let deleteSoundBuffer = null;
let dragSoundBuffer = null;

function preloadSounds() {
    Promise.all([
        loadSound('../../media/sound/SFXs/demoBalls/SFX_Ball_Create_Mono_01.wav', buffer => createSoundBuffer = buffer),
        loadSound('../../media/sound/SFXs/demoBalls/SFX_Ball_Delete_Mono_01.wav', buffer => deleteSoundBuffer = buffer),
        loadSound('../../media/sound/SFXs/demoBalls/SFX_Ball_Drag_Mono_LP_01.wav', buffer => dragSoundBuffer = buffer)

    ])
    .then(() => {
        //console.log('All sounds loaded successfully');
    })
    .catch(error => {
        //console.error('An error occurred while loading sounds:', error);
    });
}

preloadSounds();

server.init('balls', {});             // INITIALIZE GLOBAL STATE OBJECT.

const radius = 0.05;                  // ALL BALLS HAVE THE SAME RADIUS.

let ballID = { left: -1, right: -1 }; // WHICH BALL IS IN EACH HAND?

let findBall = hand => {              // FIND THE BALL LOCATED AT THE
   let dMin = 10000, idMin = -1;      // 'left' OR 'right' HAND, IF ANY.
   for (let id in balls) {
      let d = cg.distance(inputEvents.pos(hand), balls[id]);
      if (d < dMin) {
         dMin = d;
         idMin = id;
      }
   }
   return dMin < 2 * radius ? idMin : -1;
}

// FUNCTION TO CREATE A MESSAGE OBJECT.

let msg = (op, id, hand) => {
   return { op: op, id: id, pos: cg.roundVec(4, inputEvents.pos(hand)) };
}

export const init = async model => {

   // CONVERT A POSITION IN SHARED COMMON COORDINATES TO THIS XR HEADSET'S LOCAL COORDINATES

   let toHeadsetPos = pos => {
      let emptyObj = model.add().move(pos);
      let objMatrix = emptyObj.getGlobalMatrix();
      let newPos = objMatrix.slice(12,15);
      model.remove(emptyObj);
      return newPos;
   }

   inputEvents.onPress = hand => {
      ballID[hand] = findBall(hand);
      if (ballID[hand] >= 0)
         playLoopingSoundAtPosition02(dragSoundBuffer, toHeadsetPos(inputEvents.pos(hand)));
   }

   inputEvents.onDrag = hand => {
      if (ballID[hand] >= 0){
         server.send('balls', msg('move', ballID[hand], hand));
         updateSound02Position(cg.roundVec(4, toHeadsetPos(inputEvents.pos(hand))));
      }
   }

   inputEvents.onRelease = hand => {
      ballID[hand] = -1;
      stopLoopingSound02();
   }

   inputEvents.onClick = hand => {
       let id = findBall(hand);
       if (id >= 0)
           server.send('balls', msg('delete', id, hand));
       else {
           for (id = 0; balls[id] !== undefined ; id++)      // FIND AN UNUSED ID,
              ;
           server.send('balls', msg('create', id, hand))    // AND CREATE A NEW BALL.
       }
   }

   model.animate(() => {

      // RESPOND TO MESSAGES SENT FROM ALL CLIENTS.

      server.sync('balls', (msgs, msg_clientID) => {
         for (let id in msgs) {
            let msg = msgs[id];
            if (msg.op == 'delete') {
               if (balls[msg.id] != null && deleteSoundBuffer)
                  playSoundAtPosition(deleteSoundBuffer, toHeadsetPos(msg.pos));
               delete balls[msg.id];
            }
            else {
               if (balls[msg.id] == null && createSoundBuffer)
                  playSoundAtPosition(createSoundBuffer, toHeadsetPos(msg.pos));
               balls[msg.id] = msg.pos;
            }
         }
      });

      // RENDER THE 3D SCENE.

      while (model.nChildren() > 0)
         model.remove(0);
      for (let id in balls)
         model.add('sphere').move(balls[id]).scale(radius);
   });
}

