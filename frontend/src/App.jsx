import React, { useMemo, useState, useEffect, createContext } from 'react';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { io } from 'socket.io-client';
import Home from './pages/Home';
import Room from './pages/Room';

// Context to provide socket across components
export const SocketContext = createContext(null);

export default function App() {
  const [socket, setSocket] = useState(null);
  const [connected, setConnected] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    // Initialize socket only once
    if (!socket) {
      const url = import.meta.env.DEV ? 'http://localhost:3001' : '';
      const s = io(url, { autoConnect: false });
      s.connect();
      setSocket(s);
      s.on('connect', () => setConnected(true));
      s.on('disconnect', () => setConnected(false));
    }
    return () => {
      // Clean up on unmount
      socket?.off('connect');
      socket?.off('disconnect');
    };
  }, [socket]);

  // Global error handling: navigate to home if room not found
  useEffect(() => {
    if (!socket) return;
    const handleNotFound = (data) => {
      if (data?.error) {
        alert(data.error);
        navigate('/');
      }
    };
    socket.on('roomError', handleNotFound);
    return () => {
      socket.off('roomError', handleNotFound);
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