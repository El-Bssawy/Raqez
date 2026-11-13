import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  BarChart3,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Coffee,
  Flame,
  Layers,
  Target,
  TrendingUp,
} from "lucide-react";
import { useStore } from "../store/store";
import {
  useI18n,
  EmptyState,
  ProgressRing,
  ProgressBar,
  Select,
} from "../components/ui";
import {
  bestStreak,
  computeStreak,
  courseStats,
  dateKeyOffset,
  formatPrecise,
  formatTotal,
  todayKey,
  todaySeconds,
} from "../lib/utils";

type Period = "7" | "30" | "90" | "all";
type ModeFilter = "all" | "study" | "leisure";

function level(seconds: number): number {
  if (seconds <= 0) return 0;
  if (seconds < 10 * 60) return 1;
  if (seconds < 30 * 60) return 2;
  if (seconds < 60 * 60) return 3;
  return 4;
}

export default function StatsPage() {
  const { t, lang } = useI18n();
  const daily = useStore((s) => s.daily);
  const leisure = useStore((s) => s.leisure);
  const courseDaily = useStore((s) => s.courseDaily);
  const courses = useStore((s) => s.courses);
  const settings = useStore((s) => s.settings);

  const [period, setPeriod] = useState<Period>("30");
  const [courseId, setCourseId] = useState<string>("all");
  const [mode, setMode] = useState<ModeFilter>("all");

  const courseOptions = useMemo(
    () => [
      { value: "all", label: t("stats.allCourses") },
      ...courses
        .filter((c) => !c.isFolder)
        .map((c) => ({ value: c.id, label: c.title })),
    ],
    [courses, t],
  );

  const keys = useMemo(() => {
    if (period === "all") {
      const set = new Set<string>([
        ...Object.keys(daily),
        ...Object.keys(leisure),
        ...(courseId !== "all" ? Object.keys(courseDaily[courseId] || {}) : []),
      ]);
      return [...set].sort();
    }
    const n = Number(period);
    return Array.from({ length: n }, (_, i) => dateKeyOffset(n - 1 - i));
  }, [period, daily, leisure, courseDaily, courseId]);

  const raw = (key: string) => {
    if (courseId === "all") {
      return { study: daily[key] || 0, leisure: leisure[key] || 0 };
    }
    const entry = courseDaily[courseId]?.[key];
    return { study: entry?.study || 0, leisure: entry?.leisure || 0 };
  };

  const filtered = (key: string) => {
    const value = raw(key);
    return {
      study: mode === "leisure" ? 0 : value.study,
      leisure: mode === "study" ? 0 : value.leisure,
    };
  };

  const totals = useMemo(() => {
    let study = 0;
    let leisureTotal = 0;
    let activeDays = 0;
    keys.forEach((key) => {
      const value = filtered(key);
      study += value.study;
      leisureTotal += value.leisure;
      if (value.study + value.leisure > 0) activeDays += 1;
    });
    return {
      study,
      leisure: leisureTotal,
      total: study + leisureTotal,
      activeDays,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keys, daily, leisure, courseDaily, courseId, mode]);

  const completedLessons = useMemo(() => {
    const pool =
      courseId === "all"
        ? courses.filter((c) => !c.isFolder)
        : courses.filter((c) => c.id === courseId);
    return pool.reduce(
      (n, c) => n + c.lessons.filter((l) => l.completed).length,
      0,
    );
  }, [courses, courseId]);

  const totalLessons = useMemo(() => {
    const pool =
      courseId === "all"
        ? courses.filter((c) => !c.isFolder)
        : courses.filter((c) => c.id === courseId);
    return pool.reduce((n, c) => n + c.lessons.length, 0);
  }, [courses, courseId]);

  const current = computeStreak(daily);
  const best = bestStreak(daily);
  const today = todaySeconds(mode === "leisure" ? leisure : daily);

  const calendar = useMemo(() => {
    const cells = Array.from({ length: 84 }, (_, i) => {
      const key = dateKeyOffset(83 - i);
      const value = filtered(key);
      return { key, seconds: value.study + value.leisure };
    });
    const weeks: (typeof cells)[] = [];
    for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
    return weeks;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [daily, leisure, courseDaily, courseId, mode]);

  const chartDays = useMemo(() => {
    const n = period === "7" ? 7 : 14;
    return Array.from({ length: n }, (_, i) => {
      const key = dateKeyOffset(n - 1 - i);
      const value = filtered(key);
      const date = new Date(`${key}T12:00:00`);
      return {
        key,
        study: value.study,
        leisure: value.leisure,
        label: new Intl.DateTimeFormat(lang === "ar" ? "ar-EG" : "en-US", {
          day: "numeric",
          month: "short",
        }).format(date),
        weekday: new Intl.DateTimeFormat(lang === "ar" ? "ar-EG" : "en-US", {
          weekday: "short",
        }).format(date),
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period, daily, leisure, courseDaily, courseId, mode, lang]);

  const chartMax = Math.max(60, ...chartDays.map((d) => d.study + d.leisure));

  const bestDay = useMemo(() => {
    return keys.reduce<{ key: string; seconds: number }>(
      (acc, key) => {
        const value = filtered(key);
        const seconds = value.study + value.leisure;
        return seconds > acc.seconds ? { key, seconds } : acc;
      },
      { key: "", seconds: 0 },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keys, daily, leisure, courseDaily, courseId, mode]);

  const byCourse = useMemo(() => {
    const pool =
      courseId === "all"
        ? courses.filter((c) => !c.isFolder)
        : courses.filter((c) => c.id === courseId);
    return pool
      .map((course) => {
        let study = 0;
        let fun = 0;
        keys.forEach((key) => {
          const entry = courseDaily[course.id]?.[key];
          if (entry) {
            if (mode !== "leisure") study += entry.study || 0;
            if (mode !== "study") fun += entry.leisure || 0;
          }
        });
        return {
          course,
          stats: courseStats(course),
          study,
          leisure: fun,
          total: study + fun,
        };
      })
      .filter((row) => row.total > 0 || row.stats.total > 0)
      .sort((a, b) => b.total - a.total);
  }, [courses, courseId, courseDaily, keys, mode]);

  const goalPercent = Math.min(
    100,
    (today / Math.max(1, settings.dailyGoal * 60)) * 100,
  );
  const bestDayLabel = bestDay.key
    ? new Intl.DateTimeFormat(lang === "ar" ? "ar-EG" : "en-US", {
        day: "numeric",
        month: "short",
      }).format(new Date(`${bestDay.key}T12:00:00`))
    : "—";

  const hasData = totals.total > 0 || completedLessons > 0;
  const studyShare = totals.total
    ? Math.round((totals.study / totals.total) * 100)
    : 0;
  const leisureShare = totals.total ? 100 - studyShare : 0;

  return (
    <div>
      <div className="page-head">
        <div>
          <h1 className="page-title">{t("stats.title")}</h1>
          <p className="page-sub">{t("stats.subtitle")}</p>
        </div>
        <span className="date-chip">
          <CalendarDays size={15} /> {formatTotal(totals.total, lang)}
        </span>
      </div>

      <div className="stats-filters panel">
        <div className="stats-filter-group">
          <span className="stats-filter-label">{t("stats.period")}</span>
          <Select
            value={period}
            onChange={(v) => setPeriod(v as Period)}
            options={[
              { value: "7", label: t("stats.last7") },
              { value: "30", label: t("stats.last30") },
              { value: "90", label: t("stats.last90") },
              { value: "all", label: t("stats.allTime") },
            ]}
          />
        </div>
        <div className="stats-filter-group">
          <span className="stats-filter-label">{t("stats.course")}</span>
          <Select
            value={courseId}
            onChange={setCourseId}
            options={courseOptions}
          />
        </div>
        <div className="stats-filter-group">
          <span className="stats-filter-label">{t("stats.mode")}</span>
          <div className="filter-chips">
            {(
              [
                { id: "all", label: t("stats.allModes") },
                { id: "study", label: t("stats.study") },
                { id: "leisure", label: t("stats.leisure") },
              ] as Array<{ id: ModeFilter; label: string }>
            ).map((item) => (
              <button
                key={item.id}
                className={`chip ${mode === item.id ? "active" : ""}`}
                onClick={() => setMode(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <section className="stats-row stats-row-5">
        <div className="stat-card">
          <span className="stat-icon cyan">
            <Clock3 size={20} />
          </span>
          <div>
            <strong>{formatTotal(totals.study, lang)}</strong>
            <span>{t("stats.studyTime")}</span>
          </div>
        </div>
        <div className="stat-card">
          <span className="stat-icon orange">
            <Coffee size={20} />
          </span>
          <div>
            <strong>{formatTotal(totals.leisure, lang)}</strong>
            <span>{t("stats.leisureTime")}</span>
          </div>
        </div>
        <div className="stat-card">
          <span className="stat-icon flame">
            <Flame size={20} />
          </span>
          <div>
            <strong>{current}</strong>
            <span>{t("stats.currentStreak")}</span>
          </div>
        </div>
        <div className="stat-card">
          <span className="stat-icon green">
            <CheckCircle2 size={20} />
          </span>
          <div>
            <strong>
              {completedLessons}
              <span className="stat-sub"> / {totalLessons}</span>
            </strong>
            <span>{t("stats.completed")}</span>
          </div>
        </div>
        <div className="stat-card">
          <span className="stat-icon violet">
            <TrendingUp size={20} />
          </span>
          <div>
            <strong>
              {formatTotal(
                totals.activeDays ? totals.study / totals.activeDays : 0,
                lang,
              )}
            </strong>
            <span>{t("stats.avgStudy")}</span>
          </div>
        </div>
      </section>

      {!hasData && (
        <div className="panel mb-3">
          <EmptyState
            icon={<BarChart3 size={30} />}
            title={t("stats.noData")}
            action={
              <Link to="/library" className="btn btn-primary">
                <Layers size={16} /> {t("nav.library")}
              </Link>
            }
          />
        </div>
      )}

      <div className="stats-grid">
        <section className="panel heatmap-panel">
          <div className="section-head">
            <h2>
              <CalendarDays size={18} /> {t("stats.heatmap")}
            </h2>
            <span className="muted">{t("stats.heatmapDesc")}</span>
          </div>
          <div className="heatmap-scroll">
            <div className="heatmap" dir="ltr">
              {calendar.map((week, wi) => (
                <div className="heat-week" key={wi}>
                  {week.map((day) => {
                    const d = new Date(`${day.key}T12:00:00`);
                    const label = new Intl.DateTimeFormat(
                      lang === "ar" ? "ar-EG" : "en-US",
                      {
                        day: "numeric",
                        month: "short",
                      },
                    ).format(d);
                    return (
                      <span
                        key={day.key}
                        className={`heat-cell lvl-${level(day.seconds)} ${day.key === todayKey() ? "today" : ""}`}
                        title={`${label} · ${formatTotal(day.seconds, lang)}`}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
          <div className="heat-legend">
            <span>{t("stats.lessTime")}</span>
            {[0, 1, 2, 3, 4].map((l) => (
              <span key={l} className={`heat-cell lvl-${l}`} />
            ))}
            <span>{t("stats.moreTime")}</span>
          </div>
        </section>

        <section className="panel goal-stat-panel">
          <div className="section-head">
            <h2>
              <Target size={18} /> {t("stats.todayGoal")}
            </h2>
          </div>
          <div className="goal-stat-body">
            <ProgressRing percent={goalPercent} size={130} stroke={9}>
              <span className="goal-big">{formatPrecise(today, lang)}</span>
              <span className="goal-small">
                / {settings.dailyGoal} {t("common.minutes")}
              </span>
            </ProgressRing>
            <div className="goal-stat-side">
              <div>
                <span className="muted">{t("stats.bestDay")}</span>
                <strong>
                  {bestDayLabel} · {formatTotal(bestDay.seconds, lang)}
                </strong>
              </div>
              <div>
                <span className="muted">{t("stats.studyDays")}</span>
                <strong>{totals.activeDays}</strong>
              </div>
              <div>
                <span className="muted">{t("stats.leisureShare")}</span>
                <strong>{leisureShare}%</strong>
              </div>
            </div>
          </div>
          {goalPercent >= 100 && (
            <p className="goal-reached">✓ {t("stats.goalMet")}</p>
          )}
        </section>

        <section className="panel chart-panel">
          <div className="section-head">
            <h2>
              <BarChart3 size={18} />{" "}
              {period === "7" ? t("stats.last7") : t("stats.last14")}
            </h2>
            <div className="chart-legend">
              <span className="legend-dot study" /> {t("stats.study")}
              <span className="legend-dot leisure" /> {t("stats.leisure")}
              <span className="muted mono">
                {formatTotal(totals.total, lang)}
              </span>
            </div>
          </div>
          <div className="bar-chart">
            {chartDays.map((day) => {
              const total = day.study + day.leisure;
              return (
                <div
                  className="bar-col"
                  key={day.key}
                  title={`${day.label} · ${t("stats.study")} ${formatTotal(day.study, lang)} · ${t("stats.leisure")} ${formatTotal(day.leisure, lang)}`}
                >
                  <div className="bar-track">
                    <span
                      className={`bar-stack ${day.key === todayKey() ? "today" : ""}`}
                      style={{
                        height: `${Math.max(total > 0 ? 3 : 0, (total / chartMax) * 100)}%`,
                      }}
                    >
                      <span
                        className="bar-seg study"
                        style={{
                          height: `${total ? (day.study / total) * 100 : 0}%`,
                        }}
                      />
                      <span
                        className="bar-seg leisure"
                        style={{
                          height: `${total ? (day.leisure / total) * 100 : 0}%`,
                        }}
                      />
                    </span>
                  </div>
                  <span className="bar-weekday">{day.weekday}</span>
                  <span className="bar-label">{day.label.split(" ")[0]}</span>
                </div>
              );
            })}
          </div>
        </section>

        <section className="panel course-progress-panel">
          <div className="section-head">
            <h2>
              <Layers size={18} /> {t("stats.byCourse")}
            </h2>
            <span className="muted">
              {studyShare}% {t("stats.studyShare")}
            </span>
          </div>
          {byCourse.length === 0 ? (
            <p className="muted">{t("dash.recentEmpty")}</p>
          ) : (
            <div className="course-progress-list">
              {byCourse.map(({ course, stats, study, leisure: fun, total }) => (
                <div className="course-progress-row" key={course.id}>
                  <Link
                    to={`/course/${course.id}`}
                    className="cp-emoji"
                    style={{
                      background: `${course.color}22`,
                      borderColor: `${course.color}44`,
                    }}
                  >
                    {course.emoji}
                  </Link>
                  <div className="cp-main">
                    <div className="cp-head">
                      <Link to={`/course/${course.id}`}>
                        <strong>{course.title}</strong>
                      </Link>
                      <span className="mono">{formatTotal(total, lang)}</span>
                    </div>
                    <ProgressBar percent={stats.percent} color={course.color} />
                    <span className="cp-sub">
                      {t("stats.study")}: {formatTotal(study, lang)} ·{" "}
                      {t("stats.leisure")}: {formatTotal(fun, lang)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
