import chokidar from "chokidar";
import * as fs from "fs";
import * as path from "path";
import { getSyncFolderPath, isGooglePhotosInstalled, installGooglePhotosApp } from "./installGpa";
import { LocalFile } from "./types";

const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);

export interface FileWatcher {
  watcher: chokidar.FSWatcher;
  onFileAdded(callback: (file: LocalFile) => void): void;
  stop(): void;
}

const callbacks: Array<(file: LocalFile) => void> = [];

export function createFileWatcher(): FileWatcher {
  const syncFolder = getSyncFolderPath();

  const watcher = chokidar.watch(syncFolder, {
    ignored: (filePath) => {
      const ext = path.extname(filePath).toLowerCase();
      return !IMAGE_EXTENSIONS.has(ext);
    },
    persistent: true,
    ignoreInitial: true,
    followSymlinks: false,
    awaitWriteFinish: {
      stabilityThreshold: 2000,
      pollInterval: 500,
    },
  });

  watcher.on("add", async (filePath) => {
    try {
      const stat = await fs.promises.stat(filePath);
      const ext = path.extname(filePath).toLowerCase();
      const mimeType = getMimeType(ext);
      const localFile: LocalFile = {
        path: filePath,
        filename: path.basename(filePath),
        size: stat.size,
        created: stat.birthtime?.toISOString() || new Date().toISOString(),
        mimeType,
      };
      callbacks.forEach((cb) => cb(localFile));
    } catch (err) {
      console.error(`Failed to process watched file ${filePath}:`, err);
    }
  });

  return {
    watcher,
    onFileAdded: (callback) => callbacks.push(callback),
    stop: () => watcher.close(),
  };
}

function getMimeType(ext: string): string {
  switch (ext) {
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".png":
      return "image/png";
    case ".webp":
      return "image/webp";
    case ".gif":
      return "image/gif";
    default:
      return "image/jpeg";
  }
}

export async function ensureGooglePhotosSetup(): Promise<void> {
  if (!isGooglePhotosInstalled()) {
    console.log("Google Photos Desktop App not found. Attempting install...");
    const success = await installGooglePhotosApp();
    if (!success) {
      throw new Error(
        "Google Photos Desktop App required. Please install manually from https://photos.google.com/photosdownloadsetup"
      );
    }
    console.log("Google Photos Desktop App installed successfully.");
  }

  const syncFolder = getSyncFolderPath();
  if (!fs.existsSync(syncFolder)) {
    fs.mkdirSync(syncFolder, { recursive: true });
    console.log(`Created sync folder: ${syncFolder}`);
  }
}
