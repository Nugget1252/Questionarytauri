const fs = require('fs');
let code = fs.readFileSync('src/js/studyRoom.js', 'utf8');

const oldWScode = `  /** Connect to a WebSocket server.
   *  @param {string} address  — either "ip:port" (LAN) or full "wss://..." URL (Internet) */
  function connectWebSocket(address) {
    return new Promise((resolve, reject) => {
      try {
        const url = /^wss?:\\/\\//i.test(address) ? address : \\`ws://\\${address}\\`;
        ws = new WebSocket(url);
      } catch (e) {
        return reject(new Error('Invalid address'));
      }
      const timeout = setTimeout(() => {
        reject(new Error('Connection timed out'));
        try { ws.close(); } catch (_) {}
      }, 8000);

      ws.onopen = () => { clearTimeout(timeout); resolve(); };
      ws.onerror = () => { clearTimeout(timeout); reject(new Error('WebSocket connection failed')); };
      ws.onclose = () => { clearTimeout(timeout); handleDisconnect(); };
      ws.onmessage = (event) => {
        try { handleServerMessage(JSON.parse(event.data)); }
        catch (e) { console.warn('[StudyRoom] bad frame', e); }
      };
    });
  }`;

// wait, the old WScode has backticks and slashes, which NodeJS might choke on if string matched simply.
// Lets use index
const startIndex = code.indexOf(`  /** Connect to a WebSocket`);
const endIndex = code.indexOf(`  function sendToServer(obj) {`);
if(startIndex !== -1 && endIndex !== -1) {
   let newCode = code.slice(0, startIndex);
   newCode += fs.readFileSync('peerJS_impl.js', 'utf8');
   newCode += "\n" + code.slice(endIndex);
   fs.writeFileSync('src/js/studyRoom.js', newCode);
   console.log("Success patch");
} else {
   console.log("Could not find index");
}
