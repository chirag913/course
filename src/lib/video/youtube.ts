import { registerVideoProvider, type VideoProviderAdapter, type ProgressTrackingHandle } from "./provider";

// Minimal shape of the bits of the YouTube IFrame Player API we use.
interface YTPlayer {
  getCurrentTime: () => number;
  getPlayerState: () => number;
}
interface YTNamespace {
  Player: new (
    elementId: string,
    options: { events: { onReady?: () => void } }
  ) => YTPlayer;
  PlayerState: { PLAYING: number };
}
declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let apiLoadPromise: Promise<YTNamespace> | null = null;

function loadYouTubeIframeApi(): Promise<YTNamespace> {
  if (typeof window === "undefined") return Promise.reject(new Error("no window"));
  if (window.YT) return Promise.resolve(window.YT);
  if (apiLoadPromise) return apiLoadPromise;

  apiLoadPromise = new Promise((resolve) => {
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      resolve(window.YT!);
    };
    const script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(script);
  });

  return apiLoadPromise;
}

// Matches youtube.com/watch?v=ID, youtu.be/ID, youtube.com/embed/ID,
// youtube.com/shorts/ID, or a bare 11-character video ID.
const YOUTUBE_ID_PATTERN = /^[a-zA-Z0-9_-]{11}$/;

function extractYouTubeId(idOrUrl: string): string | null {
  const trimmed = idOrUrl.trim();
  if (YOUTUBE_ID_PATTERN.test(trimmed)) return trimmed;

  try {
    const url = new URL(trimmed);
    if (url.hostname.includes("youtu.be")) {
      const id = url.pathname.slice(1);
      return YOUTUBE_ID_PATTERN.test(id) ? id : null;
    }
    if (url.hostname.includes("youtube.com")) {
      const vParam = url.searchParams.get("v");
      if (vParam && YOUTUBE_ID_PATTERN.test(vParam)) return vParam;

      const pathMatch = url.pathname.match(/\/(embed|shorts)\/([a-zA-Z0-9_-]{11})/);
      if (pathMatch) return pathMatch[2] ?? null;
    }
  } catch {
    return null;
  }

  return null;
}

export const youtubeProvider: VideoProviderAdapter = {
  name: "youtube",
  isValidId: (idOrUrl) => extractYouTubeId(idOrUrl) !== null,
  extractId: extractYouTubeId,
  getEmbedUrl: (videoId, options) => {
    const params = new URLSearchParams({
      rel: "0",
      modestbranding: "1",
      enablejsapi: "1",
      // Using the env var (identical on server and client) rather than
      // window.location.origin avoids an SSR/hydration mismatch — the
      // iframe's src would otherwise differ between the server render
      // (no window) and the client render, forcing a wasted reload of the
      // embed right after mount.
      origin: process.env.NEXT_PUBLIC_SITE_URL ?? "",
    });
    if (options?.autoplay) params.set("autoplay", "1");
    if (options?.startSeconds) params.set("start", String(Math.floor(options.startSeconds)));
    return `https://www.youtube-nocookie.com/embed/${videoId}?${params.toString()}`;
  },
  getThumbnailUrl: (videoId) => `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
  trackProgress: ({ iframeId, intervalMs, onTick }) => {
    let cancelled = false;
    let intervalId: ReturnType<typeof setInterval> | undefined;

    loadYouTubeIframeApi().then((YT) => {
      if (cancelled) return;
      const player = new YT.Player(iframeId, {
        events: {
          onReady: () => {
            intervalId = setInterval(() => {
              if (player.getPlayerState() === YT.PlayerState.PLAYING) {
                onTick(Math.floor(player.getCurrentTime()));
              }
            }, intervalMs);
          },
        },
      });
    });

    const handle: ProgressTrackingHandle = {
      stop: () => {
        cancelled = true;
        if (intervalId) clearInterval(intervalId);
      },
    };
    return handle;
  },
};

registerVideoProvider(youtubeProvider);
