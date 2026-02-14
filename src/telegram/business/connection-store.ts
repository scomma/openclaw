import fs from "node:fs";
import path from "node:path";
import type { OpenClawConfig } from "../../config/config.js";
import type { BusinessConnectionStore, StoredBusinessConnection } from "./types.js";
import { resolveStateDir } from "../../config/paths.js";

const CONNECTIONS_FILE = "connections.json";

/** Resolve the base storage directory for Telegram business mode data. */
export function resolveBusinessStorageDir(cfg: OpenClawConfig, accountId?: string): string {
  const customDir = cfg.channels?.telegram?.business?.storageDir;
  if (customDir) {
    return accountId ? path.join(customDir, accountId) : customDir;
  }
  const stateDir = resolveStateDir();
  const base = path.join(stateDir, "telegram-business");
  return path.join(base, accountId ?? "default");
}

function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

function connectionsPath(baseDir: string): string {
  return path.join(baseDir, CONNECTIONS_FILE);
}

export function loadBusinessConnections(baseDir: string): BusinessConnectionStore {
  const filePath = connectionsPath(baseDir);
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(raw) as BusinessConnectionStore;
    if (parsed.version === 1 && parsed.connections) {
      return parsed;
    }
  } catch {
    // File doesn't exist or is corrupt — return empty store.
  }
  return { version: 1, connections: {} };
}

export function saveBusinessConnection(baseDir: string, conn: StoredBusinessConnection): void {
  ensureDir(baseDir);
  const store = loadBusinessConnections(baseDir);
  store.connections[conn.id] = conn;
  const filePath = connectionsPath(baseDir);
  fs.writeFileSync(filePath, JSON.stringify(store, null, 2), "utf-8");
}

/** Returns the most recently updated active (enabled) connection ID, or undefined. */
export function getActiveBusinessConnectionId(baseDir: string): string | undefined {
  const store = loadBusinessConnections(baseDir);
  let best: StoredBusinessConnection | undefined;
  for (const conn of Object.values(store.connections)) {
    if (!conn.isEnabled) {
      continue;
    }
    if (!best || conn.updatedAt > best.updatedAt) {
      best = conn;
    }
  }
  return best?.id;
}
