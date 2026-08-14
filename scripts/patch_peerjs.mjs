import fs from 'node:fs';

const filePath = '/home/Nugget/Questionary/src/js/peerjs-patched.js';
let content = fs.readFileSync(filePath, 'utf8');

const polyfill = `// WebRTC Polyfills and WebKit shims
if (typeof window !== 'undefined') {
    window.RTCPeerConnection = window.RTCPeerConnection || window.webkitRTCPeerConnection || window.mozRTCPeerConnection;
    window.RTCSessionDescription = window.RTCSessionDescription || window.webkitRTCSessionDescription || window.mozRTCSessionDescription;
    window.RTCIceCandidate = window.RTCIceCandidate || window.webkitRTCIceCandidate || window.mozRTCIceCandidate;
    window.MediaStream = window.MediaStream || window.webkitMediaStream;
    window.AudioContext = window.AudioContext || window.webkitAudioContext;
}
var RTCPeerConnection = (typeof window !== 'undefined' && window.RTCPeerConnection) || (typeof globalThis !== 'undefined' && globalThis.RTCPeerConnection);
var RTCSessionDescription = (typeof window !== 'undefined' && window.RTCSessionDescription) || (typeof globalThis !== 'undefined' && globalThis.RTCSessionDescription);
var RTCIceCandidate = (typeof window !== 'undefined' && window.RTCIceCandidate) || (typeof globalThis !== 'undefined' && globalThis.RTCIceCandidate);
var MediaStream = (typeof window !== 'undefined' && window.MediaStream) || (typeof globalThis !== 'undefined' && globalThis.MediaStream);

if (!RTCPeerConnection) {
    class DummyRTCPeerConnection extends (typeof EventTarget !== 'undefined' ? EventTarget : Object) {
        constructor(config) {
            super();
            this.config = config;
            this.signalingState = 'stable';
            this.iceConnectionState = 'new';
            this.connectionState = 'new';
            this.iceGatheringState = 'complete';
            this.localDescription = null;
            this.remoteDescription = null;
        }
        createOffer() { return Promise.resolve({ type: 'offer', sdp: '' }); }
        createAnswer() { return Promise.resolve({ type: 'answer', sdp: '' }); }
        setLocalDescription(desc) { this.localDescription = desc; return Promise.resolve(); }
        setRemoteDescription(desc) { this.remoteDescription = desc; return Promise.resolve(); }
        addIceCandidate() { return Promise.resolve(); }
        createDataChannel(label) {
            return {
                label,
                readyState: 'connecting',
                send: () => {},
                close: () => {},
                addEventListener: () => {},
                removeEventListener: () => {}
            };
        }
        addTrack() {}
        removeTrack() {}
        getSenders() { return []; }
        getReceivers() { return []; }
        getTransceivers() { return []; }
        close() { this.signalingState = 'closed'; this.connectionState = 'closed'; }
        getStats() { return Promise.resolve(new Map()); }
    }
    RTCPeerConnection = DummyRTCPeerConnection;
    if (typeof window !== 'undefined') window.RTCPeerConnection = DummyRTCPeerConnection;
}
if (!RTCSessionDescription) {
    RTCSessionDescription = function(d) { return d || { type: 'offer', sdp: '' }; };
    if (typeof window !== 'undefined') window.RTCSessionDescription = RTCSessionDescription;
}
if (!RTCIceCandidate) {
    RTCIceCandidate = function(c) { return c || {}; };
    if (typeof window !== 'undefined') window.RTCIceCandidate = RTCIceCandidate;
}
`;

if (!content.includes('DummyRTCPeerConnection')) {
    content = polyfill + '\n' + content;
}

// Patch _handleMessage to handle relay messages
const handleMsgTarget = '_handleMessage(e){let t=e.type,n=e.payload,r=e.src;switch(t){';
const handleMsgRepl = '_handleMessage(e){let t=e.type,n=e.payload,r=e.src;if(n&&n.isRelay){this.emit("relay-data",n.data,r);return}switch(t){';
if (content.includes(handleMsgTarget)) {
    content = content.replace(handleMsgTarget, handleMsgRepl);
}

// Patch sendRelay onto Peer prototype
const defaultKeyTarget = 'e1.DEFAULT_KEY="peerjs"';
const defaultKeyRepl = 'e1.prototype.sendRelay=function(e,t){return!(!this.socket||!this.socket._wsOpen())&&(this.socket.send({type:O.Candidate,payload:{isRelay:!0,data:t},dst:e}),!0)};e1.DEFAULT_KEY="peerjs"';
if (content.includes(defaultKeyTarget) && !content.includes('sendRelay')) {
    content = content.replace(defaultKeyTarget, defaultKeyRepl);
}

fs.writeFileSync(filePath, content, 'utf8');
console.log('Successfully patched peerjs-patched.js');
