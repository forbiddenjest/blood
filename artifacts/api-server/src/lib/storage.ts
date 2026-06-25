import { readFile, writeFile, mkdir, rename } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

function resolveDataDir(): string {
  if (process.env["DATA_DIR_OVERRIDE"]) return process.env["DATA_DIR_OVERRIDE"];
  try {
    // dist/index.mjs → dirname = dist/ → ../data = api-server/data ✓
    return join(dirname(fileURLToPath(import.meta.url)), "..", "data");
  } catch {
    return join(process.cwd(), "data");
  }
}

const DATA_DIR = resolveDataDir();

async function ensureDir(): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });
}

export async function fileGet<T>(filename: string): Promise<T | null> {
  try {
    const raw = await readFile(join(DATA_DIR, filename), "utf-8");
    return JSON.parse(raw) as T;
  } catch { return null; }
}

export async function fileSet(filename: string, value: unknown): Promise<void> {
  await ensureDir();
  const finalPath = join(DATA_DIR, filename);
  const tmpPath = `${finalPath}.tmp`;
  await writeFile(tmpPath, JSON.stringify(value, null, 2), "utf-8");
  await rename(tmpPath, finalPath);
}
