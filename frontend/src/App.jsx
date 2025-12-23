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

    // expose for debugging in console
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
    const onReconnectAttempt = (n) => console.log("🔁 reconnect_attempt", n);
    const onReconnect = (n) => console.log("✅ reconnected after", n);

    s.on("connect", onConnect);
    s.on("disconnect", onDisconnect);
    s.on("connect_error", onConnectError);
    s.io.on("reconnect_attempt", onReconnectAttempt);
    s.io.on("reconnect", onReconnect);

    // connect AFTER handlers
    s.connect();

    // hard sync connected flag (на случай если connect событие промахнулось)
    const t = setInterval(() => setConnected(s.connected), 500);

    setSocket(s);

    return () => {
      clearInterval(t);
      s.off("connect", onConnect);
      s.off("disconnect", onDisconnect);
      s.off("connect_error", onConnectError);
      s.io.off("reconnect_attempt", onReconnectAttempt);
      s.io.off("reconnect", onReconnect);
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
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/room/:roomId" element={<Room />} />
      </Routes>
    </SocketContext.Provider>
  );
}
