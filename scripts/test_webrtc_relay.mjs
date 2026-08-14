import assert from 'node:assert';
import fs from 'node:fs';

// 1. Simulate environment without native RTCPeerConnection (like WebKitGTK / restricted WebView)
globalThis.window = globalThis;
delete globalThis.RTCPeerConnection;
delete globalThis.RTCSessionDescription;
delete globalThis.RTCIceCandidate;

// Execute the WebRTC polyfill from index.html / peerjs-patched.js
eval(fs.readFileSync('/home/Nugget/Questionary/src/js/peerjs-patched.js', 'utf8'));

assert.ok(globalThis.Peer, 'Peer constructor should be exposed');
assert.ok(globalThis.RTCPeerConnection, 'RTCPeerConnection should be safely polyfilled');
assert.ok(globalThis.RTCSessionDescription, 'RTCSessionDescription should be safely polyfilled');
assert.ok(globalThis.RTCIceCandidate, 'RTCIceCandidate should be safely polyfilled');

console.log('✓ Polyfills initialized without ReferenceError in WebRTC-free environment');

// 2. Test Dual-Transport Relay Handshake Simulation
class MockWebSocket {
  constructor(url) {
    this.url = url;
    this.readyState = 1;
    this.sent = [];
    setTimeout(() => {
      if (this.onopen) this.onopen();
    }, 5);
  }
  send(data) {
    this.sent.push(typeof data === 'string' ? JSON.parse(data) : data);
  }
  close() {
    this.readyState = 3;
    if (this.onclose) this.onclose();
  }
}

globalThis.WebSocket = MockWebSocket;

const hostPeer = new Peer('qroom-testroom1', { config: {} });
const guestPeer = new Peer('guest_peer_123', { config: {} });

// Simulate server open messages
hostPeer._handleMessage({ type: 'OPEN', payload: 'qroom-testroom1' });
guestPeer._handleMessage({ type: 'OPEN', payload: 'guest_peer_123' });

assert.strictEqual(hostPeer.id, 'qroom-testroom1');
assert.strictEqual(guestPeer.id, 'guest_peer_123');

// Test relay transmission
let guestReceived = [];
guestPeer.on('relay-data', (data, src) => {
  guestReceived.push({ data, src });
});

let hostReceived = [];
hostPeer.on('relay-data', (data, src) => {
  hostReceived.push({ data, src });
});

// Guest sends join to host via relay
guestPeer.sendRelay('qroom-testroom1', { _mid: 'j1', action: 'join', nickname: 'Bob' });
const guestSentRelay = guestPeer.socket._socket.sent.find(m => m.payload?.data?.action === 'join');
assert.ok(guestSentRelay, 'Guest should have sent join relay packet');
assert.strictEqual(guestSentRelay.dst, 'qroom-testroom1');

// Host receives the packet forwarded by signaling server
hostPeer._handleMessage({
  type: 'CANDIDATE',
  src: 'guest_peer_123',
  payload: { isRelay: true, data: guestSentRelay.payload.data }
});

assert.strictEqual(hostReceived.length, 1);
assert.strictEqual(hostReceived[0].data.action, 'join');
assert.strictEqual(hostReceived[0].data.nickname, 'Bob');

// Host sends welcome & joined back
hostPeer.sendRelay('guest_peer_123', { _mid: 'w1', action: 'welcome', id: 'usr_1' });
hostPeer.sendRelay('guest_peer_123', { _mid: 'j2', action: 'joined', peers: [{ id: 'usr_host', nickname: 'Alice' }] });

const hostWelcomeRelay = hostPeer.socket._socket.sent.find(m => m.payload?.data?.action === 'welcome');
const hostJoinedRelay = hostPeer.socket._socket.sent.find(m => m.payload?.data?.action === 'joined');

assert.ok(hostWelcomeRelay, 'Host should have sent welcome packet');
assert.ok(hostJoinedRelay, 'Host should have sent joined packet');

// Guest receives them
guestPeer._handleMessage({
  type: 'CANDIDATE',
  src: 'qroom-testroom1',
  payload: { isRelay: true, data: hostWelcomeRelay.payload.data }
});
guestPeer._handleMessage({
  type: 'CANDIDATE',
  src: 'qroom-testroom1',
  payload: { isRelay: true, data: hostJoinedRelay.payload.data }
});

assert.strictEqual(guestReceived.length, 2);
assert.strictEqual(guestReceived[0].data.action, 'welcome');
assert.strictEqual(guestReceived[0].data.id, 'usr_1');
assert.strictEqual(guestReceived[1].data.action, 'joined');
assert.strictEqual(guestReceived[1].data.peers[0].nickname, 'Alice');

console.log('✓ Dual-Transport Relay handshake simulation fully verified!');
