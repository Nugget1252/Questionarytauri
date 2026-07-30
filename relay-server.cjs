const { WebSocketServer } = require('ws');
const http = require('http');

// Simple Study Room relay server
const PORT = process.env.PORT || 8080;

const server = http.createServer((req, res) => {
  res.writeHead(200);
  res.end('Study Room Relay Server is running.');
});

const wss = new WebSocketServer({ server });

const rooms = new Map(); // roomId -> { hostId, password, peers: Map<id, ws> }
let nextClientId = 1;

wss.on('connection', (ws) => {
  const clientId = `guest-${nextClientId++}`;
  let currentRoom = null;
  let nickname = 'Anonymous';

  ws.send(JSON.stringify({ action: 'welcome', id: clientId }));

  ws.on('message', (message) => {
    try {
      const msg = JSON.parse(message);

      if (msg.action === 'host') {
        const roomId = msg.room || '_local';
        const password = msg.password || '';
        nickname = msg.nickname || 'Host';

        if (rooms.has(roomId)) {
          ws.send(JSON.stringify({ action: 'auth-fail', reason: 'Room already exists.' }));
          return;
        }

        currentRoom = roomId;
        const peers = new Map();
        peers.set(clientId, { ws, nickname });

        rooms.set(roomId, {
          hostId: clientId,
          password,
          peers
        });

        ws.send(JSON.stringify({ action: 'hosted', room: roomId }));
        console.log(`[JOIN] ${nickname} created room ${roomId}`);
      }
      else if (msg.action === 'join') {
        const roomId = msg.room || '_local';
        const password = msg.password || '';
        nickname = msg.nickname || 'Student';

        const room = rooms.get(roomId);
        if (!room) {
          ws.send(JSON.stringify({ action: 'auth-fail', reason: 'Room not found.' }));
          return;
        }

        if (room.password && room.password !== password) {
          ws.send(JSON.stringify({ action: 'auth-fail', reason: 'Incorrect password.' }));
          return;
        }

        currentRoom = roomId;
        const peersList = [];
        for (const [id, peer] of room.peers.entries()) {
          peersList.push({ id, nickname: peer.nickname });
          peer.ws.send(JSON.stringify({
            action: 'peer-joined',
            id: clientId,
            nickname
          }));
        }

        room.peers.set(clientId, { ws, nickname });

        ws.send(JSON.stringify({
          action: 'joined',
          room: roomId,
          peers: peersList
        }));
        console.log(`[JOIN] ${nickname} joined room ${roomId}`);
      }
      else if (msg.action === 'relay') {
        if (!currentRoom) return;
        const room = rooms.get(currentRoom);
        if (room) {
          for (const [id, peer] of room.peers.entries()) {
            if (id !== clientId) {
              peer.ws.send(JSON.stringify({
                action: 'relay',
                from: clientId,
                data: msg.data
              }));
            }
          }
        }
      }
      else if (msg.action === 'relay-to') {
        if (!currentRoom || !msg.to) return;
        const room = rooms.get(currentRoom);
        if (room) {
          const target = room.peers.get(msg.to);
          if (target) {
            target.ws.send(JSON.stringify({
              action: 'relay',
              from: clientId,
              data: msg.data
            }));
          }
        }
      }
    } catch (e) {
      console.error('Invalid message format', e);
    }
  });

  ws.on('close', () => {
    if (currentRoom) {
      const room = rooms.get(currentRoom);
      if (room) {
        room.peers.delete(clientId);
        console.log(`[LEAVE] ${nickname} left room ${currentRoom}`);

        if (room.hostId === clientId) {
          console.log(`[CLOSE] Host left, closing room ${currentRoom}`);
          for (const peer of room.peers.values()) {
            peer.ws.send(JSON.stringify({ action: 'room-closed' }));
            peer.ws.close();
          }
          rooms.delete(currentRoom);
        } else {
          for (const peer of room.peers.values()) {
            peer.ws.send(JSON.stringify({
              action: 'peer-left',
              id: clientId
            }));
          }
          if (room.peers.size === 0) {
            rooms.delete(currentRoom);
          }
        }
      }
    }
  });
});

server.listen(PORT, () => {
  console.log(`📡 Study Room Relay Server running on ws://localhost:${PORT}`);
  console.log(`Run this in a separate terminal to test the app locally.`);
});