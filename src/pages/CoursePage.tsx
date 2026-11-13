import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowDownUp,
  ArrowLeft,
  Check,
  CheckCircle2,
  ChevronLeft,
  Clock3,
  Copy,
  FileVideo,
  FolderInput,
  FolderPlus,
  GripVertical,
  LayoutGrid,
  Link2,
  List,
  ListVideo,
  NotebookPen,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Share2,
  Trash2,
  Youtube,
} from "lucide-react";
import {
  useStore,
  childrenOf,
  descendantIds,
  sortCourses,
} from "../store/store";
import { useUI } from "../store/ui";
import { useToasts } from "../store/toasts";
import {
  useI18n,
  ConfirmDialog,
  EmptyState,
  Field,
  Modal,
  ProgressRing,
  ProgressBar,
  KebabMenu,
  CourseCover,
} from "../components/ui";
import { CourseCard, type DropMode } from "../components/CourseCard";
import { FolderModal, MoveToFolderModal } from "../components/FolderModals";
import { courseStats, formatClock, formatTotal } from "../lib/utils";
import { coursePlaylistId, fetchPlaylistLessons } from "../lib/playlistSync";
import type { Course, Lesson } from "../types";

const EMOJIS = [
  "📚",
  "🚀",
  "💻",
  "🎨",
  "🧠",
  "📈",
  "🎯",
  "🎬",
  "🎧",
  "🧪",
  "🌍",
  "⚡",
  "☠️",
  "📝",
  "🤖",
];
const COLORS = [
  "#8b5cf6",
  "#22d3ee",
  "#f472b6",
  "#34d399",
  "#fbbf24",
  "#fb7185",
  "#60a5fa",
  "#a78bfa",
  "#0075ff",
  "#ff6b6b",
  "#ff922b",
  "#40c057",
];

export default function CoursePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t, lang } = useI18n();
  const courses = useStore((s) => s.courses);
  const course = useStore((s) => s.courses.find((c) => c.id === id));
  const settings = useStore((s) => s.settings);
  const updateCourse = useStore((s) => s.updateCourse);
  const updateSettings = useStore((s) => s.updateSettings);
  const deleteCourse = useStore((s) => s.deleteCourse);
  const duplicateCourse = useStore((s) => s.duplicateCourse);
  const moveCourse = useStore((s) => s.moveCourse);
  const resetCourseProgress = useStore((s) => s.resetCourseProgress);
  const setLessonComplete = useStore((s) => s.setLessonComplete);
  const updateLesson = useStore((s) => s.updateLesson);
  const deleteLesson = useStore((s) => s.deleteLesson);
  const moveLesson = useStore((s) => s.moveLesson);
  const toggleLessonOrder = useStore((s) => s.toggleLessonOrder);
  const apiKey = useStore((s) => s.settings.apiKey);
  const openImporter = useUI((s) => s.openImporter);
  const openShare = useUI((s) => s.openShare);
  const pushToast = useToasts((s) => s.push);

  const [editing, setEditing] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [lessonToDelete, setLessonToDelete] = useState<Lesson | null>(null);
  const [lessonToEdit, setLessonToEdit] = useState<Lesson | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const [folderOpen, setFolderOpen] = useState(false);
  const [folderParent, setFolderParent] = useState<string | null>(null);
  const [moveTarget, setMoveTarget] = useState<string | null>(null);
  const [childToDelete, setChildToDelete] = useState<Course | null>(null);
  const [dragChild, setDragChild] = useState<string | null>(null);
  const [childDropZone, setChildDropZone] = useState<{
    id: string;
    mode: DropMode;
  } | null>(null);
  const [crumbDrop, setCrumbDrop] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const autoSyncedRef = useRef<Set<string>>(new Set());

  const [form, setForm] = useState({
    title: "",
    description: "",
    emoji: "📚",
    color: "#8b5cf6",
  });
  const [lessonForm, setLessonForm] = useState({ title: "", url: "" });

  useEffect(() => {
    if (course) {
      setForm({
        title: course.title,
        description: course.description || "",
        emoji: course.emoji,
        color: course.color,
      });
    }
  }, [course?.id]);

  useEffect(() => {
    if (lessonToEdit)
      setLessonForm({ title: lessonToEdit.title, url: lessonToEdit.url || "" });
  }, [lessonToEdit]);

  const stats = useMemo(() => (course ? courseStats(course) : null), [course]);

  const children = useMemo(
    () => (course ? childrenOf(courses, course.id) : []),
    [courses, course?.id],
  );

  const folderStats = useMemo(() => {
    if (!course)
      return { done: 0, total: 0, percent: 0, duration: 0, studied: 0 };
    const ids = [course.id, ...descendantIds(courses, course.id)];
    let done = 0;
    let total = 0;
    let duration = 0;
    let studied = 0;
    ids.forEach((cid) => {
      const c = courses.find((x) => x.id === cid);
      if (c && !c.isFolder) {
        const s = courseStats(c);
        done += s.done;
        total += s.total;
        duration += s.duration;
        studied += s.studied;
      }
    });
    return {
      done,
      total,
      duration,
      studied,
      percent: total ? Math.round((done / total) * 100) : 0,
    };
  }, [courses, course?.id]);

  const trail = useMemo(() => {
    if (!course) return [] as Course[];
    const out: Course[] = [];
    let current = courses.find((c) => c.id === course.parentId);
    while (current) {
      out.unshift(current);
      current = courses.find((c) => c.id === current!.parentId);
    }
    return out;
  }, [courses, course?.id]);

  const syncPlaylist = useCallback(
    async (manual = false) => {
      const current = useStore.getState().courses.find((c) => c.id === id);
      if (!current || current.isFolder) return;
      const playlistId = coursePlaylistId(current);
      if (!playlistId) {
        if (manual) pushToast(t("course.noPlaylist"), "info");
        return;
      }
      setSyncing(true);
      try {
        const lessons = await fetchPlaylistLessons(playlistId, apiKey);
        const result = useStore.getState().syncLessons(current.id, lessons);
        useStore
          .getState()
          .updateCourse(current.id, { lastSyncedAt: Date.now() });
        if (result.added > 0)
          pushToast(t("toast.playlistSynced", { n: result.added }));
        else if (result.reordered && manual)
          pushToast(t("toast.playlistReordered"));
        else if (manual) pushToast(t("toast.playlistUpToDate"), "info");
      } catch (err) {
        console.error(err);
        if (manual) pushToast(t("toast.playlistSyncFail"), "error");
      } finally {
        setSyncing(false);
      }
    },
    [id, apiKey, pushToast, t],
  );

  /* Check the source playlist automatically when the course is opened. */
  useEffect(() => {
    if (!course || course.isFolder) return;
    if (!coursePlaylistId(course)) return;
    if (autoSyncedRef.current.has(course.id)) return;
    if (
      course.lastSyncedAt &&
      Date.now() - course.lastSyncedAt < 10 * 60 * 1000
    )
      return;
    autoSyncedRef.current.add(course.id);
    void syncPlaylist(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [course?.id, syncPlaylist]);

  const playlistId = course ? coursePlaylistId(course) : null;

  if (!course || !stats) {
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

  const isFolder = !!course.isFolder;
  const view = settings.libraryView;
  const display = isFolder
    ? { ...folderStats, total: folderStats.total, done: folderStats.done }
    : stats;
  const childCount = children.length;

  const nextLesson =
    course.lessons.find((l) => !l.completed && l.position > 0) ||
    course.lessons.find((l) => !l.completed) ||
    course.lessons[0];

  const startLabel =
    stats.total === 0
      ? t("course.addLessons")
      : stats.done === 0
        ? t("course.start")
        : stats.done === stats.total
          ? t("course.start")
          : t("course.continue");

  const openLesson = (lesson: Lesson) =>
    navigate(`/watch/${course.id}/${lesson.id}`);

  const start = () => {
    if (isFolder) {
      openImporter({ mode: "create", parentId: course.id });
      return;
    }
    if (!course.lessons.length) {
      openImporter({ mode: "add", courseId: course.id });
      return;
    }
    openLesson(nextLesson!);
  };

  const saveEdit = () => {
    if (!form.title.trim()) return;
    updateCourse(course.id, {
      title: form.title.trim(),
      description: form.description.trim() || undefined,
      emoji: form.emoji,
      color: form.color,
    });
    setEditing(false);
    pushToast(t("toast.courseUpdated"));
  };

  const saveLesson = () => {
    if (!lessonToEdit || !lessonForm.title.trim()) return;
    updateLesson(course.id, lessonToEdit.id, {
      title: lessonForm.title.trim(),
      url: lessonForm.url.trim() || lessonToEdit.url,
    });
    setLessonToEdit(null);
    pushToast(t("toast.lessonUpdated"));
  };

  const onDrop = (index: number) => {
    if (dragIndex != null && dragIndex !== index) {
      moveLesson(course.id, dragIndex, index);
    }
    setDragIndex(null);
    setDropIndex(null);
  };

  const childMenu = (child: Course) => [
    {
      label: t("folder.moveTo"),
      icon: <FolderInput size={15} />,
      onClick: () => setMoveTarget(child.id),
    },
    ...(child.isFolder
      ? [
          {
            label: t("folder.newSub"),
            icon: <FolderPlus size={15} />,
            onClick: () => {
              setFolderParent(child.id);
              setFolderOpen(true);
            },
          },
        ]
      : []),
    {
      label: t("lib.duplicate"),
      icon: <Copy size={15} />,
      onClick: () => {
        const newId = duplicateCourse(child.id);
        if (newId) pushToast(t("toast.courseCreated"));
      },
    },
    {
      label: t("common.delete"),
      icon: <Trash2 size={15} />,
      onClick: () => setChildToDelete(child),
      danger: true,
    },
  ];

  const childPercent = (child: Course) => {
    if (!child.isFolder) return courseStats(child).percent;
    const ids = [child.id, ...descendantIds(courses, child.id)];
    let done = 0;
    let total = 0;
    ids.forEach((cid) => {
      const c = courses.find((x) => x.id === cid);
      if (c && !c.isFolder) {
        const s = courseStats(c);
        done += s.done;
        total += s.total;
      }
    });
    return total ? Math.round((done / total) * 100) : 0;
  };

  const clearChildDrag = () => {
    setDragChild(null);
    setChildDropZone(null);
    setCrumbDrop(null);
  };

  const canDropInside = (target: Course) => {
    if (!dragChild || !target.isFolder || target.id === dragChild) return false;
    return !descendantIds(courses, dragChild).includes(target.id);
  };

  const dropInto = (
    targetId: string,
    parentId: string | null,
    index: number,
  ) => {
    moveCourse(targetId, parentId, index);
    pushToast(t("toast.moved"), "info");
    clearChildDrag();
  };

  const doChildDrop = (target: Course) => {
    const zone =
      childDropZone?.id === target.id ? childDropZone.mode : "before";
    if (!dragChild || dragChild === target.id) {
      clearChildDrag();
      return;
    }
    if (zone === "inside") {
      if (!canDropInside(target)) {
        pushToast(t("folder.cycle"), "error");
        clearChildDrag();
        return;
      }
      dropInto(dragChild, target.id, childrenOf(courses, target.id).length);
      return;
    }
    const parent = target.parentId ?? null;
    const siblings = sortCourses(childrenOf(courses, parent)).filter(
      (c) => c.id !== dragChild,
    );
    let index = siblings.findIndex((c) => c.id === target.id);
    if (index < 0) index = siblings.length;
    if (zone === "after") index += 1;
    dropInto(dragChild, parent, index);
  };

  const childDragProps = (child: Course) => ({
    draggable: true,
    onDragStart: (e: React.DragEvent<HTMLElement>) => {
      setDragChild(child.id);
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", child.id);
    },
    onDragOver: (e: React.DragEvent<HTMLElement>) => {
      if (!dragChild || dragChild === child.id) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      const rect = e.currentTarget.getBoundingClientRect();
      const ratio = rect.height ? (e.clientY - rect.top) / rect.height : 0.5;
      let mode: DropMode = ratio < 0.5 ? "before" : "after";
      if (canDropInside(child) && ratio > 0.26 && ratio < 0.74) mode = "inside";
      setChildDropZone((current) =>
        current?.id === child.id && current.mode === mode
          ? current
          : { id: child.id, mode },
      );
    },
    onDragLeave: (e: React.DragEvent<HTMLElement>) => {
      const next = e.relatedTarget as Node | null;
      if (next && e.currentTarget.contains(next)) return;
      setChildDropZone((current) =>
        current?.id === child.id ? null : current,
      );
    },
    onDrop: (e: React.DragEvent<HTMLElement>) => {
      e.preventDefault();
      doChildDrop(child);
    },
    onDragEnd: clearChildDrag,
  });

  const crumbDragProps = (targetId: string | null) => ({
    onDragOver: (e: React.DragEvent<HTMLElement>) => {
      if (!dragChild) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      setCrumbDrop(targetId ?? "root");
    },
    onDragLeave: () =>
      setCrumbDrop((current) =>
        current === (targetId ?? "root") ? null : current,
      ),
    onDrop: (e: React.DragEvent<HTMLElement>) => {
      e.preventDefault();
      if (!dragChild || dragChild === targetId) {
        clearChildDrag();
        return;
      }
      moveCourse(dragChild, targetId, childrenOf(courses, targetId).length);
      pushToast(t("toast.moved"), "info");
      clearChildDrag();
      navigate(targetId ? `/course/${targetId}` : "/library");
    },
  });

  return (
    <div className="course-page">
      <nav className="breadcrumb">
        <Link
          to="/library"
          className={crumbDrop === "root" ? "crumb-drop" : ""}
          {...crumbDragProps(null)}
        >
          <ArrowLeft size={14} className="rtl-flip" /> {t("lib.root")}
        </Link>
        {trail.map((item) => (
          <span
            key={item.id}
            className={`crumb ${crumbDrop === item.id ? "crumb-drop" : ""}`}
          >
            <ChevronLeft size={13} className="crumb-sep" />
            <Link to={`/course/${item.id}`} {...crumbDragProps(item.id)}>
              {item.title}
            </Link>
          </span>
        ))}
        <span className="crumb current">
          <ChevronLeft size={13} className="crumb-sep" />
          <span>{course.title}</span>
        </span>
      </nav>

      <section
        className="course-banner"
        style={{ "--course-color": course.color } as CSSProperties}
      >
        <div className="course-banner-glow" />
        <div className="course-banner-main">
          <div className="course-banner-emoji">{course.emoji}</div>
          <div className="course-banner-text">
            <h1>{course.title}</h1>
            {course.description && <p>{course.description}</p>}
            <div className="course-banner-chips">
              <span>
                <ListVideo size={14} />{" "}
                {isFolder
                  ? t("lib.items", { n: childCount })
                  : t("course.lessonCount", { n: stats.total })}
              </span>
              <span>
                <Clock3 size={14} /> {formatTotal(folderStats.duration, lang)}
              </span>
              <span>
                <NotebookPen size={14} />{" "}
                {formatTotal(folderStats.studied, lang)}
              </span>
              {!isFolder && stats.percent === 100 && stats.total > 0 && (
                <span className="chip-done">
                  <CheckCircle2 size={14} /> {t("common.completed")}
                </span>
              )}
            </div>
            <div className="course-banner-progress">
              <div className="row between">
                <span className="muted">{t("course.completion")}</span>
                <span className="mono">
                  {display.done}/{display.total} · {display.percent}%
                </span>
              </div>
              <ProgressBar percent={display.percent} color={course.color} />
            </div>
          </div>
        </div>
        <div className="course-banner-side">
          <ProgressRing
            percent={display.percent}
            size={94}
            stroke={7}
            color={course.color}
          >
            <span className="ring-pct-lg">{display.percent}%</span>
          </ProgressRing>
          <div className="course-banner-actions">
            {isFolder ? (
              <>
                <button
                  className="btn btn-primary"
                  onClick={() =>
                    openImporter({ mode: "create", parentId: course.id })
                  }
                >
                  <Plus size={17} /> {t("folder.addSub")}
                </button>
                <button
                  className="btn btn-secondary"
                  onClick={() => {
                    setFolderParent(course.id);
                    setFolderOpen(true);
                  }}
                >
                  <FolderPlus size={17} /> {t("folder.newSub")}
                </button>
              </>
            ) : (
              <>
                <button className="btn btn-primary" onClick={start}>
                  <Play size={17} fill="currentColor" /> {startLabel}
                </button>
                <button
                  className="btn btn-secondary"
                  onClick={() =>
                    openImporter({ mode: "add", courseId: course.id })
                  }
                >
                  <Plus size={17} /> {t("course.addLessons")}
                </button>
                {playlistId && (
                  <button
                    className="btn btn-secondary"
                    onClick={() => void syncPlaylist(true)}
                    disabled={syncing}
                  >
                    <RefreshCw size={17} className={syncing ? "spin" : ""} />
                    {syncing ? t("course.syncing") : t("course.syncPlaylist")}
                  </button>
                )}
              </>
            )}
          </div>
          <div className="course-banner-menu">
            <KebabMenu
              items={[
                {
                  label: t("course.editCourse"),
                  icon: <Pencil size={15} />,
                  onClick: () => setEditing(true),
                },
                {
                  label: t("folder.moveTo"),
                  icon: <FolderInput size={15} />,
                  onClick: () => setMoveTarget(course.id),
                },
                ...(isFolder
                  ? []
                  : [
                      {
                        label: t("common.share"),
                        icon: <Share2 size={15} />,
                        onClick: () => openShare(course.id),
                      },
                    ]),
                {
                  label: t("lib.duplicate"),
                  icon: <Copy size={15} />,
                  onClick: () => {
                    const newId = duplicateCourse(course.id);
                    if (newId) {
                      pushToast(t("toast.courseCreated"));
                      navigate(`/course/${newId}`);
                    }
                  },
                },
                ...(isFolder
                  ? []
                  : [
                      {
                        label: t("course.reset"),
                        icon: <RotateCcw size={15} />,
                        onClick: () => setConfirmReset(true),
                      },
                    ]),
                {
                  label: t("common.delete"),
                  icon: <Trash2 size={15} />,
                  onClick: () => setConfirmDelete(true),
                  danger: true,
                },
              ]}
            />
          </div>
        </div>
      </section>

      {(isFolder || children.length > 0) && (
        <section className="panel lessons-panel">
          <div className="section-head">
            <h2>
              <FolderPlus size={18} /> {t("folder.subfolders")}
              <span className="count-pill">{childCount}</span>
            </h2>
            <div className="row gap-2">
              <div className="view-toggle">
                <button
                  className={view === "grid" ? "active" : ""}
                  onClick={() => updateSettings({ libraryView: "grid" })}
                  title={t("lib.viewGrid")}
                >
                  <LayoutGrid size={16} />
                </button>
                <button
                  className={view === "list" ? "active" : ""}
                  onClick={() => updateSettings({ libraryView: "list" })}
                  title={t("lib.viewList")}
                >
                  <List size={16} />
                </button>
              </div>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  setFolderParent(course.id);
                  setFolderOpen(true);
                }}
              >
                <FolderPlus size={15} /> {t("folder.newSub")}
              </button>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() =>
                  openImporter({ mode: "create", parentId: course.id })
                }
              >
                <Plus size={15} /> {t("folder.addSub")}
              </button>
            </div>
          </div>

          {children.length === 0 ? (
            <EmptyState
              icon={<FolderPlus size={28} />}
              title={t("lib.emptyFolder")}
              desc={t("lib.emptyFolderDesc")}
              action={
                <div className="row gap-2">
                  <button
                    className="btn btn-secondary"
                    onClick={() => {
                      setFolderParent(course.id);
                      setFolderOpen(true);
                    }}
                  >
                    <FolderPlus size={16} /> {t("folder.newSub")}
                  </button>
                  <button
                    className="btn btn-primary"
                    onClick={() =>
                      openImporter({ mode: "create", parentId: course.id })
                    }
                  >
                    <Plus size={16} /> {t("folder.addSub")}
                  </button>
                </div>
              }
            />
          ) : (
            <div
              className={`courses-grid ${view === "list" ? "list-view" : ""}`}
            >
              {sortCourses(children).map((child) => (
                <CourseCard
                  key={child.id}
                  course={child}
                  view={view}
                  percent={childPercent(child)}
                  childCount={
                    child.isFolder
                      ? childrenOf(courses, child.id).length
                      : undefined
                  }
                  menu={childMenu(child)}
                  dragging={dragChild === child.id}
                  dropMode={
                    childDropZone?.id === child.id && dragChild !== child.id
                      ? childDropZone.mode
                      : null
                  }
                  dragProps={childDragProps(child)}
                />
              ))}
            </div>
          )}
        </section>
      )}

      {!isFolder && (
        <section className="panel lessons-panel">
          <div className="section-head">
            <h2>
              <ListVideo size={18} /> {t("course.lessons")}{" "}
              <span className="count-pill">{stats.total}</span>
            </h2>
            <div className="row gap-2">
              {course.lessons.length > 1 && (
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => {
                    toggleLessonOrder(course.id);
                    pushToast(
                      t(
                        course.reverseLessons
                          ? "toast.orderRestored"
                          : "toast.orderReversed",
                      ),
                    );
                  }}
                  title={t(
                    course.reverseLessons
                      ? "course.normalOrder"
                      : "course.reverseOrder",
                  )}
                >
                  <ArrowDownUp size={15} />
                  {t(
                    course.reverseLessons
                      ? "course.normalOrder"
                      : "course.reverseOrder",
                  )}
                </button>
              )}
              <button
                className="btn btn-ghost btn-sm"
                onClick={() =>
                  openImporter({ mode: "add", courseId: course.id })
                }
              >
                <Plus size={15} /> {t("course.addLessons")}
              </button>
            </div>
          </div>

          {course.lessons.length === 0 ? (
            <EmptyState
              icon={<ListVideo size={28} />}
              title={t("course.noLessons")}
              desc={t("course.noLessonsDesc")}
              action={
                <button
                  className="btn btn-primary"
                  onClick={() =>
                    openImporter({ mode: "add", courseId: course.id })
                  }
                >
                  <Plus size={17} /> {t("course.addLessons")}
                </button>
              }
            />
          ) : (
            <div className="lesson-list">
              {course.lessons.map((lesson, i) => {
                const watchedPercent = lesson.duration
                  ? Math.min(100, (lesson.watched / lesson.duration) * 100)
                  : lesson.completed
                    ? 100
                    : 0;
                return (
                  <div
                    key={lesson.id}
                    className={`lesson-row ${lesson.completed ? "done" : ""} ${dropIndex === i ? "drop" : ""}`}
                    draggable
                    onDragStart={(e) => {
                      setDragIndex(i);
                      e.dataTransfer.effectAllowed = "move";
                    }}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setDropIndex(i);
                    }}
                    onDragLeave={() =>
                      setDropIndex((d) => (d === i ? null : d))
                    }
                    onDrop={(e) => {
                      e.preventDefault();
                      onDrop(i);
                    }}
                    onDragEnd={() => {
                      setDragIndex(null);
                      setDropIndex(null);
                    }}
                  >
                    <span className="drag-handle" title={t("common.edit")}>
                      <GripVertical size={16} />
                    </span>
                    <span className="lesson-index">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <button
                      className="lesson-thumb"
                      onClick={() => openLesson(lesson)}
                    >
                      {lesson.thumbnail ? (
                        <img src={lesson.thumbnail} alt="" loading="lazy" />
                      ) : (
                        <span className="lesson-thumb-fallback">
                          {course.emoji}
                        </span>
                      )}
                      <span className="lesson-play">
                        <Play size={16} fill="currentColor" />
                      </span>
                      {lesson.duration ? (
                        <span className="lesson-duration">
                          {formatClock(lesson.duration)}
                        </span>
                      ) : null}
                    </button>
                    <div
                      className="lesson-info"
                      onClick={() => openLesson(lesson)}
                    >
                      <div className="lesson-title-line">
                        <span className="lesson-kind">
                          {lesson.kind === "youtube" ? (
                            <Youtube size={14} />
                          ) : lesson.kind === "link" ? (
                            <Link2 size={14} />
                          ) : (
                            <FileVideo size={14} />
                          )}
                        </span>
                        <strong>{lesson.title}</strong>
                      </div>
                      <div className="lesson-sub">
                        {lesson.author && <span>{lesson.author}</span>}
                        {lesson.completed ? (
                          <span className="status done">
                            <Check size={12} /> {t("common.completed")}
                          </span>
                        ) : lesson.watched > 0 ? (
                          <span className="status progress">
                            {t("watch.watched")}{" "}
                            {formatTotal(lesson.watched, lang)}
                          </span>
                        ) : (
                          <span className="status new">
                            {t("common.notStarted")}
                          </span>
                        )}
                        {lesson.notes.length > 0 && (
                          <span className="status notes">
                            <NotebookPen size={12} /> {lesson.notes.length}
                          </span>
                        )}
                      </div>
                      {(lesson.watched > 0 || lesson.completed) && (
                        <div className="lesson-watched">
                          <span
                            style={{
                              width: `${Math.max(watchedPercent, lesson.completed ? 100 : 2)}%`,
                              background: lesson.completed
                                ? "var(--success)"
                                : course.color,
                            }}
                          />
                        </div>
                      )}
                    </div>
                    <div className="lesson-actions">
                      <button
                        className={`round-check ${lesson.completed ? "checked" : ""}`}
                        onClick={() => {
                          const changed = setLessonComplete(
                            course.id,
                            lesson.id,
                            !lesson.completed,
                          );
                          if (changed)
                            pushToast(
                              lesson.completed
                                ? t("toast.uncompleted")
                                : t("toast.completed"),
                              lesson.completed ? "info" : "success",
                            );
                        }}
                        title={
                          lesson.completed
                            ? t("course.markUndone")
                            : t("course.markDone")
                        }
                      >
                        <Check size={15} />
                      </button>
                      <KebabMenu
                        items={[
                          {
                            label: t("course.play"),
                            icon: <Play size={15} />,
                            onClick: () => openLesson(lesson),
                          },
                          {
                            label: lesson.completed
                              ? t("course.markUndone")
                              : t("course.markDone"),
                            icon: <CheckCircle2 size={15} />,
                            onClick: () =>
                              setLessonComplete(
                                course.id,
                                lesson.id,
                                !lesson.completed,
                              ),
                          },
                          {
                            label: t("course.editLesson"),
                            icon: <Pencil size={15} />,
                            onClick: () => setLessonToEdit(lesson),
                          },
                          ...(i > 0
                            ? [
                                {
                                  label: t("course.moveUp"),
                                  icon: (
                                    <ArrowLeft
                                      size={15}
                                      className="rotate-up"
                                    />
                                  ),
                                  onClick: () =>
                                    moveLesson(course.id, i, i - 1),
                                },
                              ]
                            : []),
                          ...(i < course.lessons.length - 1
                            ? [
                                {
                                  label: t("course.moveDown"),
                                  icon: (
                                    <ArrowLeft
                                      size={15}
                                      className="rotate-down"
                                    />
                                  ),
                                  onClick: () =>
                                    moveLesson(course.id, i, i + 1),
                                },
                              ]
                            : []),
                          {
                            label: t("common.delete"),
                            icon: <Trash2 size={15} />,
                            onClick: () => setLessonToDelete(lesson),
                            danger: true,
                          },
                        ]}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      <FolderModal
        open={folderOpen}
        onClose={() => setFolderOpen(false)}
        parentId={folderParent ?? course.id}
        onCreated={(newId) => navigate(`/course/${newId}`)}
      />

      <MoveToFolderModal
        open={!!moveTarget}
        courseId={moveTarget}
        onClose={() => setMoveTarget(null)}
      />

      <Modal
        open={editing}
        onClose={() => setEditing(false)}
        title={t("course.editCourse")}
        size="md"
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setEditing(false)}>
              {t("common.cancel")}
            </button>
            <button
              className="btn btn-primary"
              onClick={saveEdit}
              disabled={!form.title.trim()}
            >
              {t("common.save")}
            </button>
          </>
        }
      >
        <Field label={t("course.editTitle")}>
          <input
            className="input"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
          />
        </Field>
        <Field label={t("course.editDesc")}>
          <textarea
            className="input textarea"
            rows={3}
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
        </Field>
        <Field label={t("course.emoji")}>
          <div className="emoji-grid">
            {EMOJIS.map((e) => (
              <button
                key={e}
                className={`emoji-btn ${form.emoji === e ? "active" : ""}`}
                onClick={() => setForm({ ...form, emoji: e })}
              >
                {e}
              </button>
            ))}
          </div>
        </Field>
        <Field label={t("course.color")}>
          <div className="color-grid">
            {COLORS.map((c) => (
              <button
                key={c}
                className={`color-btn ${form.color === c ? "active" : ""}`}
                style={{ background: c }}
                onClick={() => setForm({ ...form, color: c })}
              />
            ))}
          </div>
        </Field>
      </Modal>

      <Modal
        open={!!lessonToEdit}
        onClose={() => setLessonToEdit(null)}
        title={t("course.editLesson")}
        size="sm"
        footer={
          <>
            <button
              className="btn btn-ghost"
              onClick={() => setLessonToEdit(null)}
            >
              {t("common.cancel")}
            </button>
            <button
              className="btn btn-primary"
              onClick={saveLesson}
              disabled={!lessonForm.title.trim()}
            >
              {t("common.save")}
            </button>
          </>
        }
      >
        <Field label={t("add.manualTitle")}>
          <input
            className="input"
            value={lessonForm.title}
            onChange={(e) =>
              setLessonForm({ ...lessonForm, title: e.target.value })
            }
          />
        </Field>
        <Field label={t("add.manualUrl")}>
          <input
            className="input"
            dir="ltr"
            value={lessonForm.url}
            onChange={(e) =>
              setLessonForm({ ...lessonForm, url: e.target.value })
            }
          />
        </Field>
      </Modal>

      <ConfirmDialog
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        onConfirm={() => {
          resetCourseProgress(course.id);
          pushToast(t("toast.reset"), "info");
        }}
        title={t("course.resetTitle")}
        desc={t("course.resetDesc")}
        confirmLabel={t("course.reset")}
      />

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => {
          const parent = course.parentId
            ? `/course/${course.parentId}`
            : "/library";
          deleteCourse(course.id);
          pushToast(t("toast.courseDeleted"), "info");
          navigate(parent);
        }}
        title={t("lib.deleteTitle")}
        desc={
          descendantIds(courses, course.id).length > 0
            ? t("folder.deleteNested")
            : t("lib.deleteDesc")
        }
        confirmLabel={t("common.delete")}
      />

      <ConfirmDialog
        open={!!childToDelete}
        onClose={() => setChildToDelete(null)}
        onConfirm={() => {
          if (childToDelete) {
            deleteCourse(childToDelete.id);
            pushToast(t("toast.courseDeleted"), "info");
          }
        }}
        title={t("lib.deleteTitle")}
        desc={
          childToDelete && descendantIds(courses, childToDelete.id).length > 0
            ? t("folder.deleteNested")
            : t("lib.deleteDesc")
        }
        confirmLabel={t("common.delete")}
      />

      <ConfirmDialog
        open={!!lessonToDelete}
        onClose={() => setLessonToDelete(null)}
        onConfirm={() => {
          if (lessonToDelete) {
            deleteLesson(course.id, lessonToDelete.id);
            pushToast(t("toast.lessonDeleted"), "info");
          }
        }}
        title={t("course.deleteLessonTitle")}
        desc={t("course.deleteLessonDesc")}
        confirmLabel={t("common.delete")}
      />
    </div>
  );
}
