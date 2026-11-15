// Bundles src/standalone/entry.ts into one minified, dependency-free script (src/standalone/engine.min.js).
// The code export pastes this bundle into the React and HTML snippets it generates.
import { build } from "esbuild";
import { statSync } from "node:fs";

await build({
  entryPoints: ["src/standalone/entry.ts"],
  bundle: true,
  minify: true,
  format: "iife",
  globalName: "TypeGardenAscii",
  target: "es2019",
  legalComments: "none",
  external: ["gifenc"], // only the app's GIF export uses it; the embed never does
  outfile: "src/standalone/engine.min.js",
  logLevel: "warning",
});

const kb = (statSync("src/standalone/engine.min.js").size / 1024).toFixed(1);
console.log(`standalone engine: ${kb} kB -> src/standalone/engine.min.js`);
