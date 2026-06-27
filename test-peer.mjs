const fs = require('fs');
fetch('https://unpkg.com/peerjs@1.5.2/dist/peerjs.min.js')
  .then(res => res.text())
  .then(text => {
     let i = text.indexOf('does not support WebRTC');
     console.log(text.substring(i - 200, i + 200));
  });
