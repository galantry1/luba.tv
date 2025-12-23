const express = require("express");
const { createServer } = require("http");
const { Server } = require("socket.io");
const { v4: uuidv4 } = require("uuid");

// -------------------- Config --------------------
const PORT = process.env.PORT || 3001;

// На проде лучше указать точные домены Vercel + свой домен.
// Пока можно оставить "*" чтобы точно работало, но безопаснее ограничить.
const ALLOWED_ORIGINS = (process.env.CORS_ORIGINS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

// TTL пустой комнаты (мс)
const EMPTY_ROOM_TTL_MS = Number(process.env.EMPTY_ROOM_TTL_MS || 10 * 60 * 1000);

// -------------------- App / Server --------------------
const app = express();
const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: ALLOWED_ORIGINS.length ? ALLOWED_ORIGINS : "*",
    methods: ["GET", "POST"],
  },
});

// -------------------- In-memory rooms --------------------
/**
 * rooms: Map<roomId, {
 *  hostId: string|null,
 *  participants: Set<string>,
 *  state: { video: {provider,url}|null, playing: boolean, time: number, lastUpdateMs: number },
 *  deleteTimer: NodeJS.Timeout|null
 * }>
 */
const rooms = new Map();

function nowMs() {
  return Date.now();
}

function generateRoomCode() {
  return uuidv4().replace(/-/g, "").slice(0, 6).toUpperCase();
}

function materializeState(state) {
  // Обновляем time если playing=true
  const ms = nowMs();
  let time = state.time;

  if (state.playing) {
    const delta = (ms - state.lastUpdateMs) / 1000;
    time = Math.max(0, time + delta);
  }

  return { ...state, time, lastUpdateMs: ms };
}

function scheduleRoomDelete(roomId) {
  const room = rooms.get(roomId);
  if (!room) return;

  if (room.deleteTimer) clearTimeout(room.deleteTimer);
  room.deleteTimer = setTimeout(() => {
    const cur = rooms.get(roomId);
    if (cur && cur.participants.size === 0) {
      rooms.delete(roomId);
      console.log(`[rooms] Removed empty room ${roomId} after TTL`);
    }
  }, EMPTY_ROOM_TTL_MS);
}

function cancelRoomDelete(roomId) {
  const room = rooms.get(roomId);
  if (!room) return;
  if (room.deleteTimer) clearTimeout(room.deleteTimer);
  room.deleteTimer = null;
}

function leaveAllRooms(socket) {
  for (const [roomId, room] of rooms.entries()) {
    if (room.participants.has(socket.id)) {
      room.participants.delete(socket.id);
      socket.leave(roomId);

      // если хост ушел — переназначаем
      if (room.hostId === socket.id) {
        const next = room.participants.values().next().value || null;
        room.hostId = next;
      }

      if (room.participants.size === 0) scheduleRoomDelete(roomId);

      // оповестим оставшихся о новом хосте/состоянии
      if (room.participants.size > 0) {
        io.to(roomId).emit("room:meta", { hostId: room.hostId });
      }
    }
  }
}

// -------------------- Health --------------------
app.get("/health", (_, res) => res.send("OK"));

// -------------------- Socket events --------------------
io.on("connection", (socket) => {
  console.log("[socket] connected", socket.id);

  socket.on("createRoom", (cb) => {
    try {
      leaveAllRooms(socket);

      let roomId;
      do {
        roomId = generateRoomCode();
      } while (rooms.has(roomId));

      const state = {
        video: null, // { provider, url }
        playing: false,
        time: 0,
        lastUpdateMs: nowMs(),
      };

      rooms.set(roomId, {
        hostId: socket.id,
        participants: new Set([socket.id]),
        state,
        deleteTimer: null,
      });

      socket.join(roomId);
      cancelRoomDelete(roomId);

      cb?.({ ok: true, roomId, hostId: socket.id, state: materializeState(state) });
      console.log(`[rooms] created ${roomId} host=${socket.id}`);
    } catch (e) {
      cb?.({ ok: false, error: "create_failed" });
    }
  });

  socket.on("joinRoom", ({ roomId }, cb) => {
    try {
      const id = String(roomId || "").trim().toUpperCase();
      const room = rooms.get(id);
      if (!room) {
        cb?.({ ok: false, error: "room_not_found" });
        return;
      }

      leaveAllRooms(socket);

      room.participants.add(socket.id);
      socket.join(id);
      cancelRoomDelete(id);

      if (!room.hostId) room.hostId = socket.id;

      cb?.({ ok: true, roomId: id, hostId: room.hostId, state: materializeState(room.state) });
      io.to(id).emit("room:meta", { hostId: room.hostId });

      console.log(`[rooms] ${socket.id} joined ${id}`);
    } catch (e) {
      cb?.({ ok: false, error: "join_failed" });
    }
  });

  socket.on("requestState", ({ roomId }, cb) => {
    const id = String(roomId || "").trim().toUpperCase();
    const room = rooms.get(id);
    if (!room) {
      cb?.({ ok: false });
      return;
    }
    cb?.({ ok: true, hostId: room.hostId, state: materializeState(room.state) });
  });

  socket.on("setVideo", ({ roomId, provider, url }, cb) => {
    const id = String(roomId || "").trim().toUpperCase();
    const room = rooms.get(id);
    if (!room) return;

    if (room.hostId !== socket.id) return;

    room.state.video = { provider, url };
    room.state.playing = false;
    room.state.time = 0;
    room.state.lastUpdateMs = nowMs();

    io.to(id).emit("stateUpdate", { state: materializeState(room.state) });
    cb?.({ ok: true });
  });

  // action: play | pause | seek
  socket.on("control", ({ roomId, action, time }, cb) => {
    const id = String(roomId || "").trim().toUpperCase();
    const room = rooms.get(id);
    if (!room) return;
    if (room.hostId !== socket.id) return;

    // материализуем перед изменениями чтобы time не “отставал”
    room.state = materializeState(room.state);

    if (typeof time === "number") room.state.time = Math.max(0, time);

    if (action === "play") room.state.playing = true;
    if (action === "pause") room.state.playing = false;

    room.state.lastUpdateMs = nowMs();

    io.to(id).emit("stateUpdate", { state: materializeState(room.state) });
    cb?.({ ok: true });
  });

  socket.on("leaveRoom", ({ roomId }) => {
    const id = String(roomId || "").trim().toUpperCase();
    const room = rooms.get(id);
    if (!room) return;

    if (room.participants.delete(socket.id)) {
      socket.leave(id);

      if (room.hostId === socket.id) {
        const next = room.participants.values().next().value || null;
        room.hostId = next;
        io.to(id).emit("room:meta", { hostId: room.hostId });
      }

      if (room.participants.size === 0) scheduleRoomDelete(id);
    }
  });

  socket.on("disconnect", () => {
    console.log("[socket] disconnected", socket.id);
    leaveAllRooms(socket);
  });
});

// -------------------- Listen --------------------
httpServer.listen(PORT, () => {
  console.log(`Backend listening on port ${PORT}`);
});
