/**
 * Track Visualizer — bare-bones HTTP server.
 *
 * Serves a single-page SVG visualizer for GTA III tracks*.dat files.
 * D3 is loaded client-side from jsDelivr CDN; no npm/JSR deps needed here.
 *
 * Routes:
 *   GET  /              → index.html (embedded below)
 *   POST /parse         → body: raw .dat text → JSON TrackFile
 *
 * Usage:
 *   deno task visualize
 *   Then open http://localhost:8080 and drop in a tracks.dat / tracks2.dat file.
 */

import { dirname, fromFileUrl, join } from "@std/path";
import { parseTracksDat } from "../lib/tracks.ts";

const PORT = 8080;
const SCRIPT_DIR = dirname(fromFileUrl(import.meta.url));
const HTML_PATH = join(SCRIPT_DIR, "visualizer.html");

// ---------------------------------------------------------------------------
// Request handler
// ---------------------------------------------------------------------------

Deno.serve({ port: PORT }, async (req: Request): Promise<Response> => {
  const url = new URL(req.url);

  // POST /parse — accept raw .dat text, return parsed JSON
  if (req.method === "POST" && url.pathname === "/parse") {
    try {
      const text = await req.text();
      const parsed = parseTracksDat(text);
      return Response.json(parsed);
    } catch (err) {
      return new Response(
        JSON.stringify({ error: String(err) }),
        { status: 400, headers: { "content-type": "application/json" } },
      );
    }
  }

  // GET / — serve the visualizer HTML
  if (
    req.method === "GET" &&
    (url.pathname === "/" || url.pathname === "/index.html")
  ) {
    try {
      const html = await Deno.readTextFile(HTML_PATH);
      return new Response(html, {
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    } catch {
      return new Response("visualizer.html not found next to visualize.ts", {
        status: 500,
      });
    }
  }

  return new Response("Not found", { status: 404 });
});

console.log(`Track Visualizer running at http://localhost:${PORT}`);
console.log(
  `Drop a tracks.dat or tracks2.dat file into the browser to visualize it.`,
);
