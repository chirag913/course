// Video provider abstraction. See VIDEO_ARCHITECTURE.md.
//
// The rest of the app (courses, lessons, student dashboard, progress
// tracking, enrollment) never imports YouTube-specific code directly — it
// only knows a lesson has `video_provider` + `video_id` and asks this module
// for a thumbnail URL or an embed URL. Adding a second provider (e.g.
// Cloudflare Stream) later means adding one file here and one `case` below;
// nothing else in the app changes.

import type { VideoProviderName } from "@/types/database";

export interface VideoEmbedOptions {
  autoplay?: boolean;
  startSeconds?: number;
}

export interface ProgressTrackingHandle {
  stop: () => void;
}

export interface VideoProviderAdapter {
  name: VideoProviderName;
  /** True if the given raw ID/URL looks valid for this provider. */
  isValidId: (idOrUrl: string) => boolean;
  /** Extracts the canonical provider video ID from a pasted URL or raw ID. */
  extractId: (idOrUrl: string) => string | null;
  /** Embed URL to put in an <iframe src>. */
  getEmbedUrl: (videoId: string, options?: VideoEmbedOptions) => string;
  /** Thumbnail image URL, used in admin previews. */
  getThumbnailUrl: (videoId: string) => string;
  /**
   * Optional: attaches playback-position tracking to an already-rendered
   * <iframe id={iframeId}>, calling onTick(seconds) periodically while
   * playing. Providers that can't support this (or haven't implemented it
   * yet) simply omit it — callers must treat position tracking as
   * best-effort ("where possible" per the product spec).
   */
  trackProgress?: (params: {
    iframeId: string;
    intervalMs: number;
    onTick: (seconds: number) => void;
  }) => ProgressTrackingHandle;
}

const providers = new Map<VideoProviderName, VideoProviderAdapter>();

export function registerVideoProvider(adapter: VideoProviderAdapter) {
  providers.set(adapter.name, adapter);
}

export function getVideoProvider(name: VideoProviderName): VideoProviderAdapter {
  const adapter = providers.get(name);
  if (!adapter) throw new Error(`No video provider registered for "${name}"`);
  return adapter;
}

// Providers register themselves via side-effecting imports in ./index.ts.
export { providers as _registeredProviders };
