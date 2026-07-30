import re

with open('src/js/studyRoom.js', 'r') as f:
    text = f.read()

# Replace connectWebSocket completely
new_ws_conn = """
  class PeerJSRoomHub {
    constructor() {
      this.readyState = WebSocket.CONNECTING;
      this.peers = new Map(); // client connections for data
      this.hostId = null;
      this.localPeerId = null;
      this.isServer = isHost;
      this.nextServerId = 1;
      this.serverClients = new Map(); // id -> { nickname, peerJsId }
      this.calls = [];
    }
    
    init(address) {
      return new Promise((resolve, reject) => {
        const pOpts = {
          config: {
            iceServers: [
              { urls: 'stun:stun.l.google.com:19302' },
              { urls: 'stun:global.stun.twilio.com:3478' }
            ]
          }
        };
        
        if (isHost) {
          const expectedHostId = 'qroom-' + internetRoomId.toLowerCase();
          console.log("Starting host PeerJS id:", expectedHostId);
          this.peer = new Peer(expectedHostId, pOpts);
          this.localPeerId = expectedHostId;
        } else {
          this.peer = new Peer(pOpts);
        }
        
        this.peer.on('open', (id) => {
          this.localPeerId = id;
          if (isHost) {
            this.readyState = WebSocket.OPEN;
            resolve();
          } else {
            console.log("Client connecting to host...", 'qroom-' + internetRoomId.toLowerCase());
            this.hostConn = this.peer.connect('qroom-' + internetRoomId.toLowerCase(), { reliable: true });
            this.hostConn.on('open', () => {
              this.readyState = WebSocket.OPEN;
              resolve();
            });
            this.hostConn.on('data', (raw) => {
               if(this.onmessage) this.onmessage({ data: String(raw) });
            });
            this.hostConn.on('error', (err) => {
               if(this.onerror) this.onerror(err);
               reject(err);
            });
          }
        });
        
        this.peer.on('connection', (conn) => {
          if (isHost) {
             conn.on('data', (raw) => {
                this.mockServerHandle(conn, JSON.parse(raw));
             });
             conn.on('close', () => {
                this.mockServerDisconnect(conn.peer);
             });
          } else {
             // client to client data?
          }
        });
        
        // Handle incoming screen-share calls without manual WebRTC SDP logic!
        this.peer.on('call', (call) => {
           call.answer(); // answer without mic/video for viewing only
           call.on('stream', (remoteStream) => {
              // Find who called by searching peerJsId in peers state
              let callerId = 'host';
              for(let id in peers) {
                 if (peers[id].peerJsId === call.peer) {
                    callerId = id; break;
                 }
              }
              if (call.peer === ('qroom-' + internetRoomId.toLowerCase())) callerId = 'host'; // or whoever is host internal ID
              // Wait, who is host relative to me? 
              // We'll just pass callerId to renderRemoteVideo
              renderRemoteVideo(call.peer, remoteStream); // we use their peerJsId as DOM id!
           });
        });
        
        this.peer.on('error', (err) => {
          console.error("PeerJS Error:", err);
          if (this.onerror) this.onerror(err);
          reject(err);
        });
      });
    }
    
    send(str) {
      if (!isHost) {
         if (this.hostConn && this.hostConn.open) {
             const obj = JSON.parse(str);
             obj._clientPeerId = this.localPeerId;
             this.hostConn.send(JSON.stringify(obj));
         }
         return;
      }
      const msg = JSON.parse(str);
      const hostConnMock = { peer: 'host-self' };
      msg._clientPeerId = this.localPeerId;
      this.mockServerHandle(hostConnMock, msg);
    }
    
    close() {
      if (this.peer) this.peer.destroy();
      this.readyState = WebSocket.CLOSED;
      if(this.onclose) this.onclose();
    }
    
    // ----------- HOST RELAY -----------
    mockServerHandle(conn, msg) {
       const sendToClient = (peerId, obj) => {
          if (peerId === 'host-self') {
             if(this.onmessage) this.onmessage({ data: JSON.stringify(obj) });
             return;
          }
          if (this.peers.has(peerId)) this.peers.get(peerId).send(JSON.stringify(obj));
       };
       const broadcast = (obj, excludePeerId) => {
          const strMsg = JSON.stringify(obj);
          for (const [pId, pConn] of this.peers.entries()) {
             if (pId !== excludePeerId) pConn.send(strMsg);
          }
          if (excludePeerId !== 'host-self') {
             if(this.onmessage) this.onmessage({ data: strMsg });
          }
       };
       
       switch(msg.action) {
          case 'host':
             const hId = "usr_" + this.nextServerId++;
             this.serverClients.set('host-self', { id: hId, nickname: msg.nickname, peerJsId: this.localPeerId });
             sendToClient('host-self', { action: 'welcome', id: hId });
             sendToClient('host-self', { action: 'hosted' });
             break;
          case 'join':
             if (this.password && msg.password !== this.password) {
                 conn.send(JSON.stringify({ action: 'auth-fail', reason: 'Incorrect password.' }));
                 //conn.close();
                 return;
             }
             this.peers.set(conn.peer, conn);
             const clId = "usr_" + this.nextServerId++;
             const cPjId = msg._clientPeerId;
             this.serverClients.set(conn.peer, { id: clId, nickname: msg.nickname, peerJsId: cPjId });
             sendToClient(conn.peer, { action: 'welcome', id: clId });
             // list peers
             const peerList = Array.from(this.serverClients.values()).filter(c => c.id !== clId);
             sendToClient(conn.peer, { action: 'joined', peers: peerList });
             broadcast({ action: 'peer-joined', id: clId, nickname: msg.nickname, peerJsId: cPjId }, conn.peer);
             break;
          case 'relay':
             const snd = this.serverClients.get(conn.peer);
             if(snd) broadcast({ action: 'relay', from: snd.id, data: msg.data }, conn.peer);
             break;
          case 'dm':
             const dSnd = this.serverClients.get(conn.peer);
             if(dSnd) {
                let tPeer = null;
                for (const [pId, cl] of this.serverClients.entries()) {
                   if (cl.id === msg.to) { tPeer = pId; break; }
                }
                if (tPeer) sendToClient(tPeer, { action: 'dm', from: dSnd.id, data: msg.data });
             }
             break;
       }
    }
    
    mockServerDisconnect(peerId) {
       this.peers.delete(peerId);
       const cl = this.serverClients.get(peerId);
       if (cl) {
          this.serverClients.delete(peerId);
          const strMsg = JSON.stringify({ action: 'peer-left', id: cl.id });
          for (const pc of this.peers.values()) pc.send(strMsg);
          if (this.onmessage) this.onmessage({ data: strMsg });
       }
    }
  }

  function connectWebSocket(address) {
    ws = new PeerJSRoomHub();
    ws.onopen = () => {};
    ws.onclose = () => handleDisconnect();
    ws.onerror = () => {};
    ws.onmessage = (event) => {
        try { handleServerMessage(JSON.parse(event.data)); }
        catch(e) {}
    };
    return ws.init(address);
  }
"""

text = re.sub(r'  function connectWebSocket\(address\)\s*\{.*?(?=  function sendToServer)', new_ws_conn, text, flags=re.DOTALL)

# Handle the case where we connect local video
start_share_regex = r"""localScreenStream = await navigator\.mediaDevices\.getDisplayMedia\(\{ video: true \}\);"""
replacement_share = """localScreenStream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: { ideal: 30 } } });"""
text = text.replace("localScreenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });", replacement_share)

create_rtc_regex = r"""  function createRTCPeerConnection.*?\}\n\s*\}\n"""
replacement_rtc_func = """
  function createRTCPeerConnection(targetId, isOffer) {
    if (!ws || !ws.peer || !localScreenStream) return;
    const destPeerJsId = (peers[targetId] && peers[targetId].peerJsId) ? peers[targetId].peerJsId : ('qroom-' + internetRoomId.toLowerCase());
    
    // Call them directly via PeerJS to avoid GStreamer Linux crashes with manual WebRTC SDPs
    const call = ws.peer.call(destPeerJsId, localScreenStream);
    ws.calls.push(call);
    
    // Fallback: If someone else calls us, we already bound ws.peer.on('call') in connectWebSocket.
  }
"""
text = re.sub(r'  function createRTCPeerConnection[\s\S]+?(?=  async function handleRTCReceiveOffer)', replacement_rtc_func, text)

# Wipe out the manual RTC handlers! They are not needed if PeerJS manages them.
text = re.sub(r'  async function handleRTCReceiveOffer[\s\S]+?(?=  function renderLocalVideo)', '', text)

# Make sure peerJsId is set properly when receiving `joined` and `peer-joined`
join_replace = """case 'joined':
        if (Array.isArray(msg.peers)) {
          msg.peers.forEach(p => {
            peers[p.id] = { nickname: p.nickname, goal: '', seconds: 0, peerJsId: p.peerJsId };
          });
        }"""
text = text.replace("case 'joined':\n        if (Array.isArray(msg.peers)) {\n          msg.peers.forEach(p => {\n            peers[p.id] = { nickname: p.nickname, goal: '', seconds: 0 };\n          });\n        }", join_replace)

peer_join_replace = """case 'peer-joined':
        peers[msg.id] = { nickname: msg.nickname, goal: '', seconds: 0, peerJsId: msg.peerJsId };"""
text = text.replace("case 'peer-joined':\n        peers[msg.id] = { nickname: msg.nickname, goal: '', seconds: 0 };", peer_join_replace)


with open('src/js/studyRoom.js', 'w') as f:
    f.write(text)

