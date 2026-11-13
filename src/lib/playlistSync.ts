import type { Course, Lesson, PlaylistVideo } from '../types'
import { makeLesson } from '../store/store'
import { fetchPlaylist, inspectLink, youtubeThumb, youtubeWatchUrl } from './youtube'

/** Returns the YouTube playlist id saved on a course (from its source URL). */
export function coursePlaylistId(course: Course): string | null {
  const source = course.sourceUrl?.trim()
  if (!source) return null
  try {
    const info = inspectLink(source)
    return info.type === 'youtube-playlist' ? info.playlistId : null
  } catch {
    return null
  }
}

export function playlistVideoToLesson(video: PlaylistVideo): Lesson {
  return makeLesson({
    title: video.title || 'YouTube video',
    kind: 'youtube',
    videoId: video.videoId,
    url: youtubeWatchUrl(video.videoId),
    duration: video.duration,
    thumbnail: video.thumbnail || youtubeThumb(video.videoId),
    author: video.author,
  })
}

/** Fetches the current videos of a playlist as lessons (not yet deduped). */
export async function fetchPlaylistLessons(playlistId: string, apiKey?: string): Promise<Lesson[]> {
  const res = await fetchPlaylist(playlistId, { apiKey: apiKey || undefined })
  return res.videos.map(playlistVideoToLesson)
}
