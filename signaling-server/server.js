const { WebSocketServer } = require("ws");
const http = require("http");

const server = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("FileShare Signaling Server\n");
});

const wss = new WebSocketServer({ server });

// rooms: code -> { sender: WebSocket | null, receiver: WebSocket | null }
const rooms = new Map();

wss.on("connection", (ws) => {
  let roomCode = null;
  let role = null; // 'sender' | 'receiver'

  function send(socket, msg) {
    if (socket && socket.readyState === 1) {
      socket.send(JSON.stringify(msg));
    }
  }

  function relay(msg) {
    if (!roomCode) return;
    const room = rooms.get(roomCode);
    if (!room) return;
    const target = role === "sender" ? room.receiver : room.sender;
    send(target, msg);
  }

  ws.on("message", (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }

    switch (msg.type) {
      case "create": {
        const code = msg.code;
        if (rooms.has(code)) {
          send(ws, { type: "error", message: "Code already in use. Refresh and try again." });
          return;
        }
        roomCode = code;
        role = "sender";
        rooms.set(code, { sender: ws, receiver: null });
        send(ws, { type: "created" });
        console.log(`[${code}] Room created`);
        break;
      }

      case "join": {
        const code = msg.code;
        const room = rooms.get(code);
        if (!room) {
          send(ws, { type: "error", message: "Code not found. Make sure the sender is ready." });
          return;
        }
        if (room.receiver) {
          send(ws, { type: "error", message: "Someone is already receiving this transfer." });
          return;
        }
        roomCode = code;
        role = "receiver";
        room.receiver = ws;
        send(ws, { type: "joined" });
        send(room.sender, { type: "receiver-joined" });
        console.log(`[${code}] Receiver joined`);
        break;
      }

      case "offer":
      case "answer":
      case "ice-candidate":
        relay(msg);
        break;

      default:
        break;
    }
  });

  ws.on("close", () => {
    if (!roomCode) return;
    const room = rooms.get(roomCode);
    if (!room) return;
    relay({ type: "peer-disconnected" });
    rooms.delete(roomCode);
    console.log(`[${roomCode}] Room closed (${role} disconnected)`);
  });

  ws.on("error", (err) => {
    console.error("WebSocket error:", err.message);
  });
});

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
  console.log(`Signaling server running on port ${PORT}`);
});
