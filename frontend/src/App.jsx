import React, { useState, useEffect, createContext } from "react";
import { Routes, Route, useNavigate } from "react-router-dom";
import { io } from "socket.io-client";
import Home from "./pages/Home";
import Room from "./pages/Room";

// Context to provide socket across components
export const SocketContext = createContext(null);

export default function App() {
  const [socket, setSocket] = useState(null);
  const [connected, setConnected] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (socket) return;

    const backendUrl = import.meta.env.VITE_BACKEND_URL || "";

    // DEV: локальный бэк
    // PROD: обязателен VITE_BACKEND_URL (Render)
    const url = import.meta.env.DEV ? "http://localhost:3001" : backendUrl;

    if (!url) {
      console.error(
        "❌ VITE_BACKEND_URL is missing in production. Add it in Vercel Env and Redeploy."
      );
      setConnected(false);
      return;
    }

    const s = io(url, {
      path: "/socket.io",
      transports: ["polling", "websocket"],
      autoConnect: true,
    });

    setSocket(s);

    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);

    s.on("connect", onConnect);
    s.on("disconnect", onDisconnect);

    return () => {
      s.off("connect", onConnect);
      s.off("disconnect", onDisconnect);
      // не делаем s.disconnect() здесь, чтобы не рвать соединение при hot reload/перерендере
    };
  }, [socket]);

  // Global error handling: navigate to home if room not found
  useEffect(() => {
    if (!socket) return;

    const handleNotFound = (data) => {
      if (data?.error) {
        alert(data.error);
        navigate("/");
      }
    };

    socket.on("roomError", handleNotFound);
    return () => {
      socket.off("roomError", handleNotFound);
    };
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
