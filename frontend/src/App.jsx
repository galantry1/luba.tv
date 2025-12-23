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
      autoConnect: false, // важно!
    });

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

    // СНАЧАЛА подписки
    s.on("connect", onConnect);
    s.on("disconnect", onDisconnect);
    s.on("connect_error", onConnectError);

    // потом connect
    s.connect();

    // если уже подключен — не ждём события
    setConnected(s.connected);

    setSocket(s);

    return () => {
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
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/room/:roomId" element={<Room />} />
      </Routes>
    </SocketContext.Provider>
  );
}
