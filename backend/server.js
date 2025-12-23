const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

// Simple in‑memory room store. In production you'd use a database or cache.
const rooms = new Map();

// Create Express app and HTTP server
const app = express();
const httpServer = createServer(app);

// Allow cross origin from frontend during development
const io = new Server(httpServer, {
  cors: {
    origin: '*'
  }
});

// Serve static assets from the frontend build. Assumes frontend is built into ../frontend/dist
const staticDir = path.join(__dirname, '..', 'frontend', 'dist');
app.use(express.static(staticDir));

// Health endpoint
app.get('/health', (_, res) => res.send('OK'));

// All other paths serve index.html for client side routing
app.get('*', (req, res) => {
  res.sendFile(path.join(staticDir, 'index.html'));
});

// Helper to generate a room code (shorter than UUID for easier sharing)
function generateRoomCode() {
  // create a 6‑character alphanumeric code
  return uuidv4().replace(/-/g, '').slice(0, 6).toUpperCase();
}

// When a socket disconnects or leaves a room we should clean up.
function cleanupRoom(roomId) {
  const room = rooms.get(roomId);
  if (!room) return;
  // Remove empty room after TTL if no participants
  if (room.participants.size === 0) {
    setTimeout(() => {
      const stale = rooms.get(roomId);
      if (stale && stale.participants.size === 0) {
        rooms.delete(roomId);
        console.log(`Removed room ${roomId} after TTL`);
      }
    }, 10 * 60 * 1000); // 10 minutes TTL
  }
}

io.on('connection', (socket) => {
  console.log('Socket connected', socket.id);

  // Create a new room and assign this socket as host
  socket.on('createRoom', (cb) => {
    // Remove from any previous rooms
    for (const [id, room] of rooms.entries()) {
      if (room.participants.has(socket.id)) {
        room.participants.delete(socket.id);
        if (room.hostId === socket.id) {
          room.hostId = null;
        }
        socket.leave(id);
        cleanupRoom(id);
      }
    }
    let roomId;
    // Ensure unique room code
    do {
      roomId = generateRoomCode();
    } while (rooms.has(roomId));
    rooms.set(roomId, {
      hostId: socket.id,
      participants: new Set([socket.id]),
      state: {
        video: null, // { provider, url }
        playing: false,
        time: 0
      }
    });
    socket.join(roomId);
    cb({ ok: true, roomId });
    console.log(`Room created ${roomId} by host ${socket.id}`);
  });

  // Join an existing room by code
  socket.on('joinRoom', ({ roomId }, cb) => {
    const room = rooms.get(roomId);
    if (!room) {
      cb({ ok: false, error: 'Комната не найдена' });
      return;
    }
    // Remove from other rooms
    for (const [id, r] of rooms.entries()) {
      if (r.participants.has(socket.id)) {
        r.participants.delete(socket.id);
        if (r.hostId === socket.id) {
          r.hostId = null;
        }
        socket.leave(id);
        cleanupRoom(id);
      }
    }
    room.participants.add(socket.id);
    socket.join(roomId);
    // If no host, promote first participant
    if (!room.hostId) {
      room.hostId = socket.id;
    }
    cb({ ok: true, roomId, hostId: room.hostId, state: room.state });
    console.log(`Socket ${socket.id} joined room ${roomId}`);
  });

  // Set video (host only)
  socket.on('setVideo', ({ roomId, provider, url }, cb) => {
    const room = rooms.get(roomId);
    if (!room) return;
    if (room.hostId !== socket.id) return;
    room.state.video = { provider, url };
    room.state.time = 0;
    room.state.playing = false;
    io.to(roomId).emit('stateUpdate', {
      state: { ...room.state }
    });
    if (cb) cb({ ok: true });
  });

  // Host controls: play, pause, seek
  socket.on('control', ({ roomId, action, time }) => {
    const room = rooms.get(roomId);
    if (!room) return;
    if (room.hostId !== socket.id) return;
    const state = room.state;
    if (typeof time === 'number') {
      state.time = time;
    }
    if (action === 'play') {
      state.playing = true;
    } else if (action === 'pause') {
      state.playing = false;
    } else if (action === 'seek') {
      // time already set
    }
    io.to(roomId).emit('stateUpdate', { state: { ...state } });
  });

  // Request current state (for new participant)
  socket.on('requestState', ({ roomId }, cb) => {
    const room = rooms.get(roomId);
    if (!room) {
      cb({ ok: false });
      return;
    }
    cb({ ok: true, state: room.state, hostId: room.hostId });
  });

  socket.on('disconnect', () => {
    console.log('Socket disconnected', socket.id);
    // Remove from rooms
    for (const [roomId, room] of rooms.entries()) {
      if (room.participants.delete(socket.id)) {
        // If this was host, clear host
        if (room.hostId === socket.id) {
          room.hostId = null;
          // Promote next participant if exists
          const next = Array.from(room.participants)[0];
          if (next) {
            room.hostId = next;
          }
        }
        cleanupRoom(roomId);
      }
    }
  });
});

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});