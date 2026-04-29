/**
 * Searches for a GTA III installation using known default paths.
 * Also introspects Steam's config to find installations in non-default
 * Steam library folders (e.g. on a different drive).
 *
 * Sources:
 *   https://www.grandtheftwiki.com/GTA_III
 *   https://pcgamingwiki.com/wiki/Grand_Theft_Auto_III
 */

import { exists } from "@std/fs/exists";
import { dirname, fromFileUrl, join } from "@std/path";

// Sentinel file used to verify a directory is a GTA III install root
const SENTINEL = "gta3.exe";

// Steam App ID for GTA III
const GTA3_APP_ID = "12100";

// GTA III's subdirectory name inside a Steam library's steamapps/common/
const STEAM_GAME_DIR = "Grand Theft Auto 3";

// Known static installation paths, grouped by source/distribution
const STATIC_CANDIDATES: Array<{ path: string; label: string }> = [
  // Steam
  // Default C: drive locations (fallback if registry lookup fails)
  {
    path: "C:\\Program Files (x86)\\Steam\\steamapps\\common\\Grand Theft Auto 3",
    label: "Steam (x86, default)",
  },
  {
    path: "C:\\Program Files\\Steam\\steamapps\\common\\Grand Theft Auto 3",
    label: "Steam (default)",
  },

  // Rockstar Games Launcher
  {
    path: "C:\\Program Files\\Rockstar Games\\Grand Theft Auto III",
    label: "Rockstar Games Launcher",
  },
  {
    path: "C:\\Program Files (x86)\\Rockstar Games\\Grand Theft Auto III",
    label: "Rockstar Games Launcher (x86)",
  },

  // GOG.com
  {
    path: "C:\\GOG Games\\Grand Theft Auto 3",
    label: "GOG",
  },
  {
    path: "C:\\Program Files (x86)\\GOG Galaxy\\Games\\Grand Theft Auto 3",
    label: "GOG Galaxy",
  },

  // Retail / CD installs (legacy)
  {
    path: "C:\\Program Files\\Rockstar Games\\GTA3",
    label: "Retail (Rockstar)",
  },
  {
    path: "C:\\Program Files (x86)\\Rockstar Games\\GTA3",
    label: "Retail (Rockstar, x86)",
  },
  {
    path: "C:\\GTA3",
    label: "Retail (root drive)",
  },
  {
    path: "C:\\Grand Theft Auto 3",
    label: "Retail (root drive, full name)",
  },

  // Some older disc releases installed under Take-Two Interactive
  {
    path: "C:\\Program Files\\Take-Two Interactive\\Grand Theft Auto III",
    label: "Take-Two Interactive",
  },
  {
    path: "C:\\Program Files (x86)\\Take-Two Interactive\\Grand Theft Auto III",
    label: "Take-Two Interactive (x86)",
  },
];

/**
 * Reads Steam's install path from the Windows registry.
 * Checks both the 64-bit and 32-bit (WOW6432Node) registry hives.
 */
async function getSteamPathFromRegistry(): Promise<string | null> {
  const keys = [
    "HKLM\\SOFTWARE\\WOW6432Node\\Valve\\Steam",
    "HKLM\\SOFTWARE\\Valve\\Steam",
    "HKCU\\SOFTWARE\\Valve\\Steam",
  ];

  for (const key of keys) {
    try {
      const cmd = new Deno.Command("reg", {
        args: ["query", key, "/v", "InstallPath"],
        stdout: "piped",
        stderr: "null",
      });
      const { code, stdout } = await cmd.output();
      if (code !== 0) continue;

      const output = new TextDecoder().decode(stdout);
      // Registry output looks like:
      //     InstallPath    REG_SZ    D:\Steam
      const match = output.match(/InstallPath\s+REG_SZ\s+(.+)/);
      if (match) return match[1].trim();
    } catch {
      // reg.exe not available or key missing; try next
    }
  }

  return null;
}

/**
 * Parses Steam's libraryfolders.vdf (KeyValues text format) and returns all
 * library paths that contain GTA III (App ID 12100).
 *
 * The VDF structure looks like:
 *   "libraryfolders" {
 *     "0" { "path" "D:\\Steam"  "apps" { "12100" "..." } }
 *     "1" { "path" "E:\\Steam"  "apps" { ... } }
 *   }
 */
async function getSteamLibrariesWithGTA3(steamPath: string): Promise<string[]> {
  const vdfPath = join(steamPath, "config", "libraryfolders.vdf");
  if (!await exists(vdfPath)) return [];

  const text = await Deno.readTextFile(vdfPath);

  // Split into per-library blocks by splitting on top-level numbered entries
  const libraryPaths: string[] = [];

  // Match each { ... } block under a numbered key
  const blockRegex = /"(?:\d+)"\s*\{([^}]*(?:\{[^}]*\}[^}]*)*)\}/gs;
  for (const blockMatch of text.matchAll(blockRegex)) {
    const block = blockMatch[1];

    // Extract the "path" value from this block
    const pathMatch = block.match(/"path"\s+"((?:[^"\\]|\\.)*)"/);
    if (!pathMatch) continue;
    // VDF escapes backslashes as \\
    const libPath = pathMatch[1].replace(/\\\\/g, "\\");

    // Check whether this library's apps section lists GTA3_APP_ID
    const appsMatch = block.match(/"apps"\s*\{([^}]*)\}/s);
    if (!appsMatch) continue;

    if (appsMatch[1].includes(`"${GTA3_APP_ID}"`)) {
      libraryPaths.push(libPath);
    }
  }

  return libraryPaths;
}

async function findGTA3(): Promise<void> {
  console.log("Searching for GTA III installation...\n");

  const candidates: Array<{ path: string; label: string }> = [
    ...STATIC_CANDIDATES,
  ];

  // --- Steam library introspection ---
  const steamPath = await getSteamPathFromRegistry();
  if (steamPath) {
    console.log(`  Steam found at: ${steamPath}`);
    const steamLibs = await getSteamLibrariesWithGTA3(steamPath);
    if (steamLibs.length > 0) {
      for (const lib of steamLibs) {
        candidates.push({
          path: join(lib, "steamapps", "common", STEAM_GAME_DIR),
          label: `Steam library (${lib})`,
        });
      }
    } else {
      // GTA3 wasn't listed in any library's apps block; still probe all libraries
      console.log(
        "  GTA III not listed in any Steam library apps, probing all libraries anyway.",
      );
      const vdfPath = join(steamPath, "config", "libraryfolders.vdf");
      if (await exists(vdfPath)) {
        const text = await Deno.readTextFile(vdfPath);
        const pathRegex = /"path"\s+"((?:[^"\\]|\\.)*)"/g;
        for (const m of text.matchAll(pathRegex)) {
          const lib = m[1].replace(/\\\\/g, "\\");
          candidates.push({
            path: join(lib, "steamapps", "common", STEAM_GAME_DIR),
            label: `Steam library probe (${lib})`,
          });
        }
      }
    }
    console.log();
  } else {
    console.log(
      "  Steam registry key not found; skipping Steam library introspection.\n",
    );
  }

  // --- Check all candidates ---
  const found: Array<{ path: string; label: string }> = [];
  for (const candidate of candidates) {
    if (await exists(join(candidate.path, SENTINEL))) {
      found.push(candidate);
    }
  }

  if (found.length === 0) {
    console.error("No GTA III installation found in any known location.");
    console.error("Checked paths:");
    for (const c of candidates) {
      console.error(`  [${c.label}] ${c.path}`);
    }
    Deno.exit(1);
  }

  console.log(`Found ${found.length} installation(s):\n`);
  for (const install of found) {
    console.log(`  [${install.label}]`);
    console.log(`  ${install.path}`);
    console.log(`  data/paths: ${join(install.path, "data", "paths")}\n`);
  }

  await promptSave(found);
}

/**
 * Asks the user whether to save the discovered install paths to .env.gta3
 * in the project root (one directory above this script).
 */
async function promptSave(
  installs: Array<{ path: string; label: string }>,
): Promise<void> {
  // Project root is one level above ./scripts/
  const projectRoot = dirname(dirname(fromFileUrl(import.meta.url)));
  const envPath = join(projectRoot, ".env.gta3");

  // Build the file content from all found installs.
  // If multiple installs are found, use the first one for GTA3_DIR.
  const primary = installs[0];
  const lines = [
    "# Auto-generated by scripts/find-gta3.ts",
    "# Do NOT commit this file",
    `GTA3_DIR="${primary.path}"`,
    `GTA3_DATA="${join(primary.path, "data")}"`,
  ];

  if (installs.length > 1) {
    lines.push("");
    lines.push("# Additional installs found (not active):");
    for (const install of installs.slice(1)) {
      lines.push(`# [${install.label}] ${install.path}`);
    }
  }

  const content = lines.join("\n") + "\n";

  console.log("Preview of ./.env.gta3:");
  for (const line of lines) console.log(`  ${line}`);
  console.log();

  const answer = prompt("Update your local configuration? [y/n]:");
  if (answer?.trim().toLowerCase() !== "y") {
    console.log("Skipped.");
    return;
  }

  await Deno.writeTextFile(envPath, content);
  console.log(`Saved to ${envPath}`);
}

await findGTA3();
