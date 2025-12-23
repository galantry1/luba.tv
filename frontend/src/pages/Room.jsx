import React, { useContext, useEffect, useRef, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import ReactPlayer from "react-player/youtube";
import { SocketContext } from "../App";

function normalizeYouTubeUrl(url) {
  try {
    const u = new URL(url);
    if (u.hostname.includes("youtu.be")) {
      const id = u.pathname.substring(1);
      return `https://www.youtube.com/watch?v=${id}`;
    }
    if (u.hostname.includes("youtube.com")) return url;
  } catch {
    return url;
  }
  return url;
}

function normalizeRuTubeUrl(url) {
  try {
    const u = new URL(url);
    const parts = u.pathname.split("/").filter(Boolean);
    const videoIndex = parts.indexOf("video");
    if (videoIndex !== -1 && parts.length > videoIndex + 1) {
      const id = parts[videoIndex + 1];
      return `https://rutube.ru/play/embed/${id}?platform=watchparty`;
    }
    if (parts[0] === "play" && parts[1] === "embed") {
      const uu = new URL(url);
      if (!uu.searchParams.get("platform")) uu.searchParams.set("platform", "watchparty");
      return uu.toString();
    }
  } catch {
    return url;
  }
  return url;
}

export default function Room() {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const { socket, connected } = useContext(SocketContext);

  const rutubeIframeRef = useRef(null);
  const lastTimeEmitRef = useRef(0);

  const [isHost, setIsHost] = useState(false);
  const [video, setVideo] = useState(null); // { provider, url }
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);

  const [providerSelect, setProviderSelect] = useState("youtube");
  const [videoUrlInput, setVideoUrlInput] = useState("");

  const [rutubeReady, setRutubeReady] = useState(false);
  const [rutubeDuration, setRutubeDuration] = useState(null);

  const [status, setStatus] = useState("");

  const postToRuTube = useCallback((type, data = {}) => {
    const frame = rutubeIframeRef.current;
    if (!frame || !frame.contentWindow) return;
    frame.contentWindow.postMessage(JSON.stringify({ type, data }), "*");
  }, []);

  const rid = String(roomId).toUpperCase();
  const myHostKey = sessionStorage.getItem(`hostKey:${rid}`) || undefined;

  // join room + auto claim host if we have hostKey
  useEffect(() => {
    if (!socket || !connected) return;

    socket.emit("joinRoom", { roomId: rid, hostKey: myHostKey }, (resp) => {
      if (!resp?.ok) {
        alert(resp?.error || "Комната не найдена");
        navigate("/");
        return;
      }

      setIsHost(resp.hostId === socket.id);

      const st = resp.state || {};
      setVideo(st.video || null);
      setPlaying(!!st.playing);
      setTime(st.time || 0);

      // if we created the room earlier -> force reclaim
      if (myHostKey && resp.hostId !== socket.id) {
        socket.emit("claimHost", { roomId: rid, hostKey: myHostKey }, (r2) => {
          if (r2?.ok) {
            setIsHost(true);
            setStatus("Вы стали хостом ✅");
            setTimeout(() => setStatus(""), 1200);
          }
        });
      }
    });
  }, [socket, connected, rid, myHostKey, navigate]);

  // update host in realtime
  useEffect(() => {
    if (!socket) return;

    const onHostUpdate = ({ hostId }) => {
      setIsHost(hostId === socket.id);
    };

    socket.on("hostUpdate", onHostUpdate);
    return () => socket.off("hostUpdate", onHostUpdate);
  }, [socket]);

  // state updates
  useEffect(() => {
    if (!socket) return;
    const handleStateUpdate = ({ state }) => {
      if (!state) return;
      setVideo(state.video || null);
      setPlaying(!!state.playing);
      setTime(state.time || 0);
    };
    socket.on("stateUpdate", handleStateUpdate);
    return () => socket.off("stateUpdate", handleStateUpdate);
  }, [socket]);

  // rutube events
  useEffect(() => {
    const onMessage = (event) => {
      if (typeof event.origin === "string" && !event.origin.includes("rutube.ru")) return;
      if (typeof event.data !== "string") return;

      let msg;
      try {
        msg = JSON.parse(event.data);
      } catch {
        return;
      }
      if (!msg?.type) return;

      if (msg.type === "player:ready") setRutubeReady(true);
      if (msg.type === "player:durationChange" && typeof msg.data?.duration === "number") {
        setRutubeDuration(msg.data.duration);
      }
    };

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  // reset rutube flags on url change
  useEffect(() => {
    if (!video || video.provider !== "rutube") return;
    setRutubeReady(false);
    setRutubeDuration(null);
  }, [video?.url]);

  // apply state to rutube iframe
  useEffect(() => {
    if (!video || video.provider !== "rutube") return;
    if (!rutubeReady) return;

    postToRuTube("player:setCurrentTime", { time: Math.floor(time) });
    if (playing) postToRuTube("player:play", {});
    else postToRuTube("player:pause", {});
  }, [video, rutubeReady, time, playing, postToRuTube]);

  const handleSetVideo = () => {
    if (!socket) return;

    let url = videoUrlInput.trim();
    if (!url) return;

    const provider = providerSelect;
    if (provider === "youtube") url = normalizeYouTubeUrl(url);
    if (provider === "rutube") url = normalizeRuTubeUrl(url);

    socket.emit("setVideo", { roomId: rid, provider, url }, (resp) => {
      if (!resp?.ok) {
        alert(resp?.error || "Не удалось установить видео");
        return;
      }
      setVideo({ provider, url });
      setVideoUrlInput("");
      setStatus("Видео установлено ✅");
      setTimeout(() => setStatus(""), 1200);
    });
  };

  const handlePlay = () => {
    if (!isHost || !socket) return;
    socket.emit("control", { roomId: rid, action: "play", time });
  };

  const handlePause = () => {
    if (!isHost || !socket) return;
    socket.emit("control", { roomId: rid, action: "pause", time });
  };

  const handleSeek = (seconds) => {
    if (!isHost || !socket) return;
    setTime(seconds);
    socket.emit("control", { roomId: rid, action: "seek", time: seconds });
  };

  // host sends time ticks (works for YouTube progress)
  const onYouTubeProgress = (progress) => {
    if (!isHost) return;
    const t = progress.playedSeconds || 0;
    setTime(t);

    const now = Date.now();
    if (socket && playing && now - lastTimeEmitRef.current > 1000) {
      lastTimeEmitRef.current = now;
      socket.emit("control", { roomId: rid, action: "seek", time: t });
    }
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  };

  const SeekBar = () => {
    const [current, setCurrent] = useState(time);
    useEffect(() => setCurrent(time), [time]);

    const onChange = (e) => setCurrent(parseFloat(e.target.value));
    const onCommit = () => handleSeek(current);

    return (
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ width: 60, opacity: 0.85 }}>{formatTime(current)}</span>
        <input
          type="range"
          min="0"
          max={rutubeDuration ? Math.ceil(rutubeDuration) : 3600}
          step="0.1"
          value={current}
          onChange={onChange}
          onMouseUp={onCommit}
          onTouchEnd={onCommit}
          style={{ flex: 1 }}
        />
      </div>
    );
  };

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: 24 }}>
      <div
        style={{
          padding: 18,
          borderRadius: 18,
          background: "rgba(255,255,255,0.06)",
          border: "1px solid rgba(255,255,255,0.10)",
          backdropFilter: "blur(10px)",
          boxShadow: "0 10px 40px rgba(0,0,0,0.35)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 900 }}>
              Комната:{" "}
              <span style={{ fontFamily: "ui-monospace, Menlo, Monaco, Consolas, monospace" }}>
                {rid}
              </span>
            </div>
            <div style={{ opacity: 0.8, marginTop: 6 }}>
              {isHost ? "Вы хост — вы управляете просмотром." : "Вы участник — следуете за хостом."}
            </div>
            {status && <div style={{ marginTop: 10, opacity: 0.9 }}>{status}</div>}
          </div>
        </div>

        <div style={{ marginTop: 16 }}>
          {!video ? (
            isHost ? (
              <div style={{ display: "grid", gap: 10 }}>
                <div style={{ fontWeight: 900, fontSize: 16 }}>Вставьте ссылку</div>

                <select value={providerSelect} onChange={(e) => setProviderSelect(e.target.value)} style={{ padding: 12, borderRadius: 12 }}>
                  <option value="youtube">YouTube</option>
                  <option value="rutube">RuTube</option>
                </select>

                <input
                  value={videoUrlInput}
                  onChange={(e) => setVideoUrlInput(e.target.value)}
                  placeholder={providerSelect === "youtube" ? "YouTube ссылка" : "RuTube ссылка"}
                  style={{ padding: 12, borderRadius: 12 }}
                />

                <button onClick={handleSetVideo} style={{ padding: 12, borderRadius: 12 }}>
                  Запустить для всех
                </button>
              </div>
            ) : (
              <div style={{ opacity: 0.85 }}>Ожидание выбора видео хостом…</div>
            )
          ) : (
            <div style={{ display: "grid", gap: 12 }}>
              {video.provider === "youtube" ? (
                <ReactPlayer
                  url={video.url}
                  playing={playing}
                  controls
                  onPlay={handlePlay}
                  onPause={handlePause}
                  onProgress={onYouTubeProgress}
                  onSeek={(s) => isHost && handleSeek(s)}
                  width="100%"
                  height="420px"
                />
              ) : (
                <div style={{ position: "relative", paddingTop: "56.25%" }}>
                  <iframe
                    ref={rutubeIframeRef}
                    key={video.url}
                    src={video.url}
                    allow="autoplay; fullscreen; clipboard-write"
                    allowFullScreen
                    style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", border: 0 }}
                  />
                </div>
              )}

              {isHost && (
                <div style={{ display: "grid", gap: 10 }}>
                  <SeekBar />
                  <button
                    onClick={() => (playing ? handlePause() : handlePlay())}
                    style={{
                      padding: 12,
                      borderRadius: 12,
                      background: "linear-gradient(135deg, rgba(124,58,237,0.65), rgba(6,182,212,0.40))",
                      color: "white",
                      fontWeight: 900,
                    }}
                  >
                    {playing ? "Пауза" : "Воспроизвести"}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
