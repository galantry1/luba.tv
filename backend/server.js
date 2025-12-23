const express = require("express");
const { createServer } = require("http");
const { Server } = require("socket.io");
const { v4: uuidv4 } = require("uuid");

const app = express();
const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: { origin: "*" },
});

app.get("/health", (_, res) => res.send("OK"));

const rooms = new Map();

function generateRoomCode() {
  return uuidv4().replace(/-/g, "").slice(0, 6).toUpperCase();
}

function cleanupRoom(roomId) {
  const room = rooms.get(roomId);
  if (!room) return;

  if (room.participants.size === 0) {
    setTimeout(() => {
      const stale = rooms.get(roomId);
      if (stale && stale.participants.size === 0) {
        rooms.delete(roomId);
        console.log(`Removed room ${roomId} after TTL`);
      }
    }, 10 * 60 * 1000);
  }
}

io.on("connection", (socket) => {
  console.log("[socket] connected", socket.id);

  function leaveAllRooms() {
    for (const [id, r] of rooms.entries()) {
      if (r.participants.has(socket.id)) {
        r.participants.delete(socket.id);
        socket.leave(id);

        if (r.hostId === socket.id) {
          r.hostId = null;
          const next = Array.from(r.participants)[0];
          if (next) r.hostId = next;
          io.to(id).emit("hostUpdate", { hostId: r.hostId });
        }

        cleanupRoom(id);
      }
    }
  }

  socket.on("createRoom", (cb) => {
    leaveAllRooms();

    let roomId;
    do {
      roomId = generateRoomCode();
    } while (rooms.has(roomId));

    const hostKey = uuidv4();

    rooms.set(roomId, {
      hostId: socket.id,
      hostKey,
      participants: new Set([socket.id]),
      state: {
        video: null,
        playing: false,
        time: 0,
      },
    });

    socket.join(roomId);

    io.to(roomId).emit("hostUpdate", { hostId: socket.id });

    cb?.({
      ok: true,
      roomId,
      hostId: socket.id,
      hostKey,
      state: rooms.get(roomId).state,
    });

    console.log(`Room created ${roomId} host=${socket.id}`);
  });

  socket.on("joinRoom", ({ roomId, hostKey }, cb) => {
    const id = String(roomId || "").trim().toUpperCase();
    const room = rooms.get(id);

    if (!room) {
      cb?.({ ok: false, error: "Комната не найдена" });
      return;
    }

    leaveAllRooms();

    room.participants.add(socket.id);
    socket.join(id);

    // Если пришёл правильный hostKey — назначаем этого сокета хостом
    if (hostKey && room.hostKey && hostKey === room.hostKey) {
      room.hostId = socket.id;
    }

    // Если хоста нет — назначим текущего
    if (!room.hostId) room.hostId = socket.id;

    io.to(id).emit("hostUpdate", { hostId: room.hostId });

    cb?.({
      ok: true,
      roomId: id,
      hostId: room.hostId,
      isHost: room.hostId === socket.id,
      state: room.state,
    });

    console.log(`Socket ${socket.id} joined room ${id}, isHost=${room.hostId === socket.id}`);
  });

  // Принудительно "забрать" хоста по hostKey
  socket.on("claimHost", ({ roomId, hostKey }, cb) => {
    const id = String(roomId || "").trim().toUpperCase();
    const room = rooms.get(id);
    if (!room) return cb?.({ ok: false, error: "Комната не найдена" });

    if (!hostKey || hostKey !== room.hostKey) {
      return cb?.({ ok: false, error: "Неверный hostKey" });
    }

    room.hostId = socket.id;
    io.to(id).emit("hostUpdate", { hostId: room.hostId });

    cb?.({ ok: true, hostId: room.hostId, isHost: true });
  });

  socket.on("setVideo", ({ roomId, provider, url }, cb) => {
    const id = String(roomId || "").trim().toUpperCase();
    const room = rooms.get(id);
    if (!room) return;

    if (room.hostId !== socket.id) {
      cb?.({ ok: false, error: "Только хост может менять видео" });
      return;
    }

    room.state.video = { provider, url };
    room.state.time = 0;
    room.state.playing = false;

    io.to(id).emit("stateUpdate", { state: { ...room.state } });
    cb?.({ ok: true });
  });

  socket.on("control", ({ roomId, action, time }, cb) => {
    const id = String(roomId || "").trim().toUpperCase();
    const room = rooms.get(id);
    if (!room) return;

    if (room.hostId !== socket.id) {
      cb?.({ ok: false, error: "Только хост управляет" });
      return;
    }

    const state = room.state;

    if (typeof time === "number") state.time = time;
    if (action === "play") state.playing = true;
    if (action === "pause") state.playing = false;

    io.to(id).emit("stateUpdate", { state: { ...state } });
    cb?.({ ok: true });
  });

  socket.on("requestState", ({ roomId }, cb) => {
    const id = String(roomId || "").trim().toUpperCase();
    const room = rooms.get(id);
    if (!room) return cb?.({ ok: false });
    cb?.({ ok: true, state: room.state, hostId: room.hostId });
  });

  socket.on("disconnect", () => {
    console.log("[socket] disconnected", socket.id);

    for (const [roomId, room] of rooms.entries()) {
      if (room.participants.delete(socket.id)) {
        if (room.hostId === socket.id) {
          room.hostId = null;
          const next = Array.from(room.participants)[0];
          if (next) room.hostId = next;
          io.to(roomId).emit("hostUpdate", { hostId: room.hostId });
        }
        cleanupRoom(roomId);
      }
    }
  });
});

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => console.log(`Server listening on ${PORT}`));
