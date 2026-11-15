/**
 * Records the live garden (the Type tab). It captures a video and GIF frames at the same time, so when you stop you can choose
 * what to save: an MP4/WebM or a GIF. It captures only the garden canvas, not the panels around it.
 */
import type { Garden } from "../engine/garden";
import { encodeGif } from "./gif";

/** Longest clip. The GIF frames are kept in memory until you choose, so this stays modest. */
const MAX_SECONDS = 20;
const GIF_FPS = 10;
const GIF_MAX_WIDTH = 640;

/** A finished recording, waiting for you to pick a format. */
export interface Clip {
  seconds: number;
  /** "mp4" or "webm" if this browser could record video, otherwise null (only the GIF is on offer). */
  videoExt: "mp4" | "webm" | null;
  gifFrames: number;
  /** Save the video. Returns a message to show. */
  saveVideo: () => string;
  /** Encode and save the GIF. Returns a message to show. */
  saveGif: (onProgress: (pct: number) => void) => Promise<string>;
}

export interface Recording {
  /** Stop. Resolves with the clip, or with a message if it was too short. */
  stop: () => Promise<Clip | string>;
}

const mb = (bytes: number) => (bytes / 1048576).toFixed(1) + " MB";

export function startRecording(g: Garden, onTick: (seconds: number) => void, onAutoStop: () => void): Recording {
  const canvas = g.canvas;
  const t0 = performance.now();
  const tick = window.setInterval(() => onTick((performance.now() - t0) / 1000), 250);
  const auto = window.setTimeout(onAutoStop, MAX_SECONDS * 1000);

  // video
  const mime = g.vmime as string | null;
  let rec: MediaRecorder | null = null;
  const chunks: Blob[] = [];
  let stopped: Promise<void> = Promise.resolve();
  if (mime && (canvas as any).captureStream) {
    rec = new MediaRecorder((canvas as any).captureStream(30), { mimeType: mime, videoBitsPerSecond: 12e6 });
    rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
    stopped = new Promise<void>((r) => { rec!.onstop = () => r(); });
    rec.start(250);
  }

  // GIF frames, scaled down
  const w = Math.min(GIF_MAX_WIDTH, canvas.width), h = Math.max(2, Math.round((canvas.height * w) / canvas.width));
  const small = document.createElement("canvas");
  small.width = w; small.height = h;
  const sg = small.getContext("2d", { willReadFrequently: true })!;
  sg.imageSmoothingEnabled = true;
  sg.imageSmoothingQuality = "high";
  const frames: Uint8ClampedArray[] = [];
  const times: number[] = [];
  const grab = window.setInterval(() => {
    sg.drawImage(canvas, 0, 0, w, h);
    frames.push(sg.getImageData(0, 0, w, h).data);
    times.push(performance.now());
  }, 1000 / GIF_FPS);

  return {
    stop: async () => {
      window.clearInterval(tick); window.clearTimeout(auto); window.clearInterval(grab);
      if (rec && rec.state !== "inactive") rec.stop();
      await stopped;
      const seconds = (performance.now() - t0) / 1000;
      if (frames.length < 2) return "Too short to save. Record a little longer.";
      const ext = mime ? (mime.includes("mp4") ? "mp4" : "webm") : null;
      const blob = ext && chunks.length ? new Blob(chunks, { type: (mime as string).split(";")[0] }) : null;
      return {
        seconds,
        videoExt: blob ? ext : null,
        gifFrames: frames.length,
        saveVideo: () => {
          if (!blob) return "Video recording isn't supported in this browser. Save the GIF instead.";
          g.dl(blob, `type-garden.${ext}`);
          return `Saved type-garden.${ext} · ${mb(blob.size)}`;
        },
        saveGif: async (onProgress) => {
          // how long each frame was really on screen (timers are not exact), kept to a sensible range
          const delays = times.map((t, i) => Math.min(250, Math.max(40, Math.round((times[i + 1] ?? t + 1000 / GIF_FPS) - t))));
          const bytes = await encodeGif(frames, w, h, delays, onProgress);
          g.dl(new Blob([bytes], { type: "image/gif" }), "type-garden.gif");
          return `Saved type-garden.gif · ${frames.length} frames · ${mb(bytes.length)}`;
        },
      } as Clip;
    },
  };
}
