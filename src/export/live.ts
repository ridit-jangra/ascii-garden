import type { Garden } from '../engine/garden';
import { startRecording } from './record';

/** Export the live Type canvas without creating or changing a Studio poster. */
export async function exportLive(g: Garden, kind: 'mp4' | 'gif' | 'frames') {
  if (g.state.busy) return;
  g.setBusy(true, 'Capturing Type garden · 6 seconds…');
  try {
    if (kind === 'frames') {
      const canvas = document.createElement('canvas');
      canvas.width = g.canvas.width; canvas.height = g.canvas.height;
      const ctx = canvas.getContext('2d')!;
      const files: { name: string; data: Uint8Array }[] = [];
      const began = performance.now();
      for (let i = 0; i < 60; i++) {
        await new Promise(r => setTimeout(r, Math.max(0, began + i * 100 - performance.now())));
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(g.canvas, 0, 0);
        const blob = await new Promise<Blob | null>(r => canvas.toBlob(r));
        if (!blob) throw Error('Could not capture a PNG frame.');
        files.push({ name: `frame-${String(i + 1).padStart(3, '0')}.png`, data: new Uint8Array(await blob.arrayBuffer()) });
        g.cb.onStatus(`Capturing Type garden · ${Math.round((i + 1) / 60 * 100)}%`);
      }
      g.dl(g.zip(files), 'type-garden-frames.zip');
      g.setBusy(false, 'Saved Type garden · 60 PNG frames');
    } else {
      if (kind === 'mp4' && !g.vmime) throw Error('Video is unavailable in this browser. Try GIF.');
      const recording = startRecording(g, seconds => g.cb.onStatus(`Capturing Type garden · ${Math.min(6, Math.floor(seconds))} / 6s`), () => {});
      await new Promise(r => setTimeout(r, 6000));
      const clip = await recording.stop();
      if (typeof clip === 'string') throw Error(clip);
      const message = kind === 'gif'
        ? await clip.saveGif(p => g.cb.onStatus(`Encoding Type GIF · ${p}%`))
        : clip.saveVideo();
      g.setBusy(false, message);
    }
  } catch (error) {
    g.setBusy(false, error instanceof Error ? error.message : 'Type export failed.');
  }
}
