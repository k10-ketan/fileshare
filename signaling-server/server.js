const { WebSocketServer } = require("ws");
const http = require("http");

const server = http.createServer((req, res) => {
  // Health check endpoint (needed by Render)
  res.writeHead(200, {
    "Content-Type": "text/plain",
    "Access-Control-Allow-Origin": "*",
  });
  res.end("FileShare Signaling Server OK\n");
});

const wss = new WebSocketServer({ server });

// rooms: code → { sender: WebSocket | null, receiver: WebSocket | null }
const rooms = new Map();

function safeSend(ws, msg) {
  if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg));
}

wss.on("connection", (ws, req) => {
  console.log(`[+] Client connected from ${req.socket.remoteAddress}`);
  let roomCode = null;
  let role = null;

  function relay(msg) {
    if (!roomCode) return;
    const room = rooms.get(roomCode);
    if (!room) return;
    const target = role === "sender" ? room.receiver : room.sender;
    safeSend(target, msg);
  }

  // Keep-alive ping to prevent Render from closing idle connections
  const pingInterval = setInterval(() => {
    if (ws.readyState === 1) ws.ping();
  }, 25000);

  ws.on("message", (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    switch (msg.type) {
      case "create": {
        const code = msg.code;
        if (rooms.has(code)) {
          safeSend(ws, { type: "error", message: "Code already in use. Refresh and try again." });
          return;
        }
        roomCode = code; role = "sender";
        rooms.set(code, { sender: ws, receiver: null });
        safeSend(ws, { type: "created" });
        console.log(`[${code}] Room created`);
        break;
      }
      case "join": {
        const code = msg.code;
        const room = rooms.get(code);
        if (!room) {
          safeSend(ws, { type: "error", message: "Code not found. Make sure the sender is ready." });
          return;
        }
        if (room.receiver) {
          safeSend(ws, { type: "error", message: "Someone is already receiving this transfer." });
          return;
        }
        roomCode = code; role = "receiver";
        room.receiver = ws;
        safeSend(ws, { type: "joined" });
        safeSend(room.sender, { type: "receiver-joined" });
        console.log(`[${code}] Receiver joined`);
        break;
      }
      case "offer":
      case "answer":
      case "ice-candidate":
        relay(msg);
        break;
    }
  });

  ws.on("close", () => {
    clearInterval(pingInterval);
    if (!roomCode) return;
    const room = rooms.get(roomCode);
    if (!room) return;
    relay({ type: "peer-disconnected" });
    rooms.delete(roomCode);
    console.log(`[${roomCode}] Room closed (${role} disconnected)`);
  });

  ws.on("error", (err) => console.error("WS error:", err.message));
});

const PORT = process.env.PORT || 8080;
server.listen(PORT, "0.0.0.0", () => {
  console.log(`Signaling server running on port ${PORT}`);
});
