// server.js – Next.js custom server with integrated WebSocket signaling
// Run with: node server.js
const { createServer } = require("http");
const { parse } = require("url");
const next = require("next");
const { WebSocketServer } = require("ws");

const dev = process.env.NODE_ENV !== "production";
const port = parseInt(process.env.PORT || "3000", 10);
const app = next({ dev });
const handle = app.getRequestHandler();

// ─── Signaling logic ─────────────────────────────────────────────────────────
const rooms = new Map(); // code → { sender, receiver }

function safeSend(ws, msg) {
  if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg));
}

function attachSignaling(httpServer) {
  const wss = new WebSocketServer({ noServer: true });

  httpServer.on("upgrade", (req, socket, head) => {
    const { pathname } = parse(req.url);
    if (pathname === "/signal") {
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit("connection", ws, req);
      });
    } else {
      socket.destroy();
    }
  });

  wss.on("connection", (ws) => {
    let roomCode = null;
    let role = null;

    function relay(msg) {
      if (!roomCode) return;
      const room = rooms.get(roomCode);
      if (!room) return;
      const target = role === "sender" ? room.receiver : room.sender;
      safeSend(target, msg);
    }

    ws.on("message", (raw) => {
      let msg;
      try { msg = JSON.parse(raw); } catch { return; }

      switch (msg.type) {
        case "create": {
          const code = msg.code;
          if (rooms.has(code)) {
            safeSend(ws, { type: "error", message: "Code already in use. Try again." });
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
      if (!roomCode) return;
      const room = rooms.get(roomCode);
      if (!room) return;
      relay({ type: "peer-disconnected" });
      rooms.delete(roomCode);
      console.log(`[${roomCode}] Room closed (${role} disconnected)`);
    });

    ws.on("error", (err) => console.error("WS error:", err.message));
  });

  console.log("✓ WebSocket signaling attached at /signal");
}
// ─────────────────────────────────────────────────────────────────────────────

app.prepare().then(() => {
  const httpServer = createServer((req, res) => {
    handle(req, res, parse(req.url, true));
  });

  attachSignaling(httpServer);

  httpServer.listen(port, "0.0.0.0", () => {
    console.log(`✓ FileShare ready on http://0.0.0.0:${port}`);
    console.log(`  → Local:   http://localhost:${port}`);
    console.log(`  → Network: http://<your-ip>:${port}`);
  });
});
