import React, { useContext, useState } from "react";
import { useNavigate } from "react-router-dom";
import { SocketContext } from "../App";

export default function Home() {
  const nav = useNavigate();
  const { socket, connected } = useContext(SocketContext);

  const [roomCode, setRoomCode] = useState("");
  const [loading, setLoading] = useState(false);

  const createRoom = async () => {
    if (!socket) {
      alert("Сокет ещё не создан. Подожди 1–2 сек и попробуй снова.");
      return;
    }

    setLoading(true);

    const timeout = setTimeout(() => {
      console.log("❌ createRoom timeout (no callback from server)");
      setLoading(false);
      alert("Сервер не ответил на создание комнаты. Открой Console и скинь ошибки.");
    }, 8000);

    console.log("➡️ emit createRoom, connected=", socket.connected);

    socket.emit("createRoom", (resp) => {
      clearTimeout(timeout);
      console.log("✅ createRoom response:", resp);
      setLoading(false);

      if (!resp?.ok) {
        alert("Не удалось создать комнату");
        return;
      }
      nav(`/room/${resp.roomId}`);
    });
  };

  const joinRoom = async () => {
    if (!socket) return alert("Сокет ещё не готов.");
    const code = roomCode.trim().toUpperCase();
    if (!code) return;

    setLoading(true);

    const timeout = setTimeout(() => {
      console.log("❌ joinRoom timeout (no callback from server)");
      setLoading(false);
      alert("Сервер не ответил на вход. Проверь комнату и соединение.");
    }, 8000);

    console.log("➡️ emit joinRoom", code, "connected=", socket.connected);

    socket.emit("joinRoom", { roomId: code }, (resp) => {
      clearTimeout(timeout);
      console.log("✅ joinRoom response:", resp);
      setLoading(false);

      if (!resp?.ok) {
        alert(resp?.error || "Комната не найдена");
        return;
      }
      nav(`/room/${code}`);
    });
  };

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: 24 }}>
      <div style={{ opacity: 0.75, marginBottom: 10 }}>
        Статус: {connected ? "🟢 подключено" : "🟠 подключение…"}
      </div>

      <div style={{ display: "grid", gap: 12 }}>
        <button onClick={createRoom} disabled={loading} style={{ padding: 14, borderRadius: 12 }}>
          {loading ? "Создаю…" : "Создать комнату"}
        </button>

        <div style={{ display: "flex", gap: 10 }}>
          <input
            value={roomCode}
            onChange={(e) => setRoomCode(e.target.value)}
            placeholder="Код комнаты"
            style={{ flex: 1, padding: 14, borderRadius: 12 }}
          />
          <button onClick={joinRoom} disabled={loading} style={{ padding: 14, borderRadius: 12 }}>
            Войти
          </button>
        </div>
      </div>
    </div>
  );
}
