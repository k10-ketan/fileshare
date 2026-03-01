import fs from "fs";
import path from "path";

export interface FileEntry {
  id: number;
  filePath: string;
  originalName: string;
  size: number;
}

export interface ShareEntry {
  files: FileEntry[];
  createdAt: number;
}

// Persist store across hot reloads in development
const globalForStore = globalThis as unknown as {
  __fileStore?: Map<string, ShareEntry>;
  __cleanupInterval?: ReturnType<typeof setInterval>;
};

if (!globalForStore.__fileStore) {
  globalForStore.__fileStore = new Map<string, ShareEntry>();
}

const store = globalForStore.__fileStore;

const EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

function cleanup() {
  const now = Date.now();
  for (const [key, entry] of store.entries()) {
    if (now - entry.createdAt > EXPIRY_MS) {
      for (const file of entry.files) {
        try {
          if (fs.existsSync(file.filePath)) {
            fs.unlinkSync(file.filePath);
          }
        } catch {
          // File may already be deleted
        }
      }
      store.delete(key);
    }
  }
}

// Start cleanup interval (persist across hot reloads)
function ensureCleanup() {
  if (!globalForStore.__cleanupInterval) {
    globalForStore.__cleanupInterval = setInterval(cleanup, CLEANUP_INTERVAL_MS);
    const interval = globalForStore.__cleanupInterval;
    if (interval && typeof interval === "object" && "unref" in interval) {
      (interval as NodeJS.Timeout).unref();
    }
  }
}

ensureCleanup();

export function addShare(key: string, entry: ShareEntry) {
  store.set(key, entry);
}

export function getShare(key: string): ShareEntry | undefined {
  const entry = store.get(key);
  if (!entry) return undefined;

  // Check if expired
  if (Date.now() - entry.createdAt > EXPIRY_MS) {
    for (const file of entry.files) {
      try {
        if (fs.existsSync(file.filePath)) {
          fs.unlinkSync(file.filePath);
        }
      } catch {
        // ignore
      }
    }
    store.delete(key);
    return undefined;
  }

  return entry;
}

export function getUploadsDir(): string {
  // Serverless environments (Vercel) only allow writes to /tmp
  const base = process.env.VERCEL ? "/tmp" : process.cwd();
  const dir = path.join(base, "uploads");
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}
