import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  Course,
  CourseDaily,
  Lesson,
  Settings,
  Note,
  StudyMode,
} from "../types";
import { todayKey, uid } from "../lib/utils";
import { DEFAULT_PALETTE } from "../lib/theme";

export const defaultSettings: Settings = {
  name: "",
  lang: "ar",
  theme: "dark",
  accentPalette: DEFAULT_PALETTE.id,
  accentColor: DEFAULT_PALETTE.accent,
  accentColor2: DEFAULT_PALETTE.accent2,
  apiKey: "",
  autoComplete: true,
  autoResume: true,
  pomodoroWork: 25,
  pomodoroBreak: 5,
  pomodoroModeMinutes: { study: 25, leisure: 25, none: 0 },
  dailyGoal: 60,
  onboarded: false,
  sidebarCollapsed: false,
  libraryView: "grid",
  timerMinutes: 25,
  timerMode: "study",
  timerModeMinutes: { study: 25, leisure: 25, none: 0 },
  timerAlarm: "chime",
  timerVolume: 0.8,
  timerVideoUrl: "",
  timerCustomAlarmName: "",
};

/** Merge a (possibly old) settings object with the current defaults. */
function mergeSettings(patch?: Partial<Settings> | null): Settings {
  return {
    ...defaultSettings,
    ...(patch || {}),
    pomodoroModeMinutes: {
      ...defaultSettings.pomodoroModeMinutes,
      ...(patch?.pomodoroModeMinutes || {}),
    },
    timerModeMinutes: {
      ...defaultSettings.timerModeMinutes,
      ...(patch?.timerModeMinutes || {}),
    },
  };
}

const COLORS = [
  "#8b5cf6",
  "#22d3ee",
  "#f472b6",
  "#34d399",
  "#fbbf24",
  "#fb7185",
  "#60a5fa",
  "#a78bfa",
];

interface CreateCourseInput {
  title: string;
  description?: string;
  emoji?: string;
  color?: string;
  lessons?: Lesson[];
  sourceUrl?: string;
  parentId?: string | null;
  mode?: StudyMode;
  isFolder?: boolean;
}

export interface BackupData {
  app: string;
  version: number;
  exportedAt: string;
  courses: Course[];
  daily: Record<string, number>;
  leisure?: Record<string, number>;
  courseDaily?: CourseDaily;
  settings?: Partial<Settings>;
}

interface ProgressResult {
  completedNow: boolean;
  goalReached: boolean;
  today: number;
}

interface AppStore {
  courses: Course[];
  daily: Record<string, number>;
  leisure: Record<string, number>;
  courseDaily: CourseDaily;
  settings: Settings;

  createCourse: (input: CreateCourseInput) => string;
  updateCourse: (
    id: string,
    patch: Partial<Omit<Course, "id" | "lessons">>,
  ) => void;
  deleteCourse: (id: string) => void;
  duplicateCourse: (id: string) => string | null;
  moveCourse: (id: string, parentId: string | null, index: number) => void;
  addLessons: (courseId: string, lessons: Lesson[]) => number;
  /** Rebuild a course's lesson list in the playlist order, keeping progress for existing videos. */
  syncLessons: (
    courseId: string,
    playlistLessons: Lesson[],
  ) => { added: number; reordered: boolean };
  updateLesson: (
    courseId: string,
    lessonId: string,
    patch: Partial<Lesson>,
  ) => void;
  deleteLesson: (courseId: string, lessonId: string) => void;
  moveLesson: (courseId: string, from: number, to: number) => void;
  /** Flip the lesson order and remember it for the next playlist sync. */
  toggleLessonOrder: (courseId: string) => void;
  setLessonComplete: (
    courseId: string,
    lessonId: string,
    completed: boolean,
  ) => boolean;
  addNote: (
    courseId: string,
    lessonId: string,
    text: string,
    at: number,
  ) => void;
  deleteNote: (courseId: string, lessonId: string, noteId: string) => void;
  recordProgress: (
    courseId: string,
    lessonId: string,
    seconds: number,
    position: number,
    forcePosition?: boolean,
    mode?: StudyMode,
  ) => ProgressResult;
  resetCourseProgress: (courseId: string) => void;
  addModeTime: (seconds: number, mode: StudyMode) => void;
  updateSettings: (patch: Partial<Settings>) => void;
  importBackup: (data: BackupData) => boolean;
  resetAll: () => void;
}

/* ------------------------------------------------------------------ */
/* Folder helpers                                                      */
/* ------------------------------------------------------------------ */

export function parentOf(course: Course): string | null {
  return course.parentId ?? null;
}

export function sortCourses(list: Course[]): Course[] {
  return [...list].sort((a, b) => {
    const ao = a.order ?? a.createdAt;
    const bo = b.order ?? b.createdAt;
    if (ao !== bo) return ao - bo;
    return a.createdAt - b.createdAt;
  });
}

export function childrenOf(
  courses: Course[],
  parentId: string | null,
): Course[] {
  return sortCourses(courses.filter((c) => parentOf(c) === parentId));
}

export function descendantIds(courses: Course[], id: string): string[] {
  const out: string[] = [];
  const walk = (parentId: string) => {
    for (const c of courses) {
      if (parentOf(c) === parentId) {
        out.push(c.id);
        walk(c.id);
      }
    }
  };
  walk(id);
  return out;
}

function nextOrder(courses: Course[], parentId: string | null): number {
  const kids = courses.filter((c) => parentOf(c) === parentId);
  if (!kids.length) return 0;
  return Math.max(...kids.map((c) => c.order ?? c.createdAt)) + 1;
}

function normalizeCourse(course: Course, index: number): Course {
  return {
    ...course,
    isFolder: !!course.isFolder,
    parentId: course.parentId ?? null,
    order: course.order ?? index,
    mode: course.mode ?? "study",
    lessons: (course.lessons ?? []).map((l) => ({
      ...l,
      notes: l.notes ?? [],
    })),
  };
}

/** Remove the demo course that older versions seeded on first launch. */
function isLegacySeedCourse(course: Course): boolean {
  return (
    course.title === "ابدأ من هنا ✨" &&
    course.lessons.length === 1 &&
    course.lessons[0]?.videoId === "jNQXAC9IVRw"
  );
}

function dedupeKey(lesson: Lesson): string {
  if (lesson.kind === "youtube" && lesson.videoId)
    return `yt:${lesson.videoId}`;
  return `url:${(lesson.url || lesson.title).toLowerCase()}`;
}

export const useStore = create<AppStore>()(
  persist(
    (set, get) => ({
      courses: [],
      daily: {},
      leisure: {},
      courseDaily: {},
      settings: defaultSettings,

      createCourse: (input) => {
        const now = Date.now();
        const id = uid("c_");
        const lessons = (input.lessons ?? []).map((l, i) => ({
          ...l,
          createdAt: l.createdAt || now + i,
        }));
        const course: Course = {
          id,
          title: input.title.trim() || "Untitled course",
          description: input.description,
          emoji: input.emoji || "📚",
          color:
            input.color || COLORS[Math.floor(Math.random() * COLORS.length)],
          lessons,
          isFolder: !!input.isFolder,
          sourceUrl: input.sourceUrl,
          parentId: input.parentId ?? null,
          order: nextOrder(get().courses, input.parentId ?? null),
          mode: input.mode ?? "study",
          createdAt: now,
          updatedAt: now,
        };
        set((s) => ({ courses: [...s.courses, course] }));
        return id;
      },

      updateCourse: (id, patch) =>
        set((s) => ({
          courses: s.courses.map((c) =>
            c.id === id ? { ...c, ...patch, updatedAt: Date.now() } : c,
          ),
        })),

      deleteCourse: (id) =>
        set((s) => {
          const doomed = new Set([id, ...descendantIds(s.courses, id)]);
          return { courses: s.courses.filter((c) => !doomed.has(c.id)) };
        }),

      duplicateCourse: (id) => {
        const { courses } = get();
        const original = courses.find((c) => c.id === id);
        if (!original) return null;
        const now = Date.now();
        const newId = uid("c_");
        const tree = [id, ...descendantIds(courses, id)];
        const idMap = new Map<string, string>(
          tree.map((oldId) => [oldId, oldId === id ? newId : uid("c_")]),
        );
        const copies = tree.map((oldId) => {
          const source = courses.find((c) => c.id === oldId)!;
          return {
            ...source,
            id: idMap.get(oldId)!,
            title:
              oldId === id
                ? `${source.title} (${source.title ? "copy" : ""})`
                : source.title,
            parentId:
              oldId === id
                ? (source.parentId ?? null)
                : (idMap.get(source.parentId || "") ?? newId),
            createdAt: now + tree.indexOf(oldId),
            updatedAt: now,
            lessons: source.lessons.map((l) => ({
              ...l,
              id: uid("l_"),
              completed: false,
              completedAt: undefined,
              position: 0,
              watched: 0,
              notes: [],
              createdAt: now,
            })),
          };
        });
        set((s) => ({ courses: [...s.courses, ...copies] }));
        return newId;
      },

      moveCourse: (id, parentId, index) =>
        set((s) => {
          const moving = s.courses.find((c) => c.id === id);
          if (!moving) return s;
          if (
            parentId &&
            (parentId === id || descendantIds(s.courses, id).includes(parentId))
          )
            return s;
          const oldParent = moving.parentId ?? null;
          const oldSiblings = sortCourses(
            s.courses.filter((c) => parentOf(c) === oldParent && c.id !== id),
          );
          const newSiblings = sortCourses(
            s.courses.filter((c) => parentOf(c) === parentId && c.id !== id),
          );
          const clamped = Math.max(0, Math.min(index, newSiblings.length));
          newSiblings.splice(clamped, 0, { ...moving, parentId });
          const orderMap = new Map<string, number>();
          oldSiblings.forEach((c, i) => orderMap.set(c.id, i));
          newSiblings.forEach((c, i) => orderMap.set(c.id, i));
          return {
            courses: s.courses.map((c) => {
              if (c.id === id) {
                return {
                  ...c,
                  parentId,
                  order: orderMap.get(id) ?? clamped,
                  updatedAt: Date.now(),
                };
              }
              return orderMap.has(c.id)
                ? { ...c, order: orderMap.get(c.id)! }
                : c;
            }),
          };
        }),

      addLessons: (courseId, lessons) => {
        const course = get().courses.find((c) => c.id === courseId);
        if (!course) return 0;
        const existing = new Set(course.lessons.map(dedupeKey));
        const unique = lessons.filter((l) => {
          const key = dedupeKey(l);
          if (existing.has(key)) return false;
          existing.add(key);
          return true;
        });
        if (!unique.length) return 0;
        set((s) => ({
          courses: s.courses.map((c) =>
            c.id === courseId
              ? {
                  ...c,
                  lessons: [...c.lessons, ...unique],
                  updatedAt: Date.now(),
                }
              : c,
          ),
        }));
        return unique.length;
      },

      syncLessons: (courseId, playlistLessons) => {
        const course = get().courses.find((c) => c.id === courseId);
        if (!course) return { added: 0, reordered: false };
        const existingByKey = new Map<string, Lesson>();
        for (const lesson of course.lessons) {
          const key = dedupeKey(lesson);
          if (!existingByKey.has(key)) existingByKey.set(key, lesson);
        }
        const seen = new Set<string>();
        const ordered: Lesson[] = [];
        let added = 0;
        for (const fresh of playlistLessons) {
          const key = dedupeKey(fresh);
          if (seen.has(key)) continue;
          seen.add(key);
          const existing = existingByKey.get(key);
          if (existing) {
            ordered.push(existing);
          } else {
            ordered.push(fresh);
            added += 1;
          }
        }
        if (course.reverseLessons) ordered.reverse();
        // Keep lessons that are not in the playlist (manual additions) after the playlist items.
        for (const lesson of course.lessons) {
          if (!seen.has(dedupeKey(lesson))) ordered.push(lesson);
        }
        const previousOrder = course.lessons.map(dedupeKey).join("|");
        const nextOrder = ordered.map(dedupeKey).join("|");
        set((s) => ({
          courses: s.courses.map((c) =>
            c.id === courseId
              ? { ...c, lessons: ordered, updatedAt: Date.now() }
              : c,
          ),
        }));
        return { added, reordered: previousOrder !== nextOrder };
      },

      updateLesson: (courseId, lessonId, patch) =>
        set((s) => ({
          courses: s.courses.map((c) =>
            c.id === courseId
              ? {
                  ...c,
                  updatedAt: Date.now(),
                  lessons: c.lessons.map((l) =>
                    l.id === lessonId ? { ...l, ...patch } : l,
                  ),
                }
              : c,
          ),
        })),

      deleteLesson: (courseId, lessonId) =>
        set((s) => ({
          courses: s.courses.map((c) =>
            c.id === courseId
              ? {
                  ...c,
                  lessons: c.lessons.filter((l) => l.id !== lessonId),
                  updatedAt: Date.now(),
                }
              : c,
          ),
        })),

      moveLesson: (courseId, from, to) =>
        set((s) => ({
          courses: s.courses.map((c) => {
            if (c.id !== courseId) return c;
            const lessons = [...c.lessons];
            if (
              from < 0 ||
              to < 0 ||
              from >= lessons.length ||
              to >= lessons.length
            )
              return c;
            const [moved] = lessons.splice(from, 1);
            lessons.splice(to, 0, moved);
            return { ...c, lessons, updatedAt: Date.now() };
          }),
        })),

      toggleLessonOrder: (courseId) =>
        set((s) => ({
          courses: s.courses.map((c) =>
            c.id === courseId
              ? {
                  ...c,
                  reverseLessons: !c.reverseLessons,
                  lessons: [...c.lessons].reverse(),
                  updatedAt: Date.now(),
                }
              : c,
          ),
        })),

      setLessonComplete: (courseId, lessonId, completed) => {
        const course = get().courses.find((c) => c.id === courseId);
        const lesson = course?.lessons.find((l) => l.id === lessonId);
        if (!lesson) return false;
        if (lesson.completed === completed) return false;
        set((s) => ({
          courses: s.courses.map((c) =>
            c.id === courseId
              ? {
                  ...c,
                  updatedAt: Date.now(),
                  lessons: c.lessons.map((l) =>
                    l.id === lessonId
                      ? {
                          ...l,
                          completed,
                          completedAt: completed ? Date.now() : undefined,
                        }
                      : l,
                  ),
                }
              : c,
          ),
        }));
        return true;
      },

      addNote: (courseId, lessonId, text, at) => {
        const note: Note = {
          id: uid("n_"),
          text: text.trim(),
          at,
          createdAt: Date.now(),
        };
        set((s) => ({
          courses: s.courses.map((c) =>
            c.id === courseId
              ? {
                  ...c,
                  updatedAt: Date.now(),
                  lessons: c.lessons.map((l) =>
                    l.id === lessonId ? { ...l, notes: [...l.notes, note] } : l,
                  ),
                }
              : c,
          ),
        }));
      },

      deleteNote: (courseId, lessonId, noteId) =>
        set((s) => ({
          courses: s.courses.map((c) =>
            c.id === courseId
              ? {
                  ...c,
                  updatedAt: Date.now(),
                  lessons: c.lessons.map((l) =>
                    l.id === lessonId
                      ? { ...l, notes: l.notes.filter((n) => n.id !== noteId) }
                      : l,
                  ),
                }
              : c,
          ),
        })),

      recordProgress: (
        courseId,
        lessonId,
        seconds,
        position,
        forcePosition = false,
        mode = "study",
      ) => {
        const { courses, daily, leisure, settings } = get();
        const course = courses.find((c) => c.id === courseId);
        const lesson = course?.lessons.find((l) => l.id === lessonId);
        const day = todayKey();
        const before = daily[day] || 0;
        const add = Math.max(0, Math.round(seconds));
        if (!lesson)
          return { completedNow: false, goalReached: false, today: before };

        const nextWatched = lesson.watched + add;
        let completedNow = false;
        let completed = lesson.completed;
        if (
          settings.autoComplete &&
          !lesson.completed &&
          lesson.duration &&
          lesson.duration > 5 &&
          nextWatched / lesson.duration >= 0.9
        ) {
          completed = true;
          completedNow = true;
        }

        const nextPosition = forcePosition
          ? position
          : Math.max(lesson.position, position);

        const counts = add > 0 && mode !== "none";
        const dailyPatch =
          counts && mode === "study"
            ? { ...daily, [day]: (daily[day] || 0) + add }
            : daily;
        const leisurePatch =
          counts && mode === "leisure"
            ? { ...leisure, [day]: (leisure[day] || 0) + add }
            : leisure;

        set((s) => {
          let courseDaily = s.courseDaily;
          if (counts) {
            const perCourse = s.courseDaily[courseId] || {};
            const entry = perCourse[day] || { study: 0, leisure: 0 };
            courseDaily = {
              ...s.courseDaily,
              [courseId]: {
                ...perCourse,
                [day]: { ...entry, [mode]: entry[mode] + add },
              },
            };
          }
          return {
            daily: dailyPatch,
            leisure: leisurePatch,
            courseDaily,
            courses: s.courses.map((c) =>
              c.id === courseId
                ? {
                    ...c,
                    updatedAt: Date.now(),
                    lessons: c.lessons.map((l) =>
                      l.id === lessonId
                        ? {
                            ...l,
                            watched: nextWatched,
                            position:
                              l.completed && !forcePosition
                                ? l.position
                                : nextPosition,
                            completed,
                            completedAt: completedNow
                              ? Date.now()
                              : l.completedAt,
                          }
                        : l,
                    ),
                  }
                : c,
            ),
          };
        });

        const after = mode === "study" ? before + add : before;
        const goalReached =
          mode === "study" &&
          settings.dailyGoal > 0 &&
          before < settings.dailyGoal * 60 &&
          after >= settings.dailyGoal * 60;
        return { completedNow, goalReached, today: after };
      },

      resetCourseProgress: (courseId) =>
        set((s) => ({
          courses: s.courses.map((c) =>
            c.id === courseId
              ? {
                  ...c,
                  updatedAt: Date.now(),
                  lessons: c.lessons.map((l) => ({
                    ...l,
                    completed: false,
                    completedAt: undefined,
                    position: 0,
                    watched: 0,
                    notes: [],
                  })),
                }
              : c,
          ),
        })),

      updateSettings: (patch) =>
        set((s) => {
          const next = { ...s.settings, ...patch };
          if (patch.pomodoroModeMinutes) {
            next.pomodoroModeMinutes = {
              ...s.settings.pomodoroModeMinutes,
              ...patch.pomodoroModeMinutes,
            };
          }
          if (patch.timerModeMinutes) {
            next.timerModeMinutes = {
              ...s.settings.timerModeMinutes,
              ...patch.timerModeMinutes,
            };
          }
          return { settings: next };
        }),

      addModeTime: (seconds, mode) => {
        const add = Math.max(0, Math.round(seconds));
        if (!add || mode === "none") return;
        const day = todayKey();
        set((s) =>
          mode === "study"
            ? { daily: { ...s.daily, [day]: (s.daily[day] || 0) + add } }
            : { leisure: { ...s.leisure, [day]: (s.leisure[day] || 0) + add } },
        );
      },

      importBackup: (data) => {
        if (!data || !Array.isArray(data.courses)) return false;
        const daily =
          data.daily && typeof data.daily === "object" ? data.daily : {};
        const leisure =
          data.leisure && typeof data.leisure === "object" ? data.leisure : {};
        const courseDaily =
          data.courseDaily && typeof data.courseDaily === "object"
            ? data.courseDaily
            : {};
        const courses = data.courses.map((c, i) => normalizeCourse(c, i));
        set((s) => ({
          courses,
          daily,
          leisure,
          courseDaily,
          settings: mergeSettings({ ...s.settings, ...(data.settings || {}) }),
        }));
        return true;
      },

      resetAll: () =>
        set((s) => ({
          courses: [],
          daily: {},
          leisure: {},
          courseDaily: {},
          settings: {
            ...defaultSettings,
            lang: s.settings.lang,
            theme: s.settings.theme,
            onboarded: true,
          },
        })),
    }),
    {
      name: "rakkez-state-v1",
      version: 5,
      migrate: (persisted: any) => {
        const state = persisted || {};
        return {
          ...state,
          courses: (state.courses || [])
            .filter((c: Course) => !isLegacySeedCourse(c))
            .map((c: Course, i: number) => normalizeCourse(c, i)),
          daily: state.daily || {},
          leisure: state.leisure || {},
          courseDaily: state.courseDaily || {},
          settings: mergeSettings(state.settings),
        };
      },
      partialize: (state) => ({
        courses: state.courses,
        daily: state.daily,
        leisure: state.leisure,
        courseDaily: state.courseDaily,
        settings: state.settings,
      }),
    },
  ),
);

export function makeLesson(
  partial: Partial<Lesson> & { title: string; kind: Lesson["kind"] },
): Lesson {
  return {
    id: uid("l_"),
    completed: false,
    position: 0,
    watched: 0,
    notes: [],
    createdAt: Date.now(),
    ...partial,
  };
}
