class PeerJSMockWS {
  constructor(isHost, roomId, password, nickname) {
     this.readyState = 1;
     this.onmessage = null;
     this.onclose = null;
  }
}
