import React, { useContext, useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import ReactPlayer from 'react-player/youtube';
import { SocketContext } from '../App';

// Helper to detect YouTube ID and convert various YouTube links to canonical form
function normalizeYouTubeUrl(url) {
  try {
    const u = new URL(url);
    if (u.hostname.includes('youtu.be')) {
      const id = u.pathname.substring(1);
      return `https://www.youtube.com/watch?v=${id}`;
    }
    if (u.hostname.includes('youtube.com')) {
      // keep original
      return url;
    }
  } catch (e) {
    return url;
  }
  return url;
}

// Normalize RuTube URL to embed if possible
function normalizeRuTubeUrl(url) {
  try {
    const u = new URL(url);
    const parts = u.pathname.split('/').filter(Boolean);
    const videoIndex = parts.indexOf('video');
    if (videoIndex !== -1 && parts.length > videoIndex + 1) {
      const id = parts[videoIndex + 1];
      return `https://rutube.ru/play/embed/${id}?platform=watchparty`;
    }
    if (parts[0] === 'play' && parts[1] === 'embed') {
      // ensure platform param for postMessage API stability
      const uu = new URL(url);
      if (!uu.searchParams.get('platform')) uu.searchParams.set('platform', 'watchparty');
      return uu.toString();
    }
  } catch (e) {
    return url;
  }
  return url;
}

function rutubePost(iframeEl, payload) {
  if (!iframeEl?.contentWindow) return;
  iframeEl.contentWindow.postMessage(JSON.stringify(payload), '*');
}

export default function Room() {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const { socket, connected } = useContext(SocketContext);
  const playerRef = useRef(null);
  const rutubeIframeRef = useRef(null);
  const [isHost, setIsHost] = useState(false);
  const [video, setVideo] = useState(null); // { provider, url }
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [providerSelect, setProviderSelect] = useState('youtube');
  const [videoUrlInput, setVideoUrlInput] = useState('');
  const [rutubeReady, setRutubeReady] = useState(false);
  const [rutubeDuration, setRutubeDuration] = useState(null);
  const [status, setStatus] = useState('');

  const copyRoomCode = async () => {
    try {
      await navigator.clipboard.writeText(String(roomId).toUpperCase());
      setStatus('Код комнаты скопирован ✅');
      setTimeout(() => setStatus(''), 1400);
    } catch {
      setStatus('Не удалось скопировать код');
      setTimeout(() => setStatus(''), 1400);
    }
  };

  const copyInviteLink = async () => {
    try {
      const url = `${window.location.origin}/room/${String(roomId).toUpperCase()}`;
      await navigator.clipboard.writeText(url);
      setStatus('Ссылка скопирована ✅');
      setTimeout(() => setStatus(''), 1400);
    } catch {
      setStatus('Не удалось скопировать ссылку');
      setTimeout(() => setStatus(''), 1400);
    }
  };

  // Join the room on mount
  useEffect(() => {
    if (!socket || !connected) return;
    socket.emit('joinRoom', { roomId }, (resp) => {
      if (!resp?.ok) {
        alert(resp?.error || 'Комната не найдена');
        navigate('/');
        return;
      }
      setIsHost(resp.hostId === socket.id);
      const st = resp.state || {};
      if (st.video) setVideo(st.video);
      setPlaying(!!st.playing);
      setTime(st.time || 0);
    });
  }, [socket, connected, roomId, navigate]);

  // Handle incoming state updates
  useEffect(() => {
    if (!socket) return;
    const handleStateUpdate = ({ state }) => {
      if (!state) return;
      if (state.video) {
        setVideo(state.video);
      }
      setPlaying(state.playing);
      setTime(state.time);
    };
    socket.on('stateUpdate', handleStateUpdate);
    return () => socket.off('stateUpdate', handleStateUpdate);
  }, [socket]);

  // --- RuTube control via postMessage API ---
  const postToRuTube = useCallback((type, data = {}) => {
    const frame = rutubeIframeRef.current;
    if (!frame || !frame.contentWindow) return;
    frame.contentWindow.postMessage(JSON.stringify({ type, data }), '*');
  }, []);

  // Listen to messages from RuTube iframe (ready, duration, etc.)
  // IMPORTANT: do NOT depend on `video` here — otherwise we might miss the one-time `player:ready` event.
  useEffect(() => {
    const onMessage = (event) => {
      // basic origin filter
      if (typeof event.origin === 'string' && !event.origin.includes('rutube.ru')) return;
      if (typeof event.data !== 'string') return;
      let msg;
      try {
        msg = JSON.parse(event.data);
      } catch {
        return;
      }
      if (!msg?.type) return;
      if (msg.type === 'player:ready') setRutubeReady(true);
      if (msg.type === 'player:durationChange' && typeof msg.data?.duration === 'number') {
        setRutubeDuration(msg.data.duration);
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  // When RuTube video/playing/time changes, apply to the local iframe
  useEffect(() => {
    if (!video || video.provider !== 'rutube') return;
    // Reset ready when changing video URL
    setRutubeReady(false);
    setRutubeDuration(null);
  }, [video?.url]);

  useEffect(() => {
    if (!video || video.provider !== 'rutube') return;
    if (!rutubeReady) return;
    // Sync time first, then play/pause
    postToRuTube('player:setCurrentTime', { time: Math.floor(time) });
    if (playing) postToRuTube('player:play', {});
    else postToRuTube('player:pause', {});
  }, [video, rutubeReady, time, playing, postToRuTube]);

  // For watchers using YouTube, synchronise current time and playing
  useEffect(() => {
    if (!playerRef.current) return;
    if (!video || video.provider !== 'youtube') return;
    const player = playerRef.current;
    const current = player.getCurrentTime?.() || 0;
    if (!isHost) {
      // Seek if drift > 1s
      if (Math.abs(current - time) > 1) {
        player.seekTo(time, 'seconds');
      }
      // Set playing state
      if (playing !== player.isPlaying) {
        // react-player doesn't expose isPlaying; we just rely on playing prop
      }
    }
  }, [video, time, playing, isHost]);

  const handleSetVideo = () => {
    if (!socket) return;
    let url = videoUrlInput.trim();
    if (!url) return;
    let provider = providerSelect;
    if (provider === 'youtube') {
      url = normalizeYouTubeUrl(url);
    } else if (provider === 'rutube') {
      url = normalizeRuTubeUrl(url);
    }
    socket.emit('setVideo', { roomId, provider, url }, (resp) => {
      if (!resp?.ok) {
        alert(resp?.error || 'Не удалось установить видео');
      } else {
        setVideo({ provider, url });
        setVideoUrlInput('');
        setStatus('Видео установлено');
        setTimeout(() => setStatus(''), 1500);
      }
    });
  };

  // Player event handlers for host
  const handleProgress = (progress) => {
    if (!isHost) return;
    // progress.playedSeconds
    setTime(progress.playedSeconds);
  };
  const handlePlay = () => {
    if (!isHost) return;
    if (!socket) return;
    socket.emit('control', { roomId, action: 'play', time });
  };
  const handlePause = () => {
    if (!isHost) return;
    if (!socket) return;
    socket.emit('control', { roomId, action: 'pause', time });
  };
  const handleSeek = (seconds) => {
    if (!isHost) return;
    if (!socket) return;
    setTime(seconds);
    socket.emit('control', { roomId, action: 'seek', time: seconds });
  };

  // Format seconds to mm:ss
  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  // Seek bar for host (simple input range)
  const SeekBar = () => {
    const [current, setCurrent] = useState(time);
    useEffect(() => {
      setCurrent(time);
    }, [time]);
    const handleChange = (e) => {
      const val = parseFloat(e.target.value);
      setCurrent(val);
    };
    const handleMouseUp = () => {
      handleSeek(current);
    };
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <span>{formatTime(current)}</span>
        <input
          type="range"
          min="0"
          max={rutubeDuration ? Math.ceil(rutubeDuration) : 3600}
          step="0.1"
          value={current}
          onChange={handleChange}
          onMouseUp={handleMouseUp}
          style={{ flexGrow: 1 }}
        />
      </div>
    );
  };

  return (
    <div className="container">
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
          <div>
            <h2 style={{ marginBottom: '0.4rem' }}>
              Комната: <span style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace' }}>{String(roomId).toUpperCase()}</span>
            </h2>
            <div className="muted">
              {isHost ? 'Вы хост — вы управляете просмотром.' : 'Вы участник — следуете за хостом.'}
            </div>
            {status && <div style={{ marginTop: '0.65rem' }}><span className="pill">{status}</span></div>}
          </div>

          <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
            <button onClick={copyRoomCode} style={{ padding: '0.55rem 0.85rem' }}>Копировать код</button>
            <button onClick={copyInviteLink} style={{ padding: '0.55rem 0.85rem', background: 'rgba(255,255,255,0.10)' }}>Копировать ссылку</button>
          </div>
        </div>
        {/* Video section */}
        <div style={{ marginTop: '1.35rem' }}>
        {video ? (
          <div>
            {video.provider === 'youtube' ? (
              <ReactPlayer
                ref={playerRef}
                url={video.url}
                playing={playing}
                controls
                onPlay={handlePlay}
                onPause={handlePause}
                onProgress={handleProgress}
                onSeek={(s) => {
                  if (isHost) handleSeek(s);
                }}
                width="100%"
                height="360px"
              />
            ) : (
              <div style={{ position: 'relative', paddingTop: '56.25%' /* 16:9 */ }}>
                <iframe
                  ref={rutubeIframeRef}
                  key={video.url}
                  src={video.url}
                  allow="autoplay; fullscreen; clipboard-write"
                  allowFullScreen
                  style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}
                />
              </div>
            )}

            {/* Controls for host (YouTube: API + optional controls; RuTube: our buttons) */}
            {isHost && (
              <div style={{ marginTop: '1rem' }}>
                <SeekBar />
                <button
                  onClick={() => {
                    if (playing) handlePause();
                    else handlePlay();
                  }}
                  style={{ width: '100%', marginTop: '0.5rem' }}
                >
                  {playing ? 'Пауза' : 'Воспроизвести'}
                </button>
              </div>
            )}
          </div>
        ) : (
          isHost ? (
            <div>
              <h2>Выберите видео</h2>
              <p className="muted" style={{ marginBottom: '0.75rem' }}>YouTube — идеальная синхронизация. RuTube — best effort (через встроенный плеер).</p>
              <select value={providerSelect} onChange={(e) => setProviderSelect(e.target.value)}>
                <option value="youtube">YouTube</option>
                <option value="rutube">RuTube</option>
              </select>
              <input
                type="text"
                placeholder={providerSelect === 'youtube' ? 'YouTube ссылка' : 'RuTube ссылка'}
                value={videoUrlInput}
                onChange={(e) => setVideoUrlInput(e.target.value)}
              />
              <button onClick={handleSetVideo} style={{ width: '100%' }}>Установить</button>
            </div>
          ) : (
            <p>Ожидание выбора видео хостом…</p>
          )
        )}
        </div>
      </div>
    </div>
  );
}