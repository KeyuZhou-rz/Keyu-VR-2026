// Event bus for the boss fight.
//
//    const net = createBossNet();
//    net.on('orb', ev => ...);     // ev = { type, from, ...payload }
//    net.emit('orb', { x, z });    // goes to every client, INCLUDING this one
//    net.poll();                   // call once per frame
//
// Online, every event is broadcast as its own element of a shared inbox object
// (server.broadcastObject({ global, element, value })). The receiving client's
// socket handler ADDS that element to window[INBOX] instead of replacing a whole
// batch, so nothing is lost when two messages arrive between two frames.
// (server.send/server.sync replace the whole batch on arrival, which silently
// dropped hits whenever the two headsets ran at different frame rates.)
// Our own events are queued locally and dispatched on the next poll().
//
// Event types (see docs/boss.md):
//    role, pose, blade, orb, shot, hitBoss, state, reset

const INBOX = 'bossEventsInbox';

export const createBossNet = () => {
   const handlers = {};
   const local = [];
   const me = Math.random().toString(36).slice(2, 8);     // unique per page, keys never collide
   let seq = 0;
   window[INBOX] = {};                                    // drop anything left from an earlier load

   // Online only when another client is connected; alone, events stay on this page (solo mode).
   const online = () =>
      typeof server !== 'undefined' && typeof window.clients !== 'undefined' && window.clients.length > 1;

   const dispatch = ev => {
      for (const h of handlers[ev.type] || []) h(ev);
   };

   return {
      isOnline: online,

      on(type, handler) {
         (handlers[type] = handlers[type] || []).push(handler);
      },

      emit(type, payload = {}) {
         const ev = { ...payload, type, from: window.clientID };
         local.push(ev);                                    // this client sees its own events too
         if (online())                                      // non-integer key keeps arrival order
            server.broadcastObject({ global: INBOX, element: `${me}_${seq++}`, value: ev });
      },

      poll() {
         const inbox = window[INBOX];
         if (inbox && typeof inbox === 'object') {
            const keys = Object.keys(inbox);
            for (const k of keys) {
               const ev = inbox[k];
               delete inbox[k];
               if (ev && ev.type) dispatch(ev);
            }
         } else window[INBOX] = {};
         while (local.length) dispatch(local.shift());
      },
   };
};

// Role from the URL (?role=giant or ?role=mini, handy for two tabs on one machine), or null
// when the player should choose in the scene's role menu.
export const roleFromURL = () => {
   const param = new URLSearchParams(window.location.search).get('role');
   return param === 'giant' || param === 'mini' ? param : null;
};
