import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlarmClock,
  ArrowLeft,
  Ban,
  Bell,
  BookOpen,
  CheckCircle2,
  Coffee,
  FileVideo,
  Hourglass,
  Maximize2,
  Minimize2,
  Music4,
  Pause,
  Play,
  RotateCcw,
  Trash2,
  Upload,
  Volume2,
  X,
  Youtube,
} from "lucide-react";
import { useStore } from "../store/store";
import { useToasts } from "../store/toasts";
import { Field, Select, useI18n } from "../components/ui";
import { formatClock, formatPrecise, todayKey } from "../lib/utils";
import {
  deleteCustomAlarm,
  primeAudio,
  saveCustomAlarm,
  startAlarm,
  stopAlarm,
} from "../lib/alarm";
import type { AlarmId, StudyMode } from "../types";

const PRESETS = [5, 10, 15, 25, 45, 60, 90];

function youtubeId(url: string): string | null {
  const value = url.trim();
  if (!value) return null;
  const patterns = [
    /youtu\.be\/([\w-]{6,})/i,
    /[?&]v=([\w-]{6,})/i,
    /embed\/([\w-]{6,})/i,
    /shorts\/([\w-]{6,})/i,
    /live\/([\w-]{6,})/i,
  ];
  for (const re of patterns) {
    const m = value.match(re);
    if (m) return m[1];
  }
  if (/^[\w-]{11}$/.test(value)) return value;
  return null;
}

export default function TimerPage() {
  const { t, lang } = useI18n();
  const settings = useStore((s) => s.settings);
  const updateSettings = useStore((s) => s.updateSettings);
  const daily = useStore((s) => s.daily);
  const leisure = useStore((s) => s.leisure);
  const pushToast = useToasts((s) => s.push);
  const addModeTime = useStore((s) => s.addModeTime);

  const initialMode: StudyMode = settings.timerMode || "study";
  const initialTotal = Math.max(
    0,
    Math.round((settings.timerModeMinutes[initialMode] ?? 0) * 60),
  );
  const [timerMode, setTimerMode] = useState<StudyMode>(initialMode);
  const [hours, setHours] = useState(Math.floor(initialTotal / 3600));
  const [minutes, setMinutes] = useState(
    Math.floor((initialTotal % 3600) / 60),
  );
  const [seconds, setSeconds] = useState(initialTotal % 60);
  const [remaining, setRemaining] = useState(initialTotal);
  const [sessionTotal, setSessionTotal] = useState(initialTotal);
  const [running, setRunning] = useState(false);
  const [started, setStarted] = useState(false);
  const [endAt, setEndAt] = useState<number | null>(null);
  const [finished, setFinished] = useState(false);
  const [immersive, setImmersive] = useState(false);
  const [alarm, setAlarm] = useState<AlarmId>(settings.timerAlarm);
  const [volume, setVolume] = useState(settings.timerVolume);
  const [customName, setCustomName] = useState(settings.timerCustomAlarmName);
  const [videoInput, setVideoInput] = useState(settings.timerVideoUrl);
  const [activeVideo, setActiveVideo] = useState(settings.timerVideoUrl);
  const [videoError, setVideoError] = useState("");
  const [localVideo, setLocalVideo] = useState<string | null>(null);
  const [localName, setLocalName] = useState("");
  const pageRef = useRef<HTMLDivElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const localVideoRef = useRef<HTMLInputElement>(null);
  const alarmInputRef = useRef<HTMLInputElement>(null);
  const localUrlRef = useRef<string | null>(null);
  const testTimerRef = useRef<number | null>(null);
  const timerModeRef = useRef<StudyMode>(initialMode);
  const pendingMsRef = useRef(0);
  type TimerSnapshot = {
    hours: number;
    minutes: number;
    seconds: number;
    remaining: number;
    total: number;
    started: boolean;
  };
  const snapshots = useRef<Partial<Record<StudyMode, TimerSnapshot>>>({});

  const durationSec = hours * 3600 + minutes * 60 + seconds;
  const videoId = useMemo(() => youtubeId(activeVideo), [activeVideo]);
  const progress =
    sessionTotal > 0
      ? Math.min(100, ((sessionTotal - remaining) / sessionTotal) * 100)
      : 0;
  const ringSize = 280;
  const ringR = 124;
  const ringC = 2 * Math.PI * ringR;

  const todayStudy = daily[todayKey()] || 0;
  const todayLeisure = leisure[todayKey()] || 0;

  const modeOptions: Array<{
    id: StudyMode;
    icon: JSX.Element;
    label: string;
  }> = [
    { id: "study", icon: <BookOpen size={15} />, label: t("watch.modeStudy") },
    {
      id: "leisure",
      icon: <Coffee size={15} />,
      label: t("watch.modeLeisure"),
    },
    { id: "none", icon: <Ban size={15} />, label: t("watch.modeNone") },
  ];
  const activeMode = modeOptions.find((m) => m.id === timerMode)!;

  /* Keep settings in sync with the controls */
  useEffect(() => {
    updateSettings({
      timerAlarm: alarm,
      timerVolume: volume,
      timerCustomAlarmName: customName,
    });
  }, [alarm, volume, customName, updateSettings]);

  useEffect(() => {
    return () => {
      if (localUrlRef.current) URL.revokeObjectURL(localUrlRef.current);
      if (testTimerRef.current != null)
        window.clearTimeout(testTimerRef.current);
      stopAlarm();
    };
  }, []);

  useEffect(() => {
    if (!immersive) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [immersive]);

  /* Keep the mode ref in sync for the accounting interval */
  useEffect(() => {
    timerModeRef.current = timerMode;
  }, [timerMode]);

  /* Credit running timer time to the selected mode (study / leisure) */
  const flushModeTime = useCallback(() => {
    if (timerModeRef.current === "none") {
      pendingMsRef.current = 0;
      return;
    }
    const secs = Math.floor(pendingMsRef.current / 1000);
    if (secs <= 0) return;
    pendingMsRef.current -= secs * 1000;
    addModeTime(secs, timerModeRef.current);
  }, [addModeTime]);

  /* Account for real elapsed time even while another tab/window is in front.
     Wall-clock deltas keep the count accurate when background tabs throttle timers. */
  useEffect(() => {
    if (!running || timerMode === "none") return;
    const limit = endAt ?? Number.POSITIVE_INFINITY;
    let last = Date.now();
    const credit = () => {
      const now = Math.min(Date.now(), limit);
      if (now <= last) return;
      pendingMsRef.current += now - last;
      last = now;
    };
    const tick = window.setInterval(credit, 1000);
    const flush = window.setInterval(flushModeTime, 5000);
    const onHide = () => {
      credit();
      flushModeTime();
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onHide);
    return () => {
      window.clearInterval(tick);
      window.clearInterval(flush);
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onHide);
      credit();
      flushModeTime();
    };
  }, [running, endAt, timerMode, flushModeTime]);

  /* Countdown — based on an absolute end time so it never drifts */
  useEffect(() => {
    if (!running || !endAt) return;
    const tick = () => {
      const left = Math.max(0, Math.ceil((endAt - Date.now()) / 1000));
      setRemaining(left);
      if (left <= 0) {
        setRunning(false);
        setStarted(false);
        setEndAt(null);
        setFinished(true);
        flushModeTime();
        pushToast(t("toast.timerDone"), "info");
      }
    };
    tick();
    const id = window.setInterval(tick, 250);
    return () => window.clearInterval(id);
  }, [running, endAt, flushModeTime, pushToast, t]);

  /* Loud alarm while the finished overlay is visible */
  useEffect(() => {
    if (!finished) return;
    let active = true;
    primeAudio()
      .then(() => startAlarm(alarm, volume))
      .then((ok) => {
        if (!ok && active) {
          pushToast(t("toast.alarmFallback"), "info");
          startAlarm("bell", volume);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
      stopAlarm();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finished]);

  /* Keep the screen awake while running (when supported) */
  useEffect(() => {
    let wakeLock: any = null;
    let disposed = false;
    const request = async () => {
      try {
        if ("wakeLock" in navigator && running && !disposed) {
          wakeLock = await (navigator as any).wakeLock.request("screen");
        }
      } catch {
        /* not supported / denied */
      }
    };
    if (running) request();
    const onVisible = () => {
      if (document.visibilityState === "visible" && running) request();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", onVisible);
      try {
        wakeLock?.release?.();
      } catch {
        /* ignore */
      }
    };
  }, [running]);

  const changeTimerMode = (next: StudyMode) => {
    if (next === timerMode) return;
    flushModeTime();
    snapshots.current[timerMode] = {
      hours,
      minutes,
      seconds,
      remaining,
      total: sessionTotal,
      started,
    };
    setRunning(false);
    setEndAt(null);
    setFinished(false);
    stopAlarm();

    if (next === "none") {
      setHours(0);
      setMinutes(0);
      setSeconds(0);
      setRemaining(0);
      setSessionTotal(0);
      setStarted(false);
    } else {
      const saved = snapshots.current[next];
      const targetMinutes = Math.max(
        0,
        Math.round(settings.timerModeMinutes[next] ?? 0),
      );
      if (saved) {
        setHours(saved.hours);
        setMinutes(saved.minutes);
        setSeconds(saved.seconds);
        setRemaining(saved.remaining);
        setSessionTotal(saved.total);
        setStarted(saved.started);
      } else {
        const total = targetMinutes * 60;
        setHours(Math.floor(total / 3600));
        setMinutes(Math.floor((total % 3600) / 60));
        setSeconds(total % 60);
        setRemaining(total);
        setSessionTotal(total);
        setStarted(false);
      }
    }

    setTimerMode(next);
    timerModeRef.current = next;
    updateSettings({ timerMode: next });
  };

  const setDuration = (h: number, m: number, s: number) => {
    if (timerMode === "none") return;
    const safeH = Math.max(0, Math.min(23, Math.round(h || 0)));
    const safeM = Math.max(0, Math.min(59, Math.round(m || 0)));
    const safeS = Math.max(0, Math.min(59, Math.round(s || 0)));
    const total = safeH * 3600 + safeM * 60 + safeS;
    setHours(safeH);
    setMinutes(safeM);
    setSeconds(safeS);
    setRemaining(total);
    setSessionTotal(total);
    setStarted(false);
    setFinished(false);
    setRunning(false);
    setEndAt(null);
    stopAlarm();
    const totalMinutes = Math.max(0, Math.round(total / 60));
    updateSettings({
      timerModeMinutes: {
        ...settings.timerModeMinutes,
        [timerMode]: totalMinutes,
      },
      ...(timerMode === "study"
        ? { timerMinutes: Math.max(1, totalMinutes) }
        : {}),
    });
  };

  const resetTimer = () => {
    flushModeTime();
    stopAlarm();
    setFinished(false);
    setRunning(false);
    setStarted(false);
    setEndAt(null);
    const total = durationSec > 0 ? durationSec : sessionTotal;
    setRemaining(total);
    setSessionTotal(total);
  };

  const toggleTimer = async () => {
    if (running) {
      flushModeTime();
      setRunning(false);
      setEndAt(null);
      setStarted(true);
      return;
    }
    const total = started && remaining > 0 ? remaining : durationSec;
    if (total <= 0 || timerMode === "none") return;
    await primeAudio();
    stopAlarm();
    setFinished(false);
    setSessionTotal(started ? sessionTotal : total);
    setRemaining(total);
    setStarted(true);
    setEndAt(Date.now() + total * 1000);
    setRunning(true);
  };

  const openVideo = () => {
    const value = videoInput.trim();
    if (!value) {
      setVideoError(t("timer.noVideo"));
      return;
    }
    if (youtubeId(value)) {
      setVideoError("");
      setActiveVideo(value);
      updateSettings({ timerVideoUrl: value });
      setLocalVideo(null);
      return;
    }
    if (/^https?:\/\//i.test(value)) {
      setVideoError("");
      setActiveVideo(value);
      updateSettings({ timerVideoUrl: value });
      setLocalVideo(null);
      return;
    }
    setVideoError(t("timer.noVideo"));
  };

  const chooseLocalVideo = (file: File | undefined) => {
    if (!file) return;
    if (localUrlRef.current) URL.revokeObjectURL(localUrlRef.current);
    const url = URL.createObjectURL(file);
    localUrlRef.current = url;
    setLocalVideo(url);
    setLocalName(file.name);
    setVideoError("");
    setActiveVideo("");
  };

  const closeVideo = () => {
    if (localUrlRef.current) URL.revokeObjectURL(localUrlRef.current);
    localUrlRef.current = null;
    setLocalVideo(null);
    setLocalName("");
    setActiveVideo("");
  };

  const onAlarmChange = (value: string) => {
    setAlarm(value as AlarmId);
  };

  const testAlarm = async () => {
    await primeAudio();
    stopAlarm();
    const ok = await startAlarm(alarm, volume);
    if (!ok) {
      pushToast(t("timer.customMissing"), "error");
      await startAlarm("bell", volume);
    } else {
      pushToast(t("timer.soundTested"), "info");
    }
    if (testTimerRef.current != null) window.clearTimeout(testTimerRef.current);
    testTimerRef.current = window.setTimeout(() => stopAlarm(), 2600);
  };

  const uploadAlarm = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > 15 * 1024 * 1024) {
      pushToast(t("toast.fileTooBig"), "error");
      return;
    }
    try {
      await saveCustomAlarm(file);
      setCustomName(file.name);
      setAlarm("custom");
      updateSettings({ timerCustomAlarmName: file.name, timerAlarm: "custom" });
      pushToast(t("toast.customAlarmSaved"));
    } catch {
      pushToast(t("toast.customAlarmError"), "error");
    }
  };

  const removeCustom = async () => {
    await deleteCustomAlarm();
    setCustomName("");
    if (alarm === "custom") setAlarm("chime");
    pushToast(t("timer.customRemoved"), "info");
  };

  const toggleImmersive = async () => {
    const next = !immersive;
    setImmersive(next);
    try {
      if (next && !document.fullscreenElement)
        await pageRef.current?.requestFullscreen?.();
      else if (!next && document.fullscreenElement)
        await document.exitFullscreen();
    } catch {
      /* fall back to CSS immersive mode */
    }
  };

  useEffect(() => {
    const onChange = () => setImmersive(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const status = finished
    ? t("timer.finishedTitle")
    : running
      ? t("timer.running")
      : started
        ? t("timer.paused")
        : t("timer.ready");

  return (
    <div ref={pageRef} className={`timer-page ${immersive ? "immersive" : ""}`}>
      <div className="timer-top">
        {!immersive ? (
          <Link to="/" className="back-link">
            <ArrowLeft size={16} className="rtl-flip" /> {t("nav.home")}
          </Link>
        ) : (
          <span />
        )}
        <span
          className={`timer-status ${running ? "running" : finished ? "done" : ""}`}
        >
          <span className="pulse-dot" /> {status}
        </span>
        <button className="btn btn-ghost btn-sm" onClick={toggleImmersive}>
          {immersive ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          {immersive ? t("timer.exitFullscreen") : t("timer.fullscreen")}
        </button>
      </div>

      <div className="timer-head">
        <div>
          <h1 className="page-title">
            <AlarmClock size={26} /> {t("timer.title")}
          </h1>
          <p className="page-sub">{t("timer.subtitle")}</p>
        </div>
        <div className="timer-today">
          <span>
            <CheckCircle2 size={14} /> {t("watch.studyToday")}:{" "}
            <strong>{formatPrecise(todayStudy, lang)}</strong>
          </span>
          <span>
            <Coffee size={14} /> {t("watch.leisureToday")}:{" "}
            <strong>{formatPrecise(todayLeisure, lang)}</strong>
          </span>
        </div>
      </div>

      <div className="timer-grid">
        <section className="timer-stage panel">
          <div className="timer-mode-bar">
            <div className="timer-mode-head">
              <span className="timer-mode-label">
                <Hourglass size={14} /> {t("timer.mode")}
              </span>
              <span className={`mode-current ${timerMode}`}>
                {activeMode.icon} {activeMode.label}
              </span>
            </div>
            <div className="mode-switch timer-mode-switch">
              {modeOptions.map((opt) => (
                <button
                  key={opt.id}
                  className={`mode-opt ${opt.id} ${timerMode === opt.id ? "active" : ""}`}
                  onClick={() => changeTimerMode(opt.id)}
                  aria-pressed={timerMode === opt.id}
                >
                  {opt.icon}
                  <span>{opt.label}</span>
                </button>
              ))}
            </div>
            <p className="field-hint">
              {timerMode === "none" ? t("timer.noneHint") : t("timer.modeAuto")}
            </p>
          </div>

          <div className="timer-clock-wrap">
            <svg
              className="timer-ring-svg"
              viewBox={`0 0 ${ringSize} ${ringSize}`}
            >
              <circle
                cx={ringSize / 2}
                cy={ringSize / 2}
                r={ringR}
                fill="none"
                stroke="var(--ring-track)"
                strokeWidth="9"
              />
              <circle
                cx={ringSize / 2}
                cy={ringSize / 2}
                r={ringR}
                fill="none"
                stroke="url(#timerGrad)"
                strokeWidth="9"
                strokeLinecap="round"
                strokeDasharray={ringC}
                strokeDashoffset={ringC - (ringC * progress) / 100}
                transform={`rotate(-90 ${ringSize / 2} ${ringSize / 2})`}
                style={{ transition: "stroke-dashoffset .35s linear" }}
              />
              <defs>
                <linearGradient id="timerGrad" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0" stopColor="var(--accent)" />
                  <stop offset="1" stopColor="var(--accent-2)" />
                </linearGradient>
              </defs>
            </svg>
            <div className="timer-clock">
              <span className="timer-clock-label">
                {running ? t("timer.remaining") : t("timer.duration")}
              </span>
              <strong className="mono">
                {formatClock(
                  running || started || finished ? remaining : durationSec,
                )}
              </strong>
              <span className="timer-clock-sub">
                {running
                  ? `${Math.round(progress)}%`
                  : `${t("timer.elapsed")}: ${formatClock(sessionTotal - remaining)}`}
              </span>
            </div>
          </div>

          <div className="timer-actions">
            <button
              className="btn btn-primary timer-main-btn"
              onClick={toggleTimer}
              disabled={timerMode === "none" || (durationSec <= 0 && !started)}
            >
              {running ? (
                <Pause size={20} fill="currentColor" />
              ) : (
                <Play size={20} fill="currentColor" />
              )}
              {running
                ? t("timer.pause")
                : started && remaining > 0
                  ? t("timer.resume")
                  : t("timer.start")}
            </button>
            <button
              className="btn btn-secondary"
              onClick={resetTimer}
              disabled={!started && !running && !finished}
            >
              <RotateCcw size={17} /> {t("timer.reset")}
            </button>
          </div>

          <div className="timer-duration">
            <div className="section-head">
              <h2>
                <Hourglass size={18} /> {t("timer.duration")}
              </h2>
              <span className={`timer-adds-to ${timerMode}`}>
                {timerMode === "none"
                  ? t("timer.noneHint")
                  : t("timer.addsTo", { mode: activeMode.label })}
              </span>
            </div>
            <div className="timer-presets">
              {PRESETS.map((p) => (
                <button
                  key={p}
                  className={`chip ${durationSec === p * 60 ? "active" : ""}`}
                  onClick={() => setDuration(0, p, 0)}
                  disabled={running || timerMode === "none"}
                >
                  {p} {t("common.min")}
                </button>
              ))}
            </div>
            <div className="grid-3 timer-num-grid">
              <Field label={t("timer.hours")}>
                <input
                  className="input mono"
                  type="number"
                  min={0}
                  max={23}
                  value={hours}
                  disabled={running || timerMode === "none"}
                  onChange={(e) =>
                    setDuration(Number(e.target.value), minutes, seconds)
                  }
                />
              </Field>
              <Field label={t("timer.minutes")}>
                <input
                  className="input mono"
                  type="number"
                  min={0}
                  max={59}
                  value={minutes}
                  disabled={running || timerMode === "none"}
                  onChange={(e) =>
                    setDuration(hours, Number(e.target.value), seconds)
                  }
                />
              </Field>
              <Field label={t("timer.seconds")}>
                <input
                  className="input mono"
                  type="number"
                  min={0}
                  max={59}
                  value={seconds}
                  disabled={running || timerMode === "none"}
                  onChange={(e) =>
                    setDuration(hours, minutes, Number(e.target.value))
                  }
                />
              </Field>
            </div>
          </div>
        </section>

        <aside className="timer-side">
          <section className="panel timer-video-panel">
            <div className="section-head">
              <h2>
                <Youtube size={18} /> {t("timer.video")}
              </h2>
              {(activeVideo || localVideo) && (
                <button
                  className="icon-btn icon-btn-sm"
                  onClick={closeVideo}
                  title={t("timer.closeVideo")}
                >
                  <X size={16} />
                </button>
              )}
            </div>
            <p className="muted small-text">{t("timer.videoDesc")}</p>
            <div className="input-row">
              <input
                ref={videoInputRef}
                className="input"
                dir="ltr"
                value={videoInput}
                onChange={(e) => setVideoInput(e.target.value)}
                placeholder={t("timer.videoPlaceholder")}
                onKeyDown={(e) => {
                  if (e.key === "Enter") openVideo();
                }}
              />
              <button className="btn btn-secondary" onClick={openVideo}>
                <Play size={16} /> {t("timer.openVideo")}
              </button>
            </div>
            <div className="timer-video-actions">
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => localVideoRef.current?.click()}
              >
                <FileVideo size={15} /> {t("timer.localVideo")}
              </button>
              {localName && (
                <span className="muted small-text">{localName}</span>
              )}
              <input
                ref={localVideoRef}
                type="file"
                accept="video/*"
                hidden
                onChange={(e) => {
                  chooseLocalVideo(e.target.files?.[0]);
                  e.currentTarget.value = "";
                }}
              />
            </div>
            {videoError && <p className="timer-video-error">{videoError}</p>}

            <div className="timer-video-frame">
              {localVideo ? (
                <video
                  src={localVideo}
                  controls
                  playsInline
                  className="timer-native-video"
                />
              ) : videoId ? (
                <iframe
                  src={`https://www.youtube.com/embed/${videoId}?rel=0&modestbranding=1`}
                  title={t("timer.video")}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              ) : activeVideo ? (
                <video
                  src={activeVideo}
                  controls
                  playsInline
                  className="timer-native-video"
                />
              ) : (
                <div className="timer-video-empty">
                  <Youtube size={28} />
                  <span>{t("timer.noVideo")}</span>
                </div>
              )}
            </div>
          </section>

          <section className="panel timer-alarm-panel">
            <div className="section-head">
              <h2>
                <Bell size={18} /> {t("timer.alarm")}
              </h2>
              <span className="muted small-text">{t("timer.alarmDesc")}</span>
            </div>

            <Field label={t("timer.alarm")}>
              <Select
                value={alarm}
                onChange={onAlarmChange}
                options={[
                  { value: "chime", label: t("timer.alarmChime") },
                  { value: "bell", label: t("timer.alarmBell") },
                  { value: "digital", label: t("timer.alarmDigital") },
                  { value: "siren", label: t("timer.alarmSiren") },
                  {
                    value: "custom",
                    label: customName
                      ? `${t("timer.alarmCustom")} — ${customName}`
                      : t("timer.alarmCustom"),
                  },
                ]}
              />
            </Field>

            <Field
              label={`${t("timer.volume")} — ${Math.round(volume * 100)}%`}
            >
              <div className="timer-volume">
                <Volume2 size={17} />
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={volume}
                  onChange={(e) => setVolume(Number(e.target.value))}
                />
              </div>
            </Field>

            <div className="timer-alarm-actions">
              <button className="btn btn-secondary btn-sm" onClick={testAlarm}>
                <Music4 size={15} /> {t("timer.test")}
              </button>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => alarmInputRef.current?.click()}
              >
                <Upload size={15} /> {t("timer.upload")}
              </button>
              <input
                ref={alarmInputRef}
                type="file"
                accept="audio/*"
                hidden
                onChange={(e) => {
                  uploadAlarm(e.target.files?.[0]);
                  e.currentTarget.value = "";
                }}
              />
              {customName && (
                <button
                  className="icon-btn icon-btn-sm"
                  onClick={removeCustom}
                  title={t("common.delete")}
                >
                  <Trash2 size={15} />
                </button>
              )}
            </div>
            {alarm === "custom" && !customName && (
              <p className="timer-video-error">{t("timer.noCustom")}</p>
            )}
            <p className="field-hint">{t("timer.uploadHint")}</p>
          </section>

          <section className="panel timer-tips-panel">
            <span className="timer-tip-icon">
              <AlarmClock size={18} />
            </span>
            <div>
              <strong>{t("timer.wakeLock")}</strong>
              <p>{t("timer.bgHint")}</p>
            </div>
          </section>
        </aside>
      </div>

      {finished && (
        <div className="timer-done-overlay">
          <div className="timer-done-card">
            <span className="timer-done-icon">⏰</span>
            <h2>{t("timer.finishedTitle")}</h2>
            <p>{t("timer.finishedDesc")}</p>
            <div className="timer-done-actions">
              <button
                className="btn btn-primary"
                onClick={() => {
                  stopAlarm();
                  setFinished(false);
                }}
              >
                {t("timer.dismiss")}
              </button>
              <button
                className="btn btn-secondary"
                onClick={() => {
                  stopAlarm();
                  setFinished(false);
                  resetTimer();
                }}
              >
                <RotateCcw size={16} /> {t("timer.reset")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
