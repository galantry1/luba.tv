import React, { useState, useEffect, createContext } from "react";
import { Routes, Route, useNavigate } from "react-router-dom";
import { io } from "socket.io-client";
import Home from "./pages/Home";
import Room from "./pages/Room";

export const SocketContext = createContext(null);

export default function App() {
  const [socket, setSocket] = useState(null);
  const [connected, setConnected] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (socket) return;

    const RENDER_BACKEND_URL = "https://luba-tv-1.onrender.com";
    const url = import.meta.env.DEV ? "http://localhost:3001" : RENDER_BACKEND_URL;

    console.log("🔌 Connecting socket to:", url);

    const s = io(url, {
      path: "/socket.io",
      transports: ["polling", "websocket"],
      autoConnect: false,
      timeout: 10000,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 500,
      reconnectionDelayMax: 2000,
    });

    // debug handle
    window.__socket = s;

    const onConnect = () => {
      console.log("✅ CONNECT", s.id);
      setConnected(true);
    };
    const onDisconnect = (reason) => {
      console.log("❌ DISCONNECT", reason);
      setConnected(false);
    };
    const onConnectError = (err) => {
      console.log("❌ CONNECT_ERROR", err?.message || err);
      setConnected(false);
    };

    // handlers first
    s.on("connect", onConnect);
    s.on("disconnect", onDisconnect);
    s.on("connect_error", onConnectError);

    // then connect
    s.connect();

    // hard sync flag (на случай пропуска события)
    const t = setInterval(() => setConnected(s.connected), 500);

    setSocket(s);

    return () => {
      clearInterval(t);
      s.off("connect", onConnect);
      s.off("disconnect", onDisconnect);
      s.off("connect_error", onConnectError);
    };
  }, [socket]);

  useEffect(() => {
    if (!socket) return;

    const handleNotFound = (data) => {
      if (data?.error) {
        alert(data.error);
        navigate("/");
      }
    };

    socket.on("roomError", handleNotFound);
    return () => socket.off("roomError", handleNotFound);
  }, [socket, navigate]);

  return (
    <SocketContext.Provider value={{ socket, connected }}>
      {/* Background layer (never catches clicks) */}
      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 0,
          pointerEvents: "none",
          background:
            "radial-gradient(1200px 600px at 20% 10%, rgba(124, 58, 237, 0.35), transparent 60%)," +
            "radial-gradient(900px 500px at 80% 30%, rgba(6, 182, 212, 0.28), transparent 55%)," +
            "linear-gradient(180deg, rgba(0,0,0,0.92), rgba(0,0,0,0.88))",
        }}
      />

      {/* App content */}
      <div style={{ position: "relative", zIndex: 1, minHeight: "100vh" }}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/room/:roomId" element={<Room />} />
        </Routes>
      </div>
    </SocketContext.Provider>
  );
}
