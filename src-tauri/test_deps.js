const fs = require('fs');
const toml = fs.readFileSync('src-tauri/Cargo.toml', 'utf8');
if (!toml.includes('webkit2gtk')) {
    fs.writeFileSync('src-tauri/Cargo.toml', toml + `
[target.'cfg(any(target_os = "linux", target_os = "dragonfly", target_os = "freebsd", target_os = "netbsd", target_os = "openbsd"))'.dependencies]
webkit2gtk = { version = "2.0.1", features = ["v2_4"] }
`);
}
