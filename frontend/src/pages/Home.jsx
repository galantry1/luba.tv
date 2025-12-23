import React, { useState, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { SocketContext } from '../App';

export default function Home() {
  const [roomCode, setRoomCode] = useState('');
  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState(false);
  const { socket, connected } = useContext(SocketContext);
  const navigate = useNavigate();

  const handleCreate = () => {
    if (!socket || !connected) return;
    setCreating(true);
    socket.emit('createRoom', (resp) => {
      setCreating(false);
      if (resp?.ok) {
        navigate(`/room/${resp.roomId}`);
      } else {
        alert(resp?.error || 'Ошибка создания комнаты');
      }
    });
  };

  const handleJoin = () => {
    const id = roomCode.trim().toUpperCase();
    if (!id) return;
    if (!socket || !connected) return;
    setJoining(true);
    socket.emit('joinRoom', { roomId: id }, (resp) => {
      setJoining(false);
      if (resp?.ok) {
        navigate(`/room/${resp.roomId}`);
      } else {
        alert(resp?.error || 'Комната не найдена');
      }
    });
  };

  return (
    <div className="container">
      <div style={{ textAlign: 'center', marginBottom: '1.75rem' }}>
        <h1>Смотрите вместе — синхронно</h1>
        <p className="muted">
          Создай комнату, кинь код подруге и управляй просмотром как в Rave.
        </p>
        <div style={{ marginTop: '0.85rem' }}>
          <span className="pill">{connected ? 'Онлайн' : 'Подключение…'}</span>
        </div>
      </div>

      <div className="grid">
        <div className="card">
          <h2>Создать комнату</h2>
          <p className="muted">Ты будешь хостом: выбираешь видео и управляешь воспроизведением.</p>
          <button onClick={handleCreate} disabled={!connected || creating} style={{ width: '100%', marginTop: '0.5rem' }}>
            {creating ? 'Создание…' : 'Создать'}
          </button>
        </div>

        <div className="card">
          <h2>Войти по коду</h2>
          <p className="muted">Введи код комнаты и подключайся к просмотру.</p>
          <input
            type="text"
            placeholder="Например: A1B2C3D4"
            value={roomCode}
            onChange={(e) => setRoomCode(e.target.value)}
            style={{ textTransform: 'uppercase' }}
          />
          <button onClick={handleJoin} disabled={!connected || joining} style={{ width: '100%' }}>
            {joining ? 'Вход…' : 'Войти'}
          </button>
        </div>
      </div>
    </div>
  );
}