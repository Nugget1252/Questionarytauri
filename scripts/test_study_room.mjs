import assert from 'node:assert';

// Test 1: normalizeRoomCode & generateRoomId
const ROOM_CODE_LENGTH = 10;
const ROOM_CODE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

function generateRoomId() {
  let id = '';
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
    id += ROOM_CODE_CHARS[Math.floor(Math.random() * ROOM_CODE_CHARS.length)];
  }
  return id;
}

function normalizeRoomCode(raw) {
  if (!raw) return '';
  const code = raw.toUpperCase().trim().replace(/[^A-Z0-9]/g, '');
  return (code.length >= 4 && code.length <= 32) ? code : '';
}

const testCode = generateRoomId();
assert.strictEqual(testCode.length, 10);
assert.strictEqual(normalizeRoomCode('  abc-123_xyz  '), 'ABC123XYZ');
assert.strictEqual(normalizeRoomCode('A1B2C3D4E5'), 'A1B2C3D4E5');
assert.strictEqual(normalizeRoomCode('123'), ''); // Too short (< 4)
assert.strictEqual(normalizeRoomCode('abcd'), 'ABCD'); // Allowed short room code

console.log('✓ Room ID generation and normalization tests passed.');

// Test 2: Host / Guest State Machine Simulation
class MockConnection {
  constructor(peer) {
    this.peer = peer;
    this.open = true;
    this.sent = [];
  }
  send(data) {
    this.sent.push(data);
  }
}

class MockHostHub {
  constructor() {
    this.connections = new Map();
    this.peerJsToUser = new Map();
    this.userToPeerJs = new Map();
    this.nextUserNum = 1;
    this.peers = {};
    this.roomLocked = false;
    this.roomPassword = '';
    this.nickname = 'Alice';
  }

  handleIncoming(senderConn, msg) {
    const senderPeerJsId = senderConn.peer;

    if (msg.action === 'join') {
      if (this.roomLocked) {
        senderConn.send({ action: 'auth-fail', reason: 'Room is locked by host.' });
        return;
      }
      if (this.roomPassword && msg.password !== this.roomPassword) {
        senderConn.send({ action: 'auth-fail', reason: 'Incorrect room password.' });
        return;
      }

      let newUserId = this.peerJsToUser.get(senderPeerJsId);
      const isNewUser = !newUserId;
      if (isNewUser) {
        newUserId = 'usr_' + (this.nextUserNum++);
        this.peerJsToUser.set(senderPeerJsId, newUserId);
        this.userToPeerJs.set(newUserId, senderPeerJsId);
      }

      const currentPeersList = [];
      for (const [uId, pId] of this.userToPeerJs.entries()) {
        if (uId !== newUserId) {
          const nick = uId === 'usr_host' ? this.nickname : (this.peers[uId]?.nickname || 'Student');
          currentPeersList.push({ id: uId, nickname: nick, peerJsId: pId });
        }
      }

      senderConn.send({ action: 'welcome', id: newUserId });
      senderConn.send({ action: 'joined', peers: currentPeersList, locked: this.roomLocked });

      if (isNewUser) {
        const joinNotice = { action: 'peer-joined', id: newUserId, nickname: msg.nickname, peerJsId: senderPeerJsId };
        this.broadcastToAll(joinNotice, newUserId);
      }
    }
  }

  broadcastToAll(msg, excludeUserId) {
    for (const [pId, conn] of this.connections.entries()) {
      const uId = this.peerJsToUser.get(pId);
      if (uId !== excludeUserId && conn.open) {
        conn.send(msg);
      }
    }
  }
}

const host = new MockHostHub();
host.peerJsToUser.set('qroom-a1b2c3d4e5', 'usr_host');
host.userToPeerJs.set('usr_host', 'qroom-a1b2c3d4e5');

// Guest Bob connects
const bobConn = new MockConnection('peer_bob_123');
host.connections.set('peer_bob_123', bobConn);
host.handleIncoming(bobConn, { action: 'join', nickname: 'Bob', password: '' });

assert.strictEqual(bobConn.sent.length, 2);
assert.deepStrictEqual(bobConn.sent[0], { action: 'welcome', id: 'usr_1' });
assert.deepStrictEqual(bobConn.sent[1], {
  action: 'joined',
  peers: [{ id: 'usr_host', nickname: 'Alice', peerJsId: 'qroom-a1b2c3d4e5' }],
  locked: false
});

// Guest Charlie connects
const charlieConn = new MockConnection('peer_charlie_456');
host.connections.set('peer_charlie_456', charlieConn);
host.peers['usr_1'] = { nickname: 'Bob' };
host.handleIncoming(charlieConn, { action: 'join', nickname: 'Charlie', password: '' });

// Bob should have received peer-joined for Charlie
assert.strictEqual(bobConn.sent.length, 3);
assert.deepStrictEqual(bobConn.sent[2], {
  action: 'peer-joined',
  id: 'usr_2',
  nickname: 'Charlie',
  peerJsId: 'peer_charlie_456'
});

// Charlie should have received list containing both Alice (host) and Bob
assert.deepStrictEqual(charlieConn.sent[1].peers, [
  { id: 'usr_host', nickname: 'Alice', peerJsId: 'qroom-a1b2c3d4e5' },
  { id: 'usr_1', nickname: 'Bob', peerJsId: 'peer_bob_123' }
]);

console.log('✓ Host-Guest multi-peer handshake and relay simulation passed.');
console.log('All tests passed successfully!');
