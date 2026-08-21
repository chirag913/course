"use client";

import { useEffect, useId, useState } from "react";
import { getVideoProvider } from "@/lib/video";
import type { VideoProviderName } from "@/types/database";
import { AlertCircle } from "lucide-react";

// The ONLY component in the app that knows how to render a specific
// provider's embed. Callers just pass provider + videoId — see
// VIDEO_ARCHITECTURE.md.
export function VideoPlayer({
  provider,
  videoId,
  title,
  startSeconds,
  onProgress,
}: {
  provider: VideoProviderName;
  videoId: string | null;
  title: string;
  startSeconds?: number;
  /** Called every ~15s with the current playback position, when the
   * provider supports tracking. Best-effort — not every provider will call
   * this. */
  onProgress?: (seconds: number) => void;
}) {
  const [failed, setFailed] = useState(false);
  const reactId = useId();
  const iframeId = `video-player-${reactId.replace(/[:]/g, "")}`;

  const adapter = videoId ? getVideoProvider(provider) : null;

  useEffect(() => {
    if (!videoId || !adapter?.trackProgress || !onProgress) return;
    const handle = adapter.trackProgress({
      iframeId,
      intervalMs: 15_000,
      onTick: onProgress,
    });
    return () => handle.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoId, iframeId]);

  if (!videoId || failed || !adapter) {
    return (
      <div className="flex aspect-video w-full flex-col items-center justify-center gap-2 rounded-xl bg-ink-900 text-ink-300">
        <AlertCircle className="h-6 w-6" />
        <p className="text-sm">Unable to load video. Please try again.</p>
      </div>
    );
  }

  return (
    <div className="aspect-video w-full overflow-hidden rounded-xl bg-black">
      <iframe
        key={videoId}
        id={iframeId}
        src={adapter.getEmbedUrl(videoId, { startSeconds })}
        title={title}
        className="h-full w-full"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        onError={() => setFailed(true)}
      />
    </div>
  );
}
