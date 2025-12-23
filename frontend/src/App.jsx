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

    const url = import.meta.env.DEV
      ? "http://localhost:3001"
      : RENDER_BACKEND_URL;

    console.log("🔌 Connecting socket to:", url);

    const s = io(url, {
      path: "/socket.io",
      transports: ["polling", "websocket"],
      autoConnect: true,
    });

    setSocket(s);

    s.on("connect", () => {
      console.log("✅ Socket connected:", s.id);
      setConnected(true);
    });

    s.on("disconnect", () => {
      console.log("❌ Socket disconnected");
      setConnected(false);
    });

    s.on("connect_error", (err) => {
      console.error("❌ Socket connect_error:", err.message);
      setConnected(false);
    });

    return () => {
      s.off("connect");
      s.off("disconnect");
      s.off("connect_error");
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
