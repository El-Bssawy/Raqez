import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  Check,
  Film,
  Link2,
  ListVideo,
  Loader2,
  PenLine,
  Play,
  Plus,
  Settings as SettingsIcon,
  X,
} from "lucide-react";
import { useStore, makeLesson } from "../store/store";
import { useUI } from "../store/ui";
import { useToasts } from "../store/toasts";
import { useI18n, Field, Modal } from "./ui";
import type { Lesson, PlaylistVideo } from "../types";
import {
  checkYoutubeVideo,
  fetchPlaylist,
  fetchVideoMeta,
  inspectLink,
  isImportableLink,
  youtubeThumb,
  youtubeWatchUrl,
} from "../lib/youtube";
import { formatClock } from "../lib/utils";

type Tab = "playlist" | "links" | "manual";

function makeYouTubeLesson(v: PlaylistVideo): Lesson {
  return makeLesson({
    title: v.title || "YouTube video",
    kind: "youtube",
    videoId: v.videoId,
    url: youtubeWatchUrl(v.videoId),
    duration: v.duration,
    thumbnail: v.thumbnail || youtubeThumb(v.videoId),
    author: v.author,
  });
}

function lessonForLink(
  raw: string,
  meta?: { title: string; author?: string; thumbnail?: string },
): Lesson {
  const info = inspectLink(raw);
  if (info.type === "youtube-video") {
    return makeLesson({
      title: meta?.title || "YouTube video",
      kind: "youtube",
      videoId: info.videoId,
      url: youtubeWatchUrl(info.videoId),
      thumbnail: meta?.thumbnail || youtubeThumb(info.videoId),
      author: meta?.author,
    });
  }
  if (info.type === "youtube-playlist") {
    return makeLesson({
      title: meta?.title || "YouTube playlist",
      kind: "link",
      url: info.url,
    });
  }
  return makeLesson({
    title:
      meta?.title || (info.type === "video" ? "Video file" : "External link"),
    kind: info.type === "video" ? "video" : "link",
    url: info.url,
  });
}

async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      while (next < items.length) {
        const i = next++;
        results[i] = await fn(items[i], i);
      }
    },
  );
  await Promise.all(workers);
  return results;
}

export function LessonsImporter() {
  const importer = useUI((s) => s.importer);
  if (!importer) return null;
  return (
    <ImporterBody
      key={`${importer.mode}-${importer.courseId || ""}-${importer.parentId || ""}-${importer.initialLink || ""}-${importer.initialTab || ""}`}
      importer={importer}
    />
  );
}

function ImporterBody({
  importer,
}: {
  importer: NonNullable<ReturnType<typeof useUI.getState>["importer"]>;
}) {
  const closeImporter = useUI((s) => s.closeImporter);
  const apiKey = useStore((s) => s.settings.apiKey);
  const createCourse = useStore((s) => s.createCourse);
  const addLessons = useStore((s) => s.addLessons);
  const pushToast = useToasts((s) => s.push);
  const { t } = useI18n();
  const navigate = useNavigate();

  const isAdd = importer.mode === "add";
  const initialLink = importer.initialLink || "";

  const [tab, setTab] = useState<Tab>(importer.initialTab || "playlist");
  const [playlistUrl, setPlaylistUrl] = useState(initialLink);
  const [bulkText, setBulkText] = useState(initialLink);
  const [manualTitle, setManualTitle] = useState("");
  const [manualUrl, setManualUrl] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [preview, setPreview] = useState<Lesson[]>([]);
  const [fetchedTitle, setFetchedTitle] = useState("");
  const [fetching, setFetching] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [errorHint, setErrorHint] = useState(true);

  const fail = (message: string, withHint = false) => {
    setError(message);
    setErrorHint(withHint);
  };

  const doFetchPlaylist = async (raw: string) => {
    const link = raw.trim();
    setError("");
    if (!link) {
      fail(t("add.emptyError"));
      return;
    }
    if (!isImportableLink(link)) {
      setPreview([]);
      setFetchedTitle("");
      setTitle((prev) => (prev === fetchedTitle ? "" : prev));
      fail(t("add.invalidLink"));
      return;
    }
    const info = inspectLink(link);
    setFetching(true);
    setProgress(0);
    setPreview([]);
    try {
      if (info.type === "youtube-playlist") {
        const res = await fetchPlaylist(info.playlistId, {
          apiKey: apiKey || undefined,
          onProgress: (n) => setProgress(n),
        });
        const lessons = res.videos.map(makeYouTubeLesson);
        setPreview(lessons);
        setFetchedTitle(res.title);
        setTitle((prev) => prev || res.title);
        if (res.description)
          setDescription((prev) => prev || res.description!.slice(0, 240));
        if (!lessons.length) fail(t("add.invalidPlaylist"));
      } else if (info.type === "youtube-video") {
        const [exists, meta] = await Promise.all([
          checkYoutubeVideo(info.videoId),
          fetchVideoMeta(info.videoId),
        ]);
        if (exists === false) {
          fail(t("add.invalidLink"));
          return;
        }
        setPreview([lessonForLink(link, meta)]);
        setFetchedTitle(meta.title);
        setTitle((prev) => prev || meta.title);
      } else {
        setPreview([lessonForLink(link)]);
        setTitle((prev) => prev || "Video lesson");
      }
    } catch (err) {
      console.error(err);
      setPreview([]);
      fail(t("add.playlistFail"), true);
    } finally {
      setFetching(false);
      setProgress(null);
    }
  };

  const doFetchBulk = async () => {
    const lines = bulkText
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .slice(0, 120);
    setError("");
    if (!lines.length) {
      fail(t("add.emptyError"));
      return;
    }
    const valid = lines.filter((line) => isImportableLink(line));
    const skipped = lines.length - valid.length;
    if (!valid.length) {
      setPreview([]);
      fail(t("add.invalidLink"));
      return;
    }
    if (skipped) fail(t("add.invalidLinksSkipped", { n: skipped }));
    setFetching(true);
    setProgress(0);
    setPreview([]);
    try {
      const groups = await mapLimit(valid, 3, async (line) => {
        const info = inspectLink(line);
        if (info.type === "youtube-playlist") {
          try {
            const res = await fetchPlaylist(info.playlistId, {
              apiKey: apiKey || undefined,
            });
            if (res.title) setFetchedTitle((prev) => prev || res.title);
            return res.videos.map(makeYouTubeLesson);
          } catch {
            return [];
          }
        }
        if (info.type === "youtube-video") {
          try {
            const meta = await fetchVideoMeta(info.videoId);
            return [lessonForLink(line, meta)];
          } catch {
            return [lessonForLink(line)];
          }
        }
        return [lessonForLink(line)];
      });
      const flat = groups.flat();
      setPreview(flat);
      setProgress(flat.length);
      if (!flat.length) fail(t("add.playlistFail"), true);
      if (flat.length === 1) setTitle((prev) => prev || flat[0].title);
    } catch (err) {
      console.error(err);
      setPreview([]);
      fail(t("common.error"), true);
    } finally {
      setFetching(false);
      setProgress(null);
    }
  };

  const addManual = async () => {
    const raw = manualUrl.trim();
    const name = manualTitle.trim();
    if (!raw && !name) return;
    setError("");
    let lesson: Lesson;
    if (raw) {
      const info = inspectLink(raw);
      if (!isImportableLink(raw)) {
        fail(t("add.invalidLink"));
        return;
      }
      if (info.type === "youtube-video") {
        const exists = await checkYoutubeVideo(info.videoId);
        if (exists === false) {
          fail(t("add.invalidLink"));
          return;
        }
      }
      if (info.type === "youtube-video" && !name) {
        const meta = await fetchVideoMeta(info.videoId);
        lesson = lessonForLink(raw, meta);
        setTitle((prev) => prev || meta.title);
      } else {
        lesson = lessonForLink(raw, name ? { title: name } : undefined);
        if (name) lesson = { ...lesson, title: name };
        if (!title && name) setTitle(name);
      }
    } else {
      lesson = makeLesson({ title: name, kind: "link" });
      if (!title) setTitle(name);
    }
    setPreview((p) => [...p, lesson]);
    setManualTitle("");
    setManualUrl("");
  };

  useEffect(() => {
    if (!initialLink) return;
    if (isImportableLink(initialLink)) doFetchPlaylist(initialLink);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = () => {
    setError("");
    if (isAdd) {
      if (!preview.length) {
        setError(t("add.emptyError"));
        return;
      }
      const added = addLessons(importer.courseId!, preview);
      if (added > 0) {
        pushToast(t("toast.imported", { n: added }));
        closeImporter();
      } else {
        pushToast(t("add.noNew"), "info");
      }
      return;
    }

    const courseTitle =
      title.trim() ||
      fetchedTitle.trim() ||
      (preview.length === 1 ? preview[0].title : "");
    if (!courseTitle && !preview.length) {
      setError(t("add.emptyError"));
      return;
    }
    const id = createCourse({
      title: courseTitle || "Untitled course",
      description: description.trim() || undefined,
      lessons: preview,
      sourceUrl: playlistUrl || undefined,
      parentId: importer.parentId ?? null,
    });
    pushToast(t("toast.courseCreated"));
    closeImporter();
    navigate(`/course/${id}`);
  };

  const removePreview = (id: string) =>
    setPreview((p) => p.filter((l) => l.id !== id));

  return (
    <Modal
      open
      onClose={closeImporter}
      title={isAdd ? t("add.title") : t("dash.quickCreate")}
      subtitle={isAdd ? t("add.linksHint") : t("add.playlistHint")}
      size="lg"
      footer={
        <>
          <span className="modal-count">
            {preview.length > 0 && (
              <span className="row gap-2">
                <ListVideo size={15} />{" "}
                {t("common.lessonsCount", { n: preview.length })}
              </span>
            )}
          </span>
          <button className="btn btn-ghost" onClick={closeImporter}>
            {t("common.cancel")}
          </button>
          <button
            className="btn btn-primary"
            onClick={submit}
            disabled={fetching || (!preview.length && !title.trim())}
          >
            {isAdd ? t("add.addToCourse") : t("common.save")}
          </button>
        </>
      }
    >
      <div className="tabs">
        <button
          className={`tab ${tab === "playlist" ? "active" : ""}`}
          onClick={() => setTab("playlist")}
        >
          <ListVideo size={16} /> {t("add.tabPlaylist")}
        </button>
        <button
          className={`tab ${tab === "links" ? "active" : ""}`}
          onClick={() => setTab("links")}
        >
          <Link2 size={16} /> {t("add.tabLinks")}
        </button>
        <button
          className={`tab ${tab === "manual" ? "active" : ""}`}
          onClick={() => setTab("manual")}
        >
          <PenLine size={16} /> {t("add.tabManual")}
        </button>
      </div>

      {!isAdd && (
        <div className="grid-2">
          <Field label={t("course.editTitle")}>
            <input
              className="input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={fetchedTitle || t("add.titleOpt")}
            />
          </Field>
          <Field label={t("course.editDesc")}>
            <input
              className="input"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t("common.optional")}
            />
          </Field>
        </div>
      )}

      {tab === "playlist" && (
        <div className="import-block">
          <Field label={t("add.playlistLabel")} hint={t("add.playlistHint")}>
            <div className="input-row">
              <input
                className="input"
                dir="ltr"
                value={playlistUrl}
                onChange={(e) => setPlaylistUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !fetching)
                    doFetchPlaylist(playlistUrl);
                }}
                placeholder="https://www.youtube.com/playlist?list=…"
              />
              <button
                className="btn btn-secondary"
                onClick={() => doFetchPlaylist(playlistUrl)}
                disabled={fetching}
              >
                {fetching ? (
                  <Loader2 size={16} className="spin" />
                ) : (
                  <Play size={16} />
                )}
                {fetching ? t("add.importing") : t("add.fetch")}
              </button>
            </div>
          </Field>
        </div>
      )}

      {tab === "links" && (
        <Field label={t("add.linksLabel")} hint={t("add.linksHint")}>
          <textarea
            className="input textarea"
            dir="ltr"
            rows={5}
            value={bulkText}
            onChange={(e) => setBulkText(e.target.value)}
            placeholder={t("add.bulkPlaceholder")}
          />
          <button
            className="btn btn-secondary mt-2"
            onClick={doFetchBulk}
            disabled={fetching}
          >
            {fetching ? (
              <Loader2 size={16} className="spin" />
            ) : (
              <Link2 size={16} />
            )}
            {fetching ? t("add.importing") : t("add.fetch")}
          </button>
        </Field>
      )}

      {tab === "manual" && (
        <div className="manual-add">
          <div className="grid-2">
            <Field label={t("add.manualTitle")}>
              <input
                className="input"
                value={manualTitle}
                onChange={(e) => setManualTitle(e.target.value)}
                placeholder={t("add.manualPlaceholder")}
                onKeyDown={(e) => {
                  if (e.key === "Enter") addManual();
                }}
              />
            </Field>
            <Field label={t("add.manualUrl")}>
              <input
                className="input"
                dir="ltr"
                value={manualUrl}
                onChange={(e) => setManualUrl(e.target.value)}
                placeholder={t("add.videoUrlPlaceholder")}
                onKeyDown={(e) => {
                  if (e.key === "Enter") addManual();
                }}
              />
            </Field>
          </div>
          <button
            className="btn btn-secondary"
            onClick={addManual}
            disabled={!manualTitle.trim() && !manualUrl.trim()}
          >
            <Plus size={16} /> {t("add.addRow")}
          </button>
        </div>
      )}

      {fetching && (
        <div className="fetch-status">
          <Loader2 size={18} className="spin" />
          <span>
            {progress != null
              ? t("add.importingCount", { n: progress })
              : t("add.importing")}
          </span>
        </div>
      )}

      {error && (
        <div className="alert alert-error">
          <AlertTriangle size={18} />
          <div>
            <strong>{error}</strong>
            {errorHint && (
              <>
                <p>{t("add.apiKeyTip")}</p>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => {
                    closeImporter();
                    navigate("/settings");
                  }}
                >
                  <SettingsIcon size={14} /> {t("nav.settings")}
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {preview.length > 0 && (
        <div className="preview">
          <div className="preview-head">
            <span>{t("add.previewTitle")}</span>
            <span className="muted">
              {t("common.lessonsCount", { n: preview.length })}
            </span>
          </div>
          <div className="preview-list">
            {preview.map((lesson, i) => (
              <div className="preview-item" key={lesson.id}>
                <span className="preview-index">{i + 1}</span>
                <div className="preview-thumb">
                  {lesson.thumbnail ? (
                    <img src={lesson.thumbnail} alt="" loading="lazy" />
                  ) : (
                    <Film size={16} />
                  )}
                  {lesson.duration ? (
                    <span>{formatClock(lesson.duration)}</span>
                  ) : null}
                </div>
                <div className="preview-info">
                  <span className="preview-title">{lesson.title}</span>
                  {lesson.author && (
                    <span className="preview-author">{lesson.author}</span>
                  )}
                </div>
                <button
                  className="icon-btn icon-btn-sm"
                  onClick={() => removePreview(lesson.id)}
                  aria-label={t("common.remove")}
                >
                  <X size={15} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {!preview.length && !fetching && tab !== "manual" && (
        <div className="import-tip">
          <ListVideo size={18} />
          <p>{t("add.apiKeyTip")}</p>
        </div>
      )}
      {preview.length > 0 && !isAdd && (
        <p className="success-line">
          <Check size={15} /> {t("add.found", { n: preview.length })}
        </p>
      )}
    </Modal>
  );
}
