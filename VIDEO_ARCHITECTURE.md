# Video Architecture

## V1: YouTube Unlisted

Videos are hosted on YouTube (as **Unlisted**, not Private or Public — Unlisted means anyone with the link can view, but the video doesn't appear in search or on the creator's channel). This costs nothing and lets the product be validated before investing in dedicated video infrastructure.

The admin pastes a full YouTube URL into the lesson editor:

```
https://www.youtube.com/watch?v=abc123XYZ0
```

`lib/video/youtube.ts` extracts the canonical 11-character video ID (`abc123XYZ0`) from any of the URL shapes YouTube produces (`watch?v=`, `youtu.be/`, `/embed/`, `/shorts/`) or accepts a bare ID. The database stores:

```
video_provider = 'youtube'
video_id       = 'abc123XYZ0'
```

— never the original pasted URL. This keeps the stored value provider-agnostic and independent of however YouTube formats its share links.

## Why the rest of the app doesn't know it's YouTube

Every other part of the product — the courses table, the lesson editor, the student dashboard, progress tracking, enrollment checks — only ever touches `video_provider` + `video_id` as opaque values. The actual embed/thumbnail/progress-tracking logic lives entirely behind one interface:

```ts
// src/lib/video/provider.ts
interface VideoProviderAdapter {
  name: VideoProviderName;
  isValidId(idOrUrl: string): boolean;
  extractId(idOrUrl: string): string | null;
  getEmbedUrl(videoId: string, options?: VideoEmbedOptions): string;
  getThumbnailUrl(videoId: string): string;
  trackProgress?(params: {...}): ProgressTrackingHandle; // optional, best-effort
}
```

`src/lib/video/youtube.ts` is the only file that knows what a YouTube embed URL looks like, how to talk to the YouTube IFrame API, or how YouTube thumbnail URLs are shaped. It registers itself with `registerVideoProvider()`. `src/components/video/video-player.tsx` — the **only** component in the app that renders a `<iframe>` — asks `getVideoProvider(lesson.video_provider)` for an adapter and calls its methods. It never imports anything YouTube-specific directly.

## How the player works

`VideoPlayer` renders an `<iframe>` using `adapter.getEmbedUrl(videoId, { startSeconds })`, so playback can resume where the student left off. If `onProgress` is passed and the active adapter implements `trackProgress`, the component mounts the YouTube IFrame Player API against that same iframe (by DOM id) and polls `getCurrentTime()` every 15 seconds while the video is playing, reporting the position up through `onProgress`. This is deliberately throttled (not per-second) to keep the write volume to `lesson_progress` reasonable. If a provider doesn't implement `trackProgress` (e.g. a future provider that doesn't expose a JS position API), position tracking simply doesn't happen for that provider — course/lesson completion still works via the explicit "Mark Complete" action, which doesn't depend on video position at all.

If a video fails to load (bad ID, network issue, deleted video), `VideoPlayer` shows "Unable to load video. Please try again." instead of a blank/broken iframe.

## Access control

Whether a student can *see* a lesson's `video_id` at all is decided entirely by Postgres RLS on the `lessons` table (see DATABASE.md) — free-preview lessons on published courses, or lessons in a course the student is enrolled in, or admin. The video player component has no awareness of enrollment; by the time a `video_id` reaches it, access has already been decided at the database layer. Unlisted YouTube videos are not truly access-controlled by YouTube itself (anyone with the URL could watch it outside the app) — this is the accepted tradeoff of the free V1 approach, and is exactly what the future Cloudflare Stream migration removes (see below).

## Migrating to Cloudflare Stream later

Nothing about `courses`, `lessons`, `enrollments`, or the student dashboard needs to change. The migration is:

1. Add `'cloudflare_stream'` to the `video_provider` Postgres enum.
2. Create `src/lib/video/cloudflareStream.ts` implementing `VideoProviderAdapter` — `getEmbedUrl` returns a Cloudflare Stream iframe/HLS URL, `trackProgress` (if desired) uses Cloudflare's player SDK instead of the YouTube IFrame API.
3. Register it: add one line to `src/lib/video/index.ts`.
4. New lessons pick `video_provider = 'cloudflare_stream'`; existing YouTube lessons keep working unchanged, since both adapters are registered simultaneously and `VideoPlayer` dispatches on whatever `lesson.video_provider` says per-row.

No changes to RLS, the lesson editor's data model, progress tracking's shape, or any page outside `src/lib/video/` and the lesson editor's video-URL input field (which would need a second input mode for uploading directly to Cloudflare instead of pasting a URL).
