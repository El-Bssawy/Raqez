import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  AlertTriangle,
  ArrowLeft,
  Ban,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Coffee,
  ExternalLink,
  FileVideo,
  Flame,
  ListVideo,
  NotebookPen,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Share2,
  Sparkles,
  Timer,
  Trash2,
  X,
} from "lucide-react";
import { useStore } from "../store/store";
import { useUI } from "../store/ui";
import { useToasts } from "../store/toasts";
import { useI18n, EmptyState, ProgressRing } from "../components/ui";
import { loadYouTubeAPI, youtubeWatchUrl } from "../lib/youtube";
import {
  computeStreak,
  courseStats,
  formatClock,
  formatPrecise,
  todaySeconds,
} from "../lib/utils";
import type { Course, Lesson, StudyMode } from "../types";

export default function WatchPage() {
  const { courseId, lessonId } = useParams();
  const course = useStore((s) => s.courses.find((c) => c.id === courseId));
  const lesson = course?.lessons.find((l) => l.id === lessonId);
  const { t } = useI18n();

  if (!course || !lesson) {
    return (
      <div className="panel">
        <EmptyState
          icon={<ListVideo size={30} />}
          title={t("course.notFound")}
          desc={t("course.notFoundDesc")}
          action={
            <Link to="/library" className="btn btn-primary">
              {t("course.backToLibrary")}
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <WatchView
      key={`${course.id}-${lesson.id}`}
      course={course}
      lesson={lesson}
    />
  );
}

function WatchView({ course, lesson }: { course: Course; lesson: Lesson }) {
  const navigate = useNavigate();
  const { t, lang } = useI18n();
  const pushToast = useToasts((s) => s.push);
  const settings = useStore((s) => s.settings);
  const updateSettings = useStore((s) => s.updateSettings);
  const addNote = useStore((s) => s.addNote);
  const deleteNote = useStore((s) => s.deleteNote);
  const setLessonComplete = useStore((s) => s.setLessonComplete);
  const openShare = useUI((s) => s.openShare);
  const daily = useStore((s) => s.daily);
  const leisure = useStore((s) => s.leisure);

  const index = course.lessons.findIndex((l) => l.id === lesson.id);
  const next = course.lessons[index + 1];
  const prev = course.lessons[index - 1];
  const stats = useMemo(() => courseStats(course), [course]);
  const today = todaySeconds(daily);
  const todayLeisure = todaySeconds(leisure);
  const streak = computeStreak(daily);

  const [localUrl, setLocalUrl] = useState<string | null>(null);
  const [localName, setLocalName] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const localUrlRef = useRef<string | null>(null);

  const isYT = lesson.kind === "youtube" && !!lesson.videoId && !localUrl;
  const isNative = !!localUrl || lesson.kind === "video";
  const isLink = !localUrl && lesson.kind === "link";

  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(lesson.position || 0);
  const [duration, setDuration] = useState(lesson.duration || 0);
  const [unavailable, setUnavailable] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(true);
  const [session, setSession] = useState(0);
  const [noteText, setNoteText] = useState("");
  const [attachTime, setAttachTime] = useState(true);
  const [mode, setMode] = useState<StudyMode>(course.mode || "study");

  const ytHostRef = useRef<HTMLDivElement>(null);
  const ytRef = useRef<any>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const playingRef = useRef(false);
  const currentTimeRef = useRef(lesson.position || 0);
  const pendingRef = useRef(0);
  const flushRef = useRef<() => void>(() => {});
  const restoredRef = useRef(false);
  const modeRef = useRef<StudyMode>(mode);
  const pomoRunRef = useRef(false);
  const pomoPhaseRef = useRef<"work" | "break">("work");

  useEffect(() => {
    currentTimeRef.current = currentTime;
  }, [currentTime]);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  const getTime = () => currentTimeRef.current;

  /* ---------------- progress saving ---------------- */

  const flush = useCallback(() => {
    const seconds = pendingRef.current;
    const position = Math.round(currentTimeRef.current);
    if (seconds <= 0 && position <= 0) return;
    pendingRef.current = 0;
    const result = useStore
      .getState()
      .recordProgress(course.id, lesson.id, seconds, position, false, mode);
    if (result.completedNow) pushToast(t("toast.lessonCompleted"));
    if (result.goalReached) pushToast(t("toast.goalReached"));
  }, [course.id, lesson.id, pushToast, t, mode]);
  flushRef.current = flush;

  useEffect(() => {
    const id = setInterval(() => flushRef.current(), 5000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    return () => {
      flushRef.current();
      if (localUrlRef.current) URL.revokeObjectURL(localUrlRef.current);
    };
  }, []);

  useEffect(() => {
    const id = setInterval(() => {
      // Time counts while the video plays (only when visible), or while a
      // focus (work) pomodoro is running even if the video is paused.
      const pomoCounting =
        pomoRunRef.current &&
        pomoPhaseRef.current === "work" &&
        modeRef.current !== "none";
      const videoCounting = playingRef.current && !document.hidden;
      if (videoCounting || pomoCounting) {
        pendingRef.current += 1;
        setSession((s) => s + 1);
      }
    }, 1000);
    return () => clearInterval(id);
  }, []);

  /* ---------------- youtube ---------------- */

  useEffect(() => {
    if (!isYT) return;
    const host = ytHostRef.current;
    if (!host) return;
    let cancelled = false;
    host.innerHTML = "";
    const inner = document.createElement("div");
    inner.className = "yt-inner";
    host.appendChild(inner);

    loadYouTubeAPI()
      .then((YT) => {
        if (cancelled) return;
        const player = new YT.Player(inner, {
          videoId: lesson.videoId,
          playerVars: {
            autoplay: 0,
            controls: 1,
            rel: 0,
            modestbranding: 1,
            playsinline: 1,
            enablejsapi: 1,
            origin: window.location.origin,
          },
          events: {
            onReady: () => {
              if (cancelled) return;
              ytRef.current = player;
              const realDuration = player.getDuration?.() || 0;
              if (realDuration > 1) {
                setDuration(realDuration);
                const stored = lesson.duration || 0;
                if (Math.abs(realDuration - stored) > 2) {
                  useStore.getState().updateLesson(course.id, lesson.id, {
                    duration: Math.round(realDuration),
                  });
                }
              }
              if (lesson.position > 3) {
                try {
                  player.seekTo(lesson.position, true);
                } catch {
                  /* ignore */
                }
                setCurrentTime(lesson.position);
                currentTimeRef.current = lesson.position;
              }
              try {
                player.playVideo();
              } catch {
                /* ignore */
              }
            },
            onStateChange: (event: { data: number }) => {
              if (event.data === 1) {
                setPlaying(true);
                playingRef.current = true;
              } else if (event.data === 2) {
                setPlaying(false);
                playingRef.current = false;
                flushRef.current();
              } else if (event.data === 0) {
                setPlaying(false);
                playingRef.current = false;
                flushRef.current();
                const changed = useStore
                  .getState()
                  .setLessonComplete(course.id, lesson.id, true);
                if (changed) pushToast(t("watch.ended"));
              }
            },
            onError: () => {
              setUnavailable(true);
              setPlaying(false);
              playingRef.current = false;
            },
          },
        });
        ytRef.current = player;
      })
      .catch(() => setUnavailable(true));

    return () => {
      cancelled = true;
      try {
        ytRef.current?.destroy?.();
      } catch {
        /* ignore */
      }
      ytRef.current = null;
      host.innerHTML = "";
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lesson.id, isYT, course.id]);

  useEffect(() => {
    if (!isYT) return;
    const id = setInterval(() => {
      const player = ytRef.current;
      if (player?.getCurrentTime) {
        const time = player.getCurrentTime();
        if (typeof time === "number" && time > 0) setCurrentTime(time);
        const realDuration = player.getDuration?.();
        if (typeof realDuration === "number" && realDuration > 1)
          setDuration(realDuration);
      }
    }, 800);
    return () => clearInterval(id);
  }, [isYT]);

  /* ---------------- playback ---------------- */

  const pausePlayback = useCallback(() => {
    if (isYT) {
      try {
        ytRef.current?.pauseVideo?.();
      } catch {
        /* ignore */
      }
    } else {
      videoRef.current?.pause();
    }
    setPlaying(false);
    playingRef.current = false;
  }, [isYT]);

  const resumePlayback = useCallback(() => {
    if (isYT) {
      try {
        ytRef.current?.playVideo?.();
        setPlaying(true);
        playingRef.current = true;
      } catch {
        /* ignore */
      }
    } else if (videoRef.current) {
      videoRef.current
        .play()
        .then(() => {
          setPlaying(true);
          playingRef.current = true;
        })
        .catch(() => {
          /* autoplay blocked */
        });
    }
  }, [isYT]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) {
        pausePlayback();
        flushRef.current();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [pausePlayback]);

  /* ---------------- pomodoro (absolute end time, no drift) ---------------- */

  const modeWorkMinutes = settings.pomodoroModeMinutes[mode] ?? 0;
  const workSec = Math.max(0, Math.round(modeWorkMinutes * 60));
  const breakSec = Math.max(1, settings.pomodoroBreak * 60);
  const [pomoMode, setPomoMode] = useState<"work" | "break">("work");
  const [pomoLeft, setPomoLeft] = useState(workSec);
  const [pomoRun, setPomoRun] = useState(false);
  const [pomoEnd, setPomoEnd] = useState<number | null>(null);
  const pomoTotal = pomoMode === "work" ? workSec : breakSec;
  // Remaining time saved separately for every mode, so switching back restores it.
  const savedPomoLeft = useRef<Partial<Record<StudyMode, number>>>({});

  const currentPomoLeft = () =>
    pomoEnd ? Math.max(0, Math.ceil((pomoEnd - Date.now()) / 1000)) : pomoLeft;

  const setPomoRunning = (value: boolean) => {
    pomoRunRef.current = value;
    setPomoRun(value);
  };

  const setPomoPhase = (value: "work" | "break") => {
    pomoPhaseRef.current = value;
    setPomoMode(value);
  };

  useEffect(() => {
    if (!pomoRun || !pomoEnd) return;
    const tick = () => {
      const left = Math.max(0, Math.ceil((pomoEnd - Date.now()) / 1000));
      setPomoLeft(left);
      if (left <= 0) {
        setPomoRunning(false);
        setPomoEnd(null);
        if (pomoMode === "work") {
          pushToast(t("watch.workDone"), "success");
          setPomoPhase("break");
          setPomoLeft(breakSec);
          pausePlayback();
        } else {
          pushToast(t("watch.breakDone"), "info");
          setPomoPhase("work");
          setPomoLeft(workSec);
        }
      }
    };
    tick();
    const id = window.setInterval(tick, 250);
    return () => window.clearInterval(id);
  }, [
    pomoRun,
    pomoEnd,
    pomoMode,
    workSec,
    breakSec,
    pausePlayback,
    pushToast,
    t,
  ]);

  /* Switch the pomodoro duration automatically when the time mode changes. */
  const prevModeRef = useRef<StudyMode>(mode);
  useEffect(() => {
    const prev = prevModeRef.current;
    if (prev === mode) return;
    prevModeRef.current = mode;

    if (pomoPhaseRef.current === "work") {
      savedPomoLeft.current[prev] = currentPomoLeft();
    }
    if (pomoRunRef.current) {
      setPomoRunning(false);
      setPomoEnd(null);
    }
    if (pomoPhaseRef.current === "work") {
      const saved = savedPomoLeft.current[mode];
      const nextLeft =
        mode === "none" ? 0 : saved && saved > 0 ? saved : workSec;
      setPomoLeft(nextLeft);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, pomoEnd, pomoLeft, workSec]);

  const setPomoDuration = (minutes: number) => {
    if (pomoRun || pomoMode === "break") return;
    const safe = Math.max(0, Math.min(240, Math.round(minutes || 0)));
    updateSettings({
      pomodoroModeMinutes: { ...settings.pomodoroModeMinutes, [mode]: safe },
      ...(mode === "study" ? { pomodoroWork: Math.max(1, safe) } : {}),
    });
    savedPomoLeft.current[mode] = safe * 60;
    setPomoLeft(safe * 60);
    setPomoEnd(null);
  };

  const togglePomo = () => {
    if (pomoMode === "work" && workSec <= 0) return;
    if (pomoRun) {
      const left = currentPomoLeft();
      setPomoRunning(false);
      setPomoEnd(null);
      setPomoLeft(left);
      return;
    }
    const fallback = pomoMode === "work" ? workSec : breakSec;
    const base = pomoLeft > 0 ? pomoLeft : fallback;
    if (base <= 0) return;
    setPomoEnd(Date.now() + base * 1000);
    setPomoLeft(base);
    setPomoRunning(true);
  };

  const resetPomo = () => {
    setPomoRunning(false);
    setPomoEnd(null);
    savedPomoLeft.current[mode] = workSec;
    setPomoLeft(pomoMode === "work" ? workSec : breakSec);
  };

  /* ---------------- playback helpers ---------------- */

  const togglePlay = () => {
    if (isLink) return;
    if (playing) pausePlayback();
    else resumePlayback();
  };

  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await shellRef.current?.requestFullscreen();
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    const onChange = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const markComplete = () => {
    const changed = useStore
      .getState()
      .setLessonComplete(course.id, lesson.id, !lesson.completed);
    if (changed)
      pushToast(
        lesson.completed ? t("toast.uncompleted") : t("toast.lessonCompleted"),
        lesson.completed ? "info" : "success",
      );
  };

  const submitNote = () => {
    const text = noteText.trim();
    if (!text) return;
    addNote(course.id, lesson.id, text, attachTime ? Math.round(getTime()) : 0);
    setNoteText("");
    pushToast(t("toast.noteAdded"));
  };

  const changeMode = (next: StudyMode) => {
    if (next === mode) return;
    flushRef.current();
    setMode(next);
  };

  const chooseLocalFile = (file: File | undefined) => {
    if (!file) return;
    if (localUrlRef.current) URL.revokeObjectURL(localUrlRef.current);
    const url = URL.createObjectURL(file);
    localUrlRef.current = url;
    setLocalUrl(url);
    setLocalName(file.name);
    setUnavailable(false);
    setPlaying(false);
    playingRef.current = false;
    restoredRef.current = false;
  };

  const clearLocalFile = () => {
    if (localUrlRef.current) URL.revokeObjectURL(localUrlRef.current);
    localUrlRef.current = null;
    setLocalUrl(null);
    setLocalName("");
    setDuration(lesson.duration || 0);
    setCurrentTime(lesson.position || 0);
    currentTimeRef.current = lesson.position || 0;
    restoredRef.current = false;
  };

  /* ---------------- keyboard shortcuts ---------------- */

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }
      if (e.key === " " || e.code === "Space") {
        e.preventDefault();
        togglePlay();
      } else if (e.key.toLowerCase() === "f") {
        toggleFullscreen();
      } else if (e.key.toLowerCase() === "n") {
        setNotesOpen((v) => !v);
      } else if (e.key.toLowerCase() === "m") {
        markComplete();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  /* ---------------- render ---------------- */

  const pomoPercent =
    pomoTotal > 0 ? ((pomoTotal - pomoLeft) / pomoTotal) * 100 : 0;

  const pageClass = `watch-page ${notesOpen ? "notes-open" : ""}`;
  const internalLink = lesson.url?.startsWith("/");

  const modeOptions: Array<{
    id: StudyMode;
    icon: JSX.Element;
    label: string;
    hint: string;
  }> = [
    {
      id: "study",
      icon: <BookOpen size={15} />,
      label: t("watch.modeStudy"),
      hint: t("watch.modeHintStudy"),
    },
    {
      id: "leisure",
      icon: <Coffee size={15} />,
      label: t("watch.modeLeisure"),
      hint: t("watch.modeHintLeisure"),
    },
    {
      id: "none",
      icon: <Ban size={15} />,
      label: t("watch.modeNone"),
      hint: t("watch.modeHintNone"),
    },
  ];
  const activeMode = modeOptions.find((m) => m.id === mode)!;

  return (
    <div className={pageClass}>
      <div className="watch-top">
        <Link to={`/course/${course.id}`} className="back-link">
          <ArrowLeft size={16} className="rtl-flip" /> {t("watch.backToCourse")}
        </Link>
        <div className="watch-top-actions">
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => openShare(course.id)}
          >
            <Share2 size={15} /> {t("common.share")}
          </button>
          <button
            className={`btn btn-sm ${lesson.completed ? "btn-secondary" : "btn-primary"}`}
            onClick={markComplete}
          >
            <Check size={16} />{" "}
            {lesson.completed
              ? t("watch.markIncomplete")
              : t("watch.markComplete")}
          </button>
        </div>
      </div>

      <div className="watch-layout">
        <div className="watch-main">
          <div className="watch-heading">
            <span className="lesson-counter">
              {t("watch.lesson")} {index + 1} / {stats.total}
            </span>
            <h1>{lesson.title}</h1>
            <div className="watch-meta">
              <Link to={`/course/${course.id}`}>{course.title}</Link>
              {lesson.author && <span>· {lesson.author}</span>}
              {lesson.duration ? (
                <span>· {formatClock(lesson.duration)}</span>
              ) : null}
              {lesson.completed && (
                <span className="status done">
                  <Check size={12} /> {t("common.completed")}
                </span>
              )}
              <span className={`mode-pill ${mode}`} title={activeMode.hint}>
                {activeMode.icon} {t("watch.currentMode")}: {activeMode.label}
              </span>
            </div>
          </div>

          <div
            className={`player-shell ${fullscreen ? "is-fullscreen" : ""}`}
            ref={shellRef}
          >
            <div className="video-frame">
              {isYT && <div className="yt-host" ref={ytHostRef} />}

              {isNative && (
                <video
                  ref={videoRef}
                  className="native-video"
                  src={localUrl || lesson.url}
                  poster={lesson.thumbnail}
                  playsInline
                  preload="metadata"
                  controls
                  onLoadedMetadata={(e) => {
                    const video = e.currentTarget;
                    const realDuration = video.duration;
                    if (Number.isFinite(realDuration) && realDuration > 0) {
                      setDuration(realDuration);
                      if (Math.abs(realDuration - (lesson.duration || 0)) > 2) {
                        useStore.getState().updateLesson(course.id, lesson.id, {
                          duration: Math.round(realDuration),
                        });
                      }
                      if (!restoredRef.current) {
                        restoredRef.current = true;
                        if (
                          lesson.position > 2 &&
                          lesson.position < realDuration - 2
                        ) {
                          video.currentTime = lesson.position;
                        }
                      }
                    }
                  }}
                  onTimeUpdate={(e) =>
                    setCurrentTime(e.currentTarget.currentTime)
                  }
                  onPlay={() => {
                    setPlaying(true);
                    playingRef.current = true;
                  }}
                  onPause={() => {
                    setPlaying(false);
                    playingRef.current = false;
                    flushRef.current();
                  }}
                  onEnded={() => {
                    setPlaying(false);
                    playingRef.current = false;
                    flushRef.current();
                    const changed = useStore
                      .getState()
                      .setLessonComplete(course.id, lesson.id, true);
                    if (changed) pushToast(t("watch.ended"));
                  }}
                  onError={() => setUnavailable(true)}
                />
              )}

              {isLink && (
                <div className="link-lesson">
                  <div className="link-lesson-icon">
                    <ExternalLink size={30} />
                  </div>
                  <h2>{t("watch.linkLesson")}</h2>
                  <p>{t("watch.linkLessonDesc")}</p>
                  {internalLink ? (
                    <Link to={lesson.url!} className="btn btn-primary">
                      <ExternalLink size={16} /> {t("watch.openExternal")}
                    </Link>
                  ) : (
                    <a
                      href={lesson.url}
                      target="_blank"
                      rel="noreferrer"
                      className="btn btn-primary"
                    >
                      <ExternalLink size={16} /> {t("watch.openExternal")}
                    </a>
                  )}
                </div>
              )}

              {!localUrl && lesson.kind === "local" && (
                <div className="link-lesson">
                  <div className="link-lesson-icon">
                    <FileVideo size={30} />
                  </div>
                  <h2>{t("watch.localFile")}</h2>
                  <p>{t("watch.localFileHint")}</p>
                  <button
                    className="btn btn-primary"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <FileVideo size={16} /> {t("watch.pickFile")}
                  </button>
                </div>
              )}

              {unavailable && !isLink && (
                <div className="video-overlay">
                  <AlertTriangle size={34} />
                  <h3>{t("watch.unavailable")}</h3>
                  <p>{t("watch.unavailableDesc")}</p>
                  {lesson.videoId && (
                    <a
                      href={youtubeWatchUrl(lesson.videoId)}
                      target="_blank"
                      rel="noreferrer"
                      className="btn btn-primary"
                    >
                      <ExternalLink size={16} /> {t("watch.openYoutube")}
                    </a>
                  )}
                </div>
              )}
            </div>

            {localUrl && (
              <div className="local-override">
                <FileVideo size={14} />
                <span>{t("watch.localPlaying", { name: localName })}</span>
                <button
                  className="icon-btn icon-btn-sm"
                  onClick={clearLocalFile}
                  aria-label={t("common.remove")}
                >
                  <X size={14} />
                </button>
              </div>
            )}
          </div>

          <div className="lesson-tools">
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => fileInputRef.current?.click()}
            >
              <FileVideo size={15} /> {t("watch.localFile")}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="video/*"
              hidden
              onChange={(e) => {
                chooseLocalFile(e.target.files?.[0]);
                e.currentTarget.value = "";
              }}
            />
            <span className="auto-note">{t("watch.autoComplete")}</span>
            <span className="shortcut-hint hide-mobile">
              <kbd>Space</kbd> {t("watch.play")} · <kbd>F</kbd>{" "}
              {t("watch.fullscreen")}
            </span>
          </div>

          <div className={`notes-card panel ${notesOpen ? "" : "collapsed"}`}>
            <div className="section-head">
              <h2>
                <NotebookPen size={18} /> {t("watch.notes")}{" "}
                <span className="count-pill">{lesson.notes.length}</span>
              </h2>
              <div className="row gap-2">
                <span className="autosave">{t("watch.saved")}</span>
                <button
                  className="icon-btn"
                  onClick={() => setNotesOpen((v) => !v)}
                  title={t("watch.notesToggle")}
                >
                  <ChevronLeft
                    size={17}
                    className={notesOpen ? "rotate-down" : "rotate-up"}
                  />
                </button>
              </div>
            </div>

            {notesOpen && (
              <>
                <div className="note-editor">
                  <textarea
                    className="input textarea"
                    rows={2}
                    value={noteText}
                    onChange={(e) => setNoteText(e.target.value)}
                    placeholder={t("watch.addNote")}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                        e.preventDefault();
                        submitNote();
                      }
                    }}
                  />
                  <div className="note-editor-foot">
                    <label className="check-inline">
                      <input
                        type="checkbox"
                        checked={attachTime}
                        onChange={(e) => setAttachTime(e.target.checked)}
                      />
                      <span>
                        {t("watch.noteAt")}{" "}
                        <span className="mono">{formatClock(getTime())}</span>
                      </span>
                    </label>
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={submitNote}
                      disabled={!noteText.trim()}
                    >
                      <Plus size={15} /> {t("watch.addNoteBtn")}
                    </button>
                  </div>
                </div>

                {lesson.notes.length === 0 ? (
                  <div className="notes-empty">
                    <NotebookPen size={20} />
                    <span>{t("watch.notesEmpty")}</span>
                  </div>
                ) : (
                  <div className="note-list">
                    {lesson.notes.map((note) => (
                      <div className="note-item" key={note.id}>
                        {note.at > 0 ? (
                          <span className="note-time mono">
                            <Play size={11} fill="currentColor" />{" "}
                            {formatClock(note.at)}
                          </span>
                        ) : (
                          <span className="note-time no-time">—</span>
                        )}
                        <p className="note-text">{note.text}</p>
                        <button
                          className="icon-btn icon-btn-sm note-del"
                          onClick={() => {
                            deleteNote(course.id, lesson.id, note.id);
                            pushToast(t("toast.noteDeleted"), "info");
                          }}
                          title={t("watch.deleteNote")}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          <div className="lesson-nav">
            <button
              className="btn btn-secondary"
              disabled={!prev}
              onClick={() => prev && navigate(`/watch/${course.id}/${prev.id}`)}
            >
              <ChevronRight
                size={17}
                className={lang === "ar" ? "" : "rtl-flip"}
              />{" "}
              {t("watch.prevLesson")}
            </button>
            {next ? (
              <button
                className="btn btn-primary"
                onClick={() => navigate(`/watch/${course.id}/${next.id}`)}
              >
                {t("watch.nextLesson")}{" "}
                <ChevronLeft
                  size={17}
                  className={lang === "ar" ? "" : "rtl-flip"}
                />
              </button>
            ) : (
              <Link to={`/course/${course.id}`} className="btn btn-primary">
                {t("watch.lastLesson")}{" "}
                <ArrowLeft size={16} className="rtl-flip" />
              </Link>
            )}
          </div>
        </div>

        <aside className="watch-rail">
          <div className="panel mode-card">
            <div className="section-head">
              <h2>
                <Clock3 size={18} /> {t("watch.mode")}
              </h2>
              <span className={`mode-current ${mode}`}>
                {activeMode.icon} {activeMode.label}
              </span>
            </div>
            <div className="mode-switch">
              {modeOptions.map((opt) => (
                <button
                  key={opt.id}
                  className={`mode-opt ${opt.id} ${mode === opt.id ? "active" : ""}`}
                  onClick={() => changeMode(opt.id)}
                  aria-pressed={mode === opt.id}
                >
                  {opt.icon}
                  <span>{opt.label}</span>
                </button>
              ))}
            </div>
            <p className="field-hint">{activeMode.hint}</p>
            <div className="mode-today">
              <span>
                <CheckCircle2 size={13} /> {t("watch.studyToday")}:{" "}
                <strong className="mono">{formatPrecise(today, lang)}</strong>
              </span>
              <span>
                <Coffee size={13} /> {t("watch.leisureToday")}:{" "}
                <strong className="mono">
                  {formatPrecise(todayLeisure, lang)}
                </strong>
              </span>
            </div>
            <Link to="/timer" className="btn btn-secondary btn-sm w-full mt-2">
              <Timer size={15} /> {t("watch.openTimer")}
            </Link>
          </div>

          <div
            className={`panel pomo-card ${pomoMode === "break" ? "on-break" : ""}`}
          >
            <div className="section-head">
              <h2>
                <Timer size={18} /> {t("watch.pomodoro")}
              </h2>
              <span
                className={`pomo-mode ${pomoMode === "break" ? "break" : ""}`}
              >
                {pomoMode === "work" ? (
                  <Sparkles size={13} />
                ) : (
                  <Coffee size={13} />
                )}
                {pomoMode === "work" ? t("watch.work") : t("watch.break")}
              </span>
            </div>
            <div className="pomo-duration">
              <span className="pomo-duration-label">
                <Clock3 size={12} /> {t("watch.pomodoroDuration")}
              </span>
              <div className="pomo-duration-control">
                <button
                  type="button"
                  className="pomo-step"
                  onClick={() => setPomoDuration(modeWorkMinutes - 5)}
                  disabled={
                    pomoRun ||
                    pomoMode === "break" ||
                    mode === "none" ||
                    modeWorkMinutes <= 0
                  }
                  aria-label={t("watch.pomodoroLess")}
                >
                  −
                </button>
                <input
                  className="input mono pomo-duration-input"
                  type="number"
                  min={0}
                  max={240}
                  step={5}
                  value={modeWorkMinutes}
                  disabled={pomoRun || pomoMode === "break" || mode === "none"}
                  onChange={(e) => setPomoDuration(Number(e.target.value))}
                  aria-label={t("watch.pomodoroDuration")}
                />
                <span className="pomo-duration-unit">{t("common.min")}</span>
                <button
                  type="button"
                  className="pomo-step"
                  onClick={() => setPomoDuration(modeWorkMinutes + 5)}
                  disabled={
                    pomoRun ||
                    pomoMode === "break" ||
                    mode === "none" ||
                    modeWorkMinutes >= 240
                  }
                  aria-label={t("watch.pomodoroMore")}
                >
                  +
                </button>
              </div>
            </div>
            <div className="pomo-body">
              <ProgressRing
                percent={pomoPercent}
                size={92}
                stroke={6}
                color={pomoMode === "break" ? "#34d399" : undefined}
              >
                <span className="pomo-time mono">{formatClock(pomoLeft)}</span>
              </ProgressRing>
              <div className="pomo-actions">
                <button
                  className="btn btn-primary btn-sm"
                  onClick={togglePomo}
                  disabled={pomoMode === "work" && workSec <= 0}
                >
                  {pomoRun ? <Pause size={14} /> : <Play size={14} />}
                  {pomoRun ? t("watch.pause") : t("watch.start")}
                </button>
                <button className="btn btn-ghost btn-sm" onClick={resetPomo}>
                  <RotateCcw size={14} /> {t("watch.resetTimer")}
                </button>
              </div>
            </div>
            <p className="field-hint pomo-hint">
              {mode === "none"
                ? t("watch.pomoNone")
                : t("watch.pomoCounts", { mode: activeMode.label })}
            </p>
            <div className="pomo-stats">
              <span>
                <Clock3 size={13} /> {t("watch.session")}:{" "}
                <strong className="mono">{formatClock(session)}</strong>
              </span>
              <span>
                <Flame size={13} /> {streak} {t("common.days")}
              </span>
            </div>
          </div>

          <div className="panel today-card">
            <div>
              <span className="muted">{t("watch.todayTime")}</span>
              <strong className="mono">{formatPrecise(today, lang)}</strong>
            </div>
            <div className="today-goal-mini">
              <span
                style={{
                  width: `${Math.min(100, (today / Math.max(1, settings.dailyGoal * 60)) * 100)}%`,
                }}
              />
            </div>
          </div>

          <div className="panel mini-lessons">
            <div className="section-head">
              <h2>
                <ListVideo size={18} /> {t("watch.courseLessons")}
              </h2>
              <span className="muted">
                {stats.done}/{stats.total}
              </span>
            </div>
            <div className="mini-lessons-list">
              {course.lessons.map((l, i) => (
                <button
                  key={l.id}
                  className={`mini-lesson ${l.id === lesson.id ? "current" : ""}`}
                  onClick={() =>
                    l.id !== lesson.id &&
                    navigate(`/watch/${course.id}/${l.id}`)
                  }
                >
                  <span className={`mini-check ${l.completed ? "done" : ""}`}>
                    {l.completed ? <Check size={11} /> : i + 1}
                  </span>
                  <span className="mini-title">{l.title}</span>
                  {l.duration ? (
                    <span className="mini-duration mono">
                      {formatClock(l.duration)}
                    </span>
                  ) : null}
                </button>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
