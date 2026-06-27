/*  WebSocket relay server for Study Room
 *  ────────────────────────────────────────────────────────────
 *  Supports TWO modes:
 *    1) LOCAL (single-room) — started by the host machine, one room.
 *    2) PUBLIC (multi-room) — deployed on a server, many named rooms.
 *
 *  Protocol (JSON text frames):
 *
 *  Client → Server
 *    { "action": "host",     "nickname": "...", "password": "...", "room": "..." }
 *    { "action": "join",     "nickname": "...", "password": "...", "room": "..." }
 *    { "action": "relay",    "data": { … } }          // broadcast within room
 *    { "action": "relay-to", "to": "<id>", "data": { … } }  // DM
 *
 *    If "room" is omitted, the server uses a default single room ("_local").
 *
 *  Server → Client
 *    { "action": "welcome",      "id": "<client-id>" }
 *    { "action": "hosted",       "room": "..." }
 *    { "action": "joined",       "peers": [ … ], "room": "..." }
 *    { "action": "auth-fail",    "reason": "..." }
 *    { "action": "peer-joined",  "id": "...", "nickname": "..." }
 *    { "action": "peer-left",    "id": "..." }
 *    { "action": "room-closed" }
 *    { "action": "relay",        "from": "<id>", "data": { … } }
 */

use std::collections::HashMap;
use std::net::UdpSocket;
use std::sync::Arc;

use futures_util::{SinkExt, StreamExt};
use serde_json::{json, Value};
use tokio::net::TcpListener;
use tokio::sync::{mpsc, oneshot, RwLock};
use tokio_tungstenite::tungstenite::Message;

// ── types ────────────────────────────────────────────────────

const DEFAULT_ROOM: &str = "_local";

#[derive(Clone)]
struct ClientInfo {
    nickname: String,
    tx: mpsc::UnboundedSender<String>,
}

struct RoomState {
    host_id: Option<String>,
    password: String,
    clients: HashMap<String, ClientInfo>,
}

struct ServerState {
    rooms: HashMap<String, RoomState>,
    client_rooms: HashMap<String, String>,  // client_id → room_id
    next_id: u32,
}

/// Handle returned to the Tauri command layer so the server can be
/// stopped later.
pub struct WsServer {
    shutdown: Option<oneshot::Sender<()>>,
    port: u16,
}

impl WsServer {
    /// Start the relay server on a random available port.
    pub async fn start(password: String) -> Result<Self, String> {
        let listener = TcpListener::bind("0.0.0.0:0")
            .await
            .map_err(|e| format!("bind failed: {e}"))?;

        let port = listener
            .local_addr()
            .map_err(|e| format!("local_addr: {e}"))?
            .port();

        let state = Arc::new(RwLock::new(ServerState {
            rooms: HashMap::new(),
            client_rooms: HashMap::new(),
            next_id: 1,
        }));

        // Pre-create the default local room with the password
        {
            let mut s = state.write().await;
            s.rooms.insert(DEFAULT_ROOM.to_string(), RoomState {
                host_id: None,
                password,
                clients: HashMap::new(),
            });
        }

        let (shutdown_tx, shutdown_rx) = oneshot::channel();
        tokio::spawn(run_server(listener, state, shutdown_rx));

        Ok(WsServer {
            shutdown: Some(shutdown_tx),
            port,
        })
    }

    pub fn port(&self) -> u16 {
        self.port
    }

    pub fn stop(&mut self) {
        if let Some(tx) = self.shutdown.take() {
            let _ = tx.send(());
        }
    }
}

// ── server loop ──────────────────────────────────────────────

async fn run_server(
    listener: TcpListener,
    state: Arc<RwLock<ServerState>>,
    mut shutdown: oneshot::Receiver<()>,
) {
    loop {
        tokio::select! {
            result = listener.accept() => {
                if let Ok((stream, _addr)) = result {
                    let st = state.clone();
                    tokio::spawn(handle_connection(stream, st));
                }
            }
            _ = &mut shutdown => {
                // Notify every client in every room
                let server = state.read().await;
                let msg = json!({ "action": "room-closed" }).to_string();
                for room in server.rooms.values() {
                    for c in room.clients.values() {
                        let _ = c.tx.send(msg.clone());
                    }
                }
                break;
            }
        }
    }
}

// ── per-connection handler ───────────────────────────────────

async fn handle_connection(
    stream: tokio::net::TcpStream,
    state: Arc<RwLock<ServerState>>,
) {
    let ws = match tokio_tungstenite::accept_async(stream).await {
        Ok(ws) => ws,
        Err(_) => return,
    };

    let (mut ws_write, mut ws_read) = ws.split();
    let (tx, mut rx) = mpsc::unbounded_channel::<String>();

    // Assign a client id
    let client_id = {
        let mut server = state.write().await;
        let id = format!("c{}", server.next_id);
        server.next_id += 1;
        id
    };

    // Send "welcome"
    let welcome = json!({ "action": "welcome", "id": &client_id }).to_string();
    if ws_write.send(Message::Text(welcome.into())).await.is_err() {
        return;
    }

    // Writer task
    let writer = tokio::spawn(async move {
        while let Some(msg) = rx.recv().await {
            if ws_write.send(Message::Text(msg.into())).await.is_err() {
                break;
            }
        }
    });

    // Reader loop
    let cid = client_id.clone();
    while let Some(Ok(frame)) = ws_read.next().await {
        match frame {
            Message::Text(text) => {
                let text_str: &str = &text;
                if let Ok(parsed) = serde_json::from_str::<Value>(text_str) {
                    handle_message(&cid, &parsed, &state, &tx).await;
                }
            }
            Message::Close(_) => break,
            _ => {}
        }
    }

    handle_disconnect(&client_id, &state).await;
    writer.abort();
}

// ── message dispatcher ───────────────────────────────────────

fn get_room_id(msg: &Value) -> String {
    msg.get("room")
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())
        .unwrap_or(DEFAULT_ROOM)
        .to_string()
}

async fn handle_message(
    client_id: &str,
    msg: &Value,
    state: &Arc<RwLock<ServerState>>,
    tx: &mpsc::UnboundedSender<String>,
) {
    let action = msg
        .get("action")
        .and_then(|v| v.as_str())
        .unwrap_or("");

    match action {
        // ── HOST: create / join a room as host ───────────────
        "host" => {
            let room_id = get_room_id(msg);
            let nickname = msg.get("nickname").and_then(|v| v.as_str()).unwrap_or("Host").to_string();
            let password = msg.get("password").and_then(|v| v.as_str()).unwrap_or("").to_string();

            let mut server = state.write().await;

            // Create room if it doesn't exist, or reuse existing
            let room = server.rooms.entry(room_id.clone()).or_insert_with(|| RoomState {
                host_id: None,
                password: password.clone(),
                clients: HashMap::new(),
            });

            // If a host already exists and it's someone else, reject
            if let Some(ref hid) = room.host_id {
                if hid != client_id {
                    let _ = tx.send(json!({ "action": "auth-fail", "reason": "Room already has a host." }).to_string());
                    return;
                }
            }

            room.host_id = Some(client_id.to_string());
            room.password = password;
            room.clients.insert(client_id.to_string(), ClientInfo { nickname, tx: tx.clone() });
            server.client_rooms.insert(client_id.to_string(), room_id.clone());

            let _ = tx.send(json!({ "action": "hosted", "room": &room_id }).to_string());
        }

        // ── JOIN: authenticate & enter a room ────────────────
        "join" => {
            let room_id = get_room_id(msg);
            let nickname = msg.get("nickname").and_then(|v| v.as_str()).unwrap_or("Student").to_string();
            let password = msg.get("password").and_then(|v| v.as_str()).unwrap_or("").to_string();

            let mut server = state.write().await;

            let room = match server.rooms.get_mut(&room_id) {
                Some(r) => r,
                None => {
                    let _ = tx.send(json!({ "action": "auth-fail", "reason": "Room not found." }).to_string());
                    return;
                }
            };

            if room.host_id.is_none() {
                let _ = tx.send(json!({ "action": "auth-fail", "reason": "Room not found." }).to_string());
                return;
            }

            if !room.password.is_empty() && password != room.password {
                let _ = tx.send(json!({ "action": "auth-fail", "reason": "Incorrect room password." }).to_string());
                return;
            }

            if room.clients.len() >= 8 {
                let _ = tx.send(json!({ "action": "auth-fail", "reason": "Room is full (max 8)." }).to_string());
                return;
            }

            let peers: Vec<Value> = room.clients.iter()
                .map(|(id, info)| json!({ "id": id, "nickname": &info.nickname }))
                .collect();

            let join_msg = json!({ "action": "peer-joined", "id": client_id, "nickname": &nickname }).to_string();
            for (id, client) in &room.clients {
                if id != client_id {
                    let _ = client.tx.send(join_msg.clone());
                }
            }

            room.clients.insert(client_id.to_string(), ClientInfo { nickname, tx: tx.clone() });
            server.client_rooms.insert(client_id.to_string(), room_id.clone());

            let _ = tx.send(json!({ "action": "joined", "peers": peers, "room": &room_id }).to_string());
        }

        // ── RELAY: broadcast within the room ─────────────────
        "relay" => {
            let server = state.read().await;
            if let Some(room_id) = server.client_rooms.get(client_id) {
                if let Some(room) = server.rooms.get(room_id) {
                    let data = msg.get("data").cloned().unwrap_or(Value::Null);
                    let relay = json!({ "action": "relay", "from": client_id, "data": data }).to_string();
                    for (id, client) in &room.clients {
                        if id != client_id {
                            let _ = client.tx.send(relay.clone());
                        }
                    }
                }
            }
        }

        // ── RELAY-TO: send to one specific peer ─────────────
        "relay-to" => {
            let server = state.read().await;
            let target = msg.get("to").and_then(|v| v.as_str()).unwrap_or("");
            if let Some(room_id) = server.client_rooms.get(client_id) {
                if let Some(room) = server.rooms.get(room_id) {
                    if let Some(client) = room.clients.get(target) {
                        let data = msg.get("data").cloned().unwrap_or(Value::Null);
                        let relay = json!({ "action": "relay", "from": client_id, "data": data }).to_string();
                        let _ = client.tx.send(relay);
                    }
                }
            }
        }

        _ => {}
    }
}

// ── disconnect handling ──────────────────────────────────────

async fn handle_disconnect(client_id: &str, state: &Arc<RwLock<ServerState>>) {
    let mut server = state.write().await;

    let room_id = match server.client_rooms.remove(client_id) {
        Some(rid) => rid,
        None => return,
    };

    // Collect information we need before mutating the room
    let (is_host, client_ids_to_remove, should_remove_room);
    {
        let room = match server.rooms.get_mut(&room_id) {
            Some(r) => r,
            None => return,
        };

        room.clients.remove(client_id);
        is_host = room.host_id.as_deref() == Some(client_id);

        if is_host {
            let close_msg = json!({ "action": "room-closed" }).to_string();
            for client in room.clients.values() {
                let _ = client.tx.send(close_msg.clone());
            }
            // Collect keys before clearing
            client_ids_to_remove = room.clients.keys().cloned().collect::<Vec<_>>();
            room.host_id = None;
            room.clients.clear();
            should_remove_room = room_id != DEFAULT_ROOM;
        } else {
            let leave_msg = json!({ "action": "peer-left", "id": client_id }).to_string();
            for client in room.clients.values() {
                let _ = client.tx.send(leave_msg.clone());
            }
            client_ids_to_remove = Vec::new();
            should_remove_room = false;
        }
    }

    // Now remove client_rooms entries outside the room borrow
    for cid in &client_ids_to_remove {
        server.client_rooms.remove(cid);
    }

    if should_remove_room {
        server.rooms.remove(&room_id);
    }
}

// ── utility: discover local IPs ──────────────────────────────

pub fn get_local_ips() -> Vec<String> {
    let mut ips = Vec::new();

    if let Ok(socket) = UdpSocket::bind("0.0.0.0:0") {
        if socket.connect("8.8.8.8:80").is_ok() {
            if let Ok(addr) = socket.local_addr() {
                let ip = addr.ip().to_string();
                if ip != "0.0.0.0" {
                    ips.push(ip);
                }
            }
        }
    }

    if ips.is_empty() {
        ips.push("127.0.0.1".to_string());
    }
    ips
}
