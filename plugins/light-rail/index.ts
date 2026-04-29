/// <reference path="../.config/gta3.d.ts" />
// ^^^ Uncomment the line above if this file is opened outside the CLEO directory
// (e.g. in a standalone editor without the parent tsconfig.json).
// When deployed to CLEO/light-rail/, the parent CLEO/tsconfig.json handles typings.

/**
 * GTA 3 Light Rail System – CLEO Redux plugin
 *
 * Adds a fully functional light rail network to Liberty City, extending the
 * existing elevated rail across all three islands.
 *
 * Deploy this folder to:
 *   <GTA3 install dir>/CLEO/light-rail/
 *
 * CLEO Redux will automatically discover and run index.ts on game load.
 *
 * @see https://re.cleo.li/docs/en/script-lifecycle.html
 */

// Guard: exit immediately if running on an unsupported host.
if (HOST !== "gta3" && HOST !== "re3") {
  exit("light-rail: unsupported host – requires GTA III or re3");
}

log("[light-rail] plugin loaded");

// ---------------------------------------------------------------------------
// Main loop
// ---------------------------------------------------------------------------
// CLEO scripts must call wait() regularly so they don't block the game loop.
// A stuck script (no wait for > 2 s) is automatically terminated by the runtime.

while (true) {
  wait(0); // yield to the game loop every tick

  // TODO: implement light rail logic
}
