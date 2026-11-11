
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const crypto = require("crypto");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));

const competitions = new Map();

function makeCode() {
  let code;
  do {
    code = String(100000 + crypto.randomInt(900000));
  } while (competitions.has(code));
  return code;
}

io.on("connection", socket => {
  socket.on("createCompetition", callback => {
    const code = makeCode();

    competitions.set(code, {
      host: socket.id,
      phone: null,
      state: {
        athlete: "Athlete",
        time: 0,
        obstacles: []
      }
    });

    socket.join(code);
    socket.data.code = code;
    socket.data.role = "host";

    callback?.({ ok: true, code });
  });

  socket.on("joinCompetition", ({ code }, callback) => {
    code = String(code || "").replace(/\D/g, "").slice(0, 6);
    const room = competitions.get(code);

    if (!room) {
      return callback?.({ ok: false, error: "Competition not found." });
    }

    if (room.phone) {
      return callback?.({ ok: false, error: "A phone is already connected." });
    }

    room.phone = socket.id;
    socket.join(code);
    socket.data.code = code;
    socket.data.role = "phone";

    callback?.({
      ok: true,
      state: room.state,
      hostId: room.host
    });

    io.to(room.host).emit("phoneConnected", socket.id);
  });

  socket.on("updateCompetition", state => {
    const room = competitions.get(socket.data.code);

    if (!room || socket.data.role !== "host") return;

    room.state = state;
    socket.to(socket.data.code).emit("updateCompetition", state);
  });

  // Relay WebRTC camera connection messages
  socket.on("signal", ({ target, data }) => {
    const room = competitions.get(socket.data.code);

    if (!room) return;

    const participants = [room.host, room.phone];

    if (!participants.includes(socket.id)) return;
    if (!participants.includes(target)) return;

    io.to(target).emit("signal", {
      from: socket.id,
      data
    });
  });

  socket.on("disconnect", () => {
    const code = socket.data.code;
    const room = competitions.get(code);

    if (!room) return;

    if (room.host === socket.id) {
      io.to(code).emit("competitionEnded");
      competitions.delete(code);
    } else if (room.phone === socket.id) {
      room.phone = null;
      io.to(room.host).emit("phoneDisconnected");
    }
  });
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, "0.0.0.0", () => {
  console.log("Ninja Live running on port " + PORT);
});
