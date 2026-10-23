// MapLibre 6 resolves its web worker relative to its own module URL, which a bundler rewrites.
// Copy the self-contained worker into public/ so base-map.tsx can point setWorkerUrl() at it.
import { copyFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs");
const outDir = join(root, "public/maplibre");
mkdirSync(outDir, { recursive: true });
copyFileSync(src, join(outDir, "maplibre-gl-worker.mjs"));
const { version } = JSON.parse(readFileSync(join(root, "node_modules/maplibre-gl/package.json"), "utf8"));
console.log(`copied maplibre-gl ${version} worker → public/maplibre/`);
