// Seed data files from bundled defaults if volume is empty
import { existsSync, copyFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const dataDir = process.env["DATA_DIR_OVERRIDE"] ?? "./data";
const bundledData = join(dirname(fileURLToPath(import.meta.url)), "..", "data");

mkdirSync(dataDir, { recursive: true });
for (const file of ["bubbles.json","users.json","sitedata.json","watchlists.json","maintenance.json"]) {
  const dest = join(dataDir, file);
  const src = join(bundledData, file);
  if (!existsSync(dest) && existsSync(src)) {
    copyFileSync(src, dest);
  }
}
