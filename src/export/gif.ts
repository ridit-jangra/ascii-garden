/**
 * Poster to GIF. Renders the poster loop frame by frame (the same frames as the MP4 and PNG exports), builds one 256-colour
 * palette for the whole loop so colours do not flicker between frames, and encodes with gifenc, a tiny pure-JS encoder.
 * The GIF is smaller than the MP4 (600 x 600 at 20 fps) so it stays a sensible size to put in a README.
 */
import { GIFEncoder, quantize, applyPalette } from "gifenc";
import type { Garden } from "../engine/garden";

export const GIF_SIZE = 600;
export const GIF_FPS = 20;

/** Lets the page repaint (progress text) between heavy steps. */
const breathe = () => new Promise<void>((r) => setTimeout(r, 0));

export async function exportGif(g: Garden) {
  if (g.state.busy || !g.P) return;
  const size = GIF_SIZE, fps = GIF_FPS;
  const frames = Math.max(2, Math.round((g.P.T / 1000) * fps));
  const surface = g.exportSurface();
  const small = document.createElement("canvas");
  small.width = small.height = size;
  const sg = small.getContext("2d", { willReadFrequently: true })!;
  sg.imageSmoothingEnabled = true;
  sg.imageSmoothingQuality = "high";
  /** Frame i of the loop, scaled down, as RGBA pixels. */
  const grab = (i: number) => {
    g.drawPoster(surface, (i * 1000) / fps);
    sg.drawImage(surface.canvas, 0, 0, size, size);
    return sg.getImageData(0, 0, size, size).data;
  };

  try {
    g.setBusy(true, "Picking colours…");
    // one palette for the whole loop, from pixels sampled across frames spread through it
    const picks = 10, step = 6, perFrame = Math.ceil((size * size) / step);
    const sample = new Uint8ClampedArray(picks * perFrame * 4);
    let o = 0;
    for (let k = 0; k < picks; k++) {
      const d = grab(Math.floor((k * frames) / picks));
      for (let p = 0; p < size * size; p += step) { sample[o++] = d[p * 4]; sample[o++] = d[p * 4 + 1]; sample[o++] = d[p * 4 + 2]; sample[o++] = 255; }
      await breathe();
    }
    const palette = quantize(sample.subarray(0, o), 256);

    const gif = GIFEncoder();
    const delay = Math.round(1000 / fps);
    for (let i = 0; i < frames; i++) {
      const index = applyPalette(grab(i), palette);
      gif.writeFrame(index, size, size, { palette: i === 0 ? palette : undefined, delay, repeat: 0 });
      g.cb.onStatus(`Encoding GIF ${Math.round(((i + 1) / frames) * 100)}%`);
      await breathe();
    }
    gif.finish();
    const bytes = gif.bytes();
    g.dl(new Blob([bytes], { type: "image/gif" }), `${g.fname()}.gif`);
    g.setBusy(false, `Saved GIF · ${frames} frames · ${(bytes.length / 1048576).toFixed(1)} MB`);
  } catch (err) {
    console.error(err);
    g.setBusy(false, "GIF export failed. Try PNG frames instead.");
  }
}

/**
 * Encode already captured frames (RGBA, all `w` x `h`) into a looping GIF. One 256-colour palette is built from frames spread
 * through the clip so colours stay steady. `delays` is how long each frame was on screen, in ms.
 */
export async function encodeGif(
  frames: Uint8ClampedArray[], w: number, h: number, delays: number[], onProgress?: (pct: number) => void,
): Promise<Uint8Array> {
  const picks = Math.min(10, frames.length), step = 6, per = Math.ceil((w * h) / step);
  const sample = new Uint8ClampedArray(picks * per * 4);
  let o = 0;
  for (let k = 0; k < picks; k++) {
    const d = frames[Math.floor((k * frames.length) / picks)];
    for (let p = 0; p < w * h; p += step) { sample[o++] = d[p * 4]; sample[o++] = d[p * 4 + 1]; sample[o++] = d[p * 4 + 2]; sample[o++] = 255; }
  }
  const palette = quantize(sample.subarray(0, o), 256);
  const gif = GIFEncoder();
  for (let i = 0; i < frames.length; i++) {
    gif.writeFrame(applyPalette(frames[i], palette), w, h, { palette: i === 0 ? palette : undefined, delay: delays[i], repeat: 0 });
    onProgress?.(Math.round(((i + 1) / frames.length) * 100));
    if (i % 4 === 0) await breathe();
  }
  gif.finish();
  return gif.bytes();
}
