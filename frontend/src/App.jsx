import React, { useContext, useState } from "react";
import { useNavigate } from "react-router-dom";
import { SocketContext } from "../App";

export default function Home() {
  const nav = useNavigate();
  const { socket, connected } = useContext(SocketContext);

  const [roomCode, setRoomCode] = useState("");
  const [loading, setLoading] = useState(false);

  const createRoom = () => {
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

  const joinRoom = () => {
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
    <div
      style={{
        maxWidth: 900,
        margin: "0 auto",
        padding: 24,
        position: "relative",
        zIndex: 5,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: 0.2 }}>люба.tv</div>
        <div style={{ opacity: 0.8 }}>
          Статус: {connected ? "🟢 подключено" : "🟠 подключение…"}
        </div>
      </div>

      <div
        style={{
          marginTop: 18,
          padding: 18,
          borderRadius: 18,
          background: "rgba(255,255,255,0.06)",
          border: "1px solid rgba(255,255,255,0.10)",
          backdropFilter: "blur(10px)",
          boxShadow: "0 10px 40px rgba(0,0,0,0.35)",
        }}
      >
        <div style={{ display: "grid", gap: 12 }}>
          <button
            onClick={createRoom}
            disabled={loading}
            style={{
              padding: 14,
              borderRadius: 12,
              border: "1px solid rgba(255,255,255,0.14)",
              background: "linear-gradient(135deg, rgba(124,58,237,0.65), rgba(6,182,212,0.40))",
              color: "white",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            {loading ? "Создаю…" : "Создать комнату"}
          </button>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <input
              value={roomCode}
              onChange={(e) => setRoomCode(e.target.value)}
              placeholder="Код комнаты"
              style={{
                flex: 1,
                minWidth: 220,
                padding: 14,
                borderRadius: 12,
                border: "1px solid rgba(255,255,255,0.14)",
                background: "rgba(0,0,0,0.35)",
                color: "white",
                outline: "none",
              }}
            />
            <button
              onClick={joinRoom}
              disabled={loading}
              style={{
                padding: 14,
                borderRadius: 12,
                border: "1px solid rgba(255,255,255,0.14)",
                background: "rgba(255,255,255,0.10)",
                color: "white",
                fontWeight: 700,
                cursor: "pointer",
                minWidth: 120,
              }}
            >
              Войти
            </button>
          </div>

          <div style={{ opacity: 0.75, fontSize: 13 }}>
            YouTube — идеальная синхронизация. RuTube — best effort (встроенный плеер, иногда нужен первый клик).
          </div>
        </div>
      </div>
    </div>
  );
}
