/** Scenic layers pass through the same ASCII mask as the flowers. */
export interface SceneOptions {
  terrain: "meadow" | "hills" | "dunes" | "rocky" | "grassland";
  clouds: boolean;
  mountains: boolean;
  height: number;
  relief: number;
  cloudCount: number;
  mountainHeight: number;
}
export const SCENE_DEFAULTS: SceneOptions = {
  terrain: "hills", clouds: true, mountains: true,
  height: 0.76, relief: 0.45, cloudCount: 4, mountainHeight: 0.5,
};
// Independent scene roles keep mountains and clouds out of the flower colour families.
export const SCENE_COLORS = {
  sceneCloud: "#e4e9ef", sceneMountain: "#68788e", sceneRidge: "#938699",
  sceneEarth: "#50674b", sceneSand: "#b7a184",
};
export function readScene(value: any): SceneOptions {
  const d = SCENE_DEFAULTS, v = value || {};
  const number = (x: any, fallback: number, min: number, max: number) => typeof x === "number" && Number.isFinite(x) ? Math.max(min, Math.min(max, x)) : fallback;
  return {
    terrain: ["meadow", "hills", "dunes", "rocky", "grassland"].includes(v.terrain) ? v.terrain : d.terrain,
    clouds: typeof v.clouds === "boolean" ? v.clouds : d.clouds,
    mountains: typeof v.mountains === "boolean" ? v.mountains : d.mountains,
    height: number(v.height, d.height, 0.6, 0.86), relief: number(v.relief, d.relief, 0, 1),
    cloudCount: Math.round(number(v.cloudCount, d.cloudCount, 1, 8)),
    mountainHeight: number(v.mountainHeight, d.mountainHeight, 0.1, 1),
  };
}
export function groundY(x: number, W: number, H: number, o: SceneOptions, seed: number) {
  const u = x / W, ph = seed * 0.001;
  let wave = 0;
  if (o.terrain === "hills") wave = Math.sin(u * 8 + ph) * 0.65 + Math.cos(u * 15 + ph) * 0.2;
  if (o.terrain === "grassland") wave = Math.sin(u * 5 + ph) * 0.2;
  if (o.terrain === "dunes") wave = Math.sin(u * 5 + ph) * 0.7;
  if (o.terrain === "rocky") wave = Math.abs(Math.sin(u * 17 + ph)) * 0.6 + Math.sin(u * 41) * 0.15;
  return H * (o.height + wave * 0.09 * o.relief);
}
export function drawScene(B: any, W: number, H: number, o: SceneOptions, seed: number, now: number, C: any, front = false) {
  const earth = o.terrain === "dunes" ? C.kind.sceneSand : C.kind.sceneEarth;
  const cloud = C.kind.sceneCloud;
  const random = (n: number) => {
    const v = Math.sin(seed * 0.17 + n * 311.7) * 43758.5453;
    return v - Math.floor(v);
  };
  if (!front) {
    if (o.clouds) for (let i = 0; i < o.cloudCount; i++) {
      const rnd = (n: number) => random(i * 31 + n);
      const depth = 0.7 + rnd(1) * 0.3, towering = o.terrain === "grassland";
      const width = Math.min(W * (towering ? 0.5 : 0.23 + rnd(2) * 0.1), H * (towering ? 1.1 : 0.6)) * depth;
      const height = Math.min(H * 0.4, width * (towering ? 0.52 : 0.38));
      const span = W + width * 1.2;
      const x = (((i + 0.65) / o.cloudCount * span + now * 0.002 * depth) % span) - width * 0.6;
      const y = towering ? H * (o.height - 0.035 - rnd(5) * 0.07) : H * (0.24 + rnd(5) * 0.14);
      const lobes = [
        { x: -0.34, rx: 0.16, h: 0.32 }, { x: -0.19, rx: 0.22, h: 0.68 + rnd(6) * 0.1 },
        { x: 0.01, rx: 0.24, h: 0.9 + rnd(7) * 0.1 }, { x: 0.22, rx: 0.22, h: 0.56 + rnd(8) * 0.12 },
        { x: 0.36, rx: 0.14, h: 0.27 },
      ];
      const crown = (u: number) => {
        let h = 0;
        for (const l of lobes) { const d = (u - l.x) / l.rx; if (Math.abs(d) < 1) h = Math.max(h, l.h * Math.sqrt(1 - d * d)); }
        return h;
      };
      const outline: number[][] = [];
      for (let k = 0; k <= 100; k++) {
        const u = k / 100 - 0.5;
        const scallop = 1 + 0.025 * Math.sin(u * 103 + i) + 0.015 * Math.cos(u * 167);
        outline.push([x + u * width, y - crown(u) * scallop * height]);
      }
      for (let k = 50; k >= 0; k--) {
        const u = k / 50 - 0.5;
        outline.push([x + u * width, y + height * 0.065 * Math.sin((u + 0.5) * Math.PI)]);
      }
      B.fillGrad(outline, x - width * 0.13, y - height * 0.8, width * 0.75,
        [[0, cloud.light], [0.45, cloud.base], [1, cloud.dark]]);
      // Nested softly shaded billows give volume, rather than a flat dark silhouette.
      for (let p = 0; p < 14; p++) {
        const u = (rnd(10 + p * 3) - 0.5) * 0.7, h = crown(u);
        const rx = width * (0.045 + rnd(11 + p * 3) * 0.04);
        const ry = Math.min(height * 0.19, rx * 0.72);
        const px = x + u * width, py = y - height * h * (0.25 + rnd(12 + p * 3) * 0.47);
        const puff = Array.from({ length: 25 }, (_, k) => {
          const a = k / 24 * Math.PI * 2;
          return [px + Math.cos(a) * rx, py + Math.sin(a) * ry];
        });
        B.fillGrad(puff, px - rx * 0.3, py - ry * 0.5, rx * 1.4,
          [[0, cloud.light], [0.5, cloud.base], [1, cloud.dark]]);
      }
    }
    if (o.mountains) for (let layer = 0; layer < 2; layer++) {
      const shade = C.kind[layer ? "sceneRidge" : "sceneMountain"];
      for (let i = -1; i < 6; i++) {
        // Extend the mountain fill beneath every terrain valley. Ending at a
        // fixed horizon left a strip of sky between peaks and uneven ground.
        const x = W * (i / 4 + layer * 0.1), base = H + 16;
        // Lower, softer ridges leave the flowers in the foreground as the focal point.
        const peak = H * (o.height - (0.08 + o.mountainHeight * 0.22) * (0.75 + Math.sin(i * 9 + seed) * 0.2) + layer * 0.07);
        const width = W * 0.36;
        B.poly([[x-width/2,base],[x-width*0.12,peak+H*0.045],[x,peak],[x+width*0.15,peak+H*0.07],[x+width/2,base]], shade.base);
        B.poly([[x,peak],[x+width*0.15,peak+H*0.07],[x+width/2,base],[x+width*0.04,base]], shade.dark);
      }
    }
    const ridge = Array.from({ length: 121 }, (_, i) => [i / 120 * W, groundY(i / 120 * W, W, H, o, seed)]);
    B.poly([...ridge, [W, H], [0, H]], earth.dark);
    for (let row = 1; row <= 7; row++) B.stroke(ridge.map(([x, y]) => [x, y + row * H * 0.036 + Math.sin(x / W * 13 + row) * H * 0.008]), row % 2 ? earth.base : earth.dark, 1);
  }
  // Foreground blades overlap the roots and break the hard terrain boundary.
  if (front && o.terrain !== "dunes") {
    const count = o.terrain === "grassland" ? 750 : 240;
    for (let i = 0; i < count; i++) {
      const x = random(i * 5 + 200) * W, d = i / count;
      const root = groundY(x, W, H, o, seed), y = root + (H - root) * d;
      const length = (4 + d * d * 40) * (0.65 + random(i * 5 + 201) * 0.7);
      const wind = Math.sin(x / W * 7 - now * 0.0008 + d * 3) * 0.25 + 0.55;
      const bend = length * wind;
      B.stroke([[x,y], [x+bend*0.25,y-length*0.5], [x+bend,y-length]], i % 3 ? earth.base : earth.light, 0.8 + d);
    }
  }
}
