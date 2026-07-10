import fs from "fs";
import path from "path";
import { ScanResult, ScanLog } from "./types";

const STATE_DIR = path.join(__dirname, "..", "..", "data");
const STATE_FILE = path.join(STATE_DIR, "state.json");

// Ensure data directory exists
if (!fs.existsSync(STATE_DIR)) {
  fs.mkdirSync(STATE_DIR, { recursive: true });
}

export interface StateData {
  config: {
    albumName: string;
    folderName: string;
    lastScan: string | null;
    syncFolderPath: string;
  };
  results: ScanResult[];
  logs: ScanLog[];
}

function loadState(): StateData {
  try {
    const data = fs.readFileSync(STATE_FILE, "utf-8");
    return JSON.parse(data);
  } catch {
    return {
      config: {
        albumName: "Electrical Work Portfolio",
        folderName: "Electrical Work Pictures",
        lastScan: null,
        syncFolderPath: path.join(process.env.USERPROFILE || "", "Google Photos"),
      },
      results: [],
      logs: [],
    };
  }
}

function saveState(state: StateData) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

export const stateStore = {
  load: loadState,
  save: saveState,
  getResults: () => loadState().results,
  getLogs: () => loadState().logs,
  addResult: (result: ScanResult) => {
    const state = loadState();
    state.results = [result, ...state.results];
    saveState(state);
  },
  addLog: (log: ScanLog) => {
    const state = loadState();
    state.logs = [log, ...state.logs];
    saveState(state);
  },
  updateConfig: (config: Partial<StateData["config"]>) => {
    const state = loadState();
    state.config = { ...state.config, ...config };
    saveState(state);
  },
  getConfig: () => loadState().config,
  clearResults: () => {
    const state = loadState();
    state.results = [];
    saveState(state);
  },
};
