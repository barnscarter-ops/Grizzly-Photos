import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  Play,
  Square,
  Search,
  Maximize2,
  Clock,
  ChevronRight,
  Info,
  Copy,
  Trash2,
  Settings,
  FolderOpen,
  RefreshCw,
} from "lucide-react";
import { LocalFile, AnalysisResult, ScanResult, ScanStats, ScanLog } from "./types";

const API = process.env.NODE_ENV === "production" ? "" : "http://localhost:3000";

interface TokenState {
  accessToken: string | null;
  folderId: string | null;
}

export default function App() {
  // Auth & token state
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [tokenState, setTokenState] = useState<TokenState>({
    accessToken: null,
    folderId: null,
  });

  // Config state
  const [config, setConfig] = useState({
    albumName: "Electrical Work Portfolio",
    folderName: "Electrical Work Pictures",
    syncFolderPath: "%USERPROFILE%\\Google Photos",
  });

  // Scanning state
  const [isScanning, setIsScanning] = useState(false);
  const [shouldStop, setShouldStop] = useState(false);
  const [currentScanningFile, setCurrentScanningFile] = useState<string | undefined>(undefined);
  const [scannedFiles, setScannedFiles] = useState<LocalFile[]>([]);
  const [scanResults, setScanResults] = useState<ScanResult[]>([]);
  const [logs, setLogs] = useState<ScanLog[]>([]);

  // UI state
  const [selectedResult, setSelectedResult] = useState<ScanResult | null>(null);
  const [activeTab, setActiveTab] = useState<"all" | "electrical" | "skipped">("electrical");
  const [copiedText, setCopiedText] = useState<string | null>(null);
  const [showConfig, setShowConfig] = useState(false);

  // Refs
  const logEndRef = useRef<HTMLDivElement>(null);

  // Load state on mount
  useEffect(() => {
    loadResults();
    loadConfig();
    checkAuth();
  }, []);

  useEffect(() => {
    if (logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs]);

  // --- Auth helpers ---

  const checkAuth = async () => {
    try {
      const resp = await fetch(`${API}/api/auth/status`);
      if (resp.ok) {
        const data = await resp.json();
        setTokenState({ accessToken: data.accessToken, folderId: data.folderId });
        setIsAuthLoading(false);
      } else {
        setIsAuthLoading(false);
      }
    } catch {
      setIsAuthLoading(false);
    }
  };

  const handleLogin = () => {
    window.open(
      `https://accounts.google.com/o/oauth2/auth?client_id=YOUR_CLIENT_ID&redirect_uri=http://localhost:3000/callback&scope=https://www.googleapis.com/auth/drive.file&response_type=code&state=grizzly-photos`,
      "_blank",
      "width=600,height=700"
    );
  };

  // --- API helpers ---

  async function loadResults() {
    try {
      const resp = await fetch(`${API}/api/results`);
      if (resp.ok) {
        const results = await resp.json();
        setScanResults(results);
      }
    } catch {
      /* ignore */
    }
  }

  async function loadLogs() {
    try {
      const resp = await fetch(`${API}/api/logs`);
      if (resp.ok) {
        const data = await resp.json();
        setLogs(data);
      }
    } catch {
      /* ignore */
    }
  }

  async function loadConfig() {
    try {
      const resp = await fetch(`${API}/api/config`);
      if (resp.ok) {
        const data = await resp.json();
        setConfig(data);
      }
    } catch {
      /* ignore */
    }
  }

  // --- Scan handlers ---

  const addLog = (message: string, type: "info" | "success" | "warning" | "error" = "info") => {
    const newLog: ScanLog = {
      id: Math.random().toString(36).substring(2, 9),
      timestamp: new Date().toLocaleTimeString(),
      message,
      type,
    };
    setLogs((prev) => [...prev, newLog]);
  };

  const handleStartScan = async () => {
    if (!tokenState.accessToken) {
      addLog("Please authorize with Google first.", "warning");
      return;
    }

    if (!scannedFiles.length) {
      addLog("No files selected for scanning. Select files first.", "warning");
      return;
    }

    const confirmed = window.confirm(
      `Confirm Scan & Sync:\n\n` +
      `- Analyze ${scannedFiles.length} files with Gemini 2.5 Flash\n` +
      `- Upload matches to Drive folder: "${config.folderName}"\n\n` +
      `Proceed?`
    );
    if (!confirmed) {
      addLog("Scan cancelled by user.", "info");
      return;
    }

    setIsScanning(true);
    setShouldStop(false);
    addLog("Initializing scan pipeline...", "info");

    // Step 1: Analyze files
    addLog(`Sending ${scannedFiles.length} files for Gemini analysis...`, "info");

    try {
      const resp = await fetch(`${API}/api/scan-local`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filePaths: scannedFiles.map((f) => f.path) }),
      });

      if (!resp.ok) {
        throw new Error(`Server returned: ${resp.statusText}`);
      }

      const data = await resp.json();
      addLog("Analysis complete!", "success");

      // Step 2: Upload electrical matches to Drive
      const electricalResults = data.results.filter((r: any) => r.analysisResult.isElectrical);

      if (electricalResults.length > 0) {
        addLog(`Found ${electricalResults.length} electrical match(es). Uploading to Drive...`, "info");

        for (const result of electricalResults) {
          if (shouldStop) {
            addLog("Scan paused by user.", "warning");
            break;
          }

          const fileName = result.analysisResult.descriptiveName +
            "." + (scannedFiles[result.filePath]?.filename.split(".").pop() || "jpg");

          setCurrentScanningFile(result.filePath);
          addLog(`Uploading "${fileName}"...`, "info");

          try {
            const uploadResp = await fetch(`${API}/api/upload-to-drive`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                accessToken: tokenState.accessToken,
                filePath: result.filePath,
                fileName,
                folderId: tokenState.folderId,
              }),
            });

            if (!uploadResp.ok) {
              throw new Error(`Upload failed: ${uploadResp.statusText}`);
            }

            const uploaded = await uploadResp.json();
            addLog(`✅ Uploaded to Drive: ${fileName}`, "success");
          } catch (err: any) {
            addLog(`❌ Upload failed: ${err.message}`, "error");
          }
        }
      } else {
        addLog("No electrical matches found. All files skipped.", "info");
      }

      await loadResults();
    } catch (err: any) {
      addLog(`Scan failed: ${err.message}`, "error");
    } finally {
      setIsScanning(false);
      setCurrentScanningFile(null);
    }
  };

  const handleStopScan = () => {
    setShouldStop(true);
    addLog("Stopping scan...", "warning");
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(text);
    setTimeout(() => setCopiedText(null), 2000);
  };

  const handleClearResults = async () => {
    if (!window.confirm("Clear all scan results? This cannot be undone.")) return;
    try {
      await fetch(`${API}/api/results/clear`, { method: "POST" });
      setScanResults([]);
      addLog("Results cleared.", "info");
    } catch (err) {
      addLog("Failed to clear results.", "error");
    }
  };

  // --- File selection ---

  const handleSelectFiles = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = true;
    input.accept = ".jpg,.jpeg,.png,.webp,.gif";
    input.onchange = (e: any) => {
      const files = Array.from(e.target.files) as File[];
      const localFiles: LocalFile[] = files.map((f) => ({
        path: f.name,
        filename: f.name,
        size: f.size,
        created: f.lastModified?.toString() || new Date().toISOString(),
        mimeType: f.type || "image/jpeg",
      }));
      setScannedFiles((prev) => [...prev, ...localFiles]);
      addLog(`Selected ${files.length} file(s) for scanning.`, "info");
    };
    input.click();
  };

  const removeFile = (index: number) => {
    setScannedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  // --- Filtered results ---

  const filteredResults = scanResults.filter((r) => {
    if (activeTab === "all") return true;
    if (activeTab === "electrical") return r.analysisResult.isElectrical;
    if (activeTab === "skipped") return !r.analysisResult.isElectrical;
    return true;
  });

  // --- Stats ---

  const stats: ScanStats = {
    totalScanned: scanResults.length,
    electricalFound: scanResults.filter((r) => r.analysisResult.isElectrical).length,
    savedToDriveCount: scanResults.filter((r) => r.savedToDrive).length,
    totalAvailable: scannedFiles.length,
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-gray-200 font-sans antialiased selection:bg-amber-500 selection:text-black">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-[#0d0d0d] border-b border-white/10 shadow-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="bg-amber-500 text-black p-2 rounded-sm shadow-sm flex items-center justify-center">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-serif tracking-tight text-white flex items-center">
                Grizzly Photos <span className="text-amber-500 italic text-sm ml-2 font-sans font-semibold tracking-widest uppercase">Scanner & Sync</span>
              </h1>
              <p className="text-[10px] text-gray-500 uppercase tracking-widest font-semibold">AI Automated Electrical Media Library</p>
            </div>
          </div>

          <div className="flex items-center space-x-4">
            {tokenState.accessToken ? (
              <div className="flex items-center space-x-3">
                <div className="text-right hidden sm:block">
                  <p className="text-xs font-bold text-white leading-tight">Authorized</p>
                  <p className="text-[10px] text-gray-500 font-mono">Google Drive</p>
                </div>
                <div className="w-8 h-8 rounded-full border border-white/20 bg-gradient-to-br from-gray-700 to-gray-900 text-white flex items-center justify-center font-bold text-sm">
                  G
                </div>
                <button
                  onClick={() => {
                    setTokenState({ accessToken: null, folderId: null });
                    addLog("Logged out.", "info");
                  }}
                  className="p-2 text-gray-400 hover:text-amber-500 rounded-sm hover:bg-white/5 transition-colors"
                  title="Sign Out"
                >
                  <Square className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <span className="text-[10px] font-bold uppercase tracking-widest px-3 py-1 rounded-sm bg-[#111111] text-gray-400 border border-white/10">
                Not Connected
              </span>
            )}
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <AnimatePresence mode="wait">
          {!tokenState.accessToken ? (
            /* SIGN IN VIEW */
            <motion.div
              key="signin"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              className="max-w-md mx-auto my-12"
            >
              <div className="bg-[#0d0d0d] rounded-sm border border-white/10 shadow-2xl p-8 text-center">
                <div className="w-16 h-16 bg-amber-500/10 border border-amber-500/20 rounded-sm flex items-center justify-center mx-auto mb-6">
                  <Sparkles className="w-8 h-8 text-amber-500 animate-pulse" />
                </div>
                <h2 className="text-2xl font-serif text-white mb-2 tracking-tight">Connect Your Google Account</h2>
                <p className="text-xs text-gray-400 mb-8 leading-relaxed font-sans">
                  Scan your photos for electrical work, organize matches, and backup beautifully labeled copies to Google Drive.
                </p>

                <button
                  onClick={handleLogin}
                  disabled={isAuthLoading}
                  className="w-full flex items-center justify-center space-x-3 bg-white hover:bg-amber-500 text-black font-bold py-3.5 px-4 rounded-sm shadow-lg uppercase tracking-wider text-xs focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-amber-500 transition-all cursor-pointer disabled:opacity-50"
                >
                  <svg className="w-5 h-5 shrink-0" viewBox="0 0 48 48">
                    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
                    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
                    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
                    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
                  </svg>
                  <span>{isAuthLoading ? "Loading..." : "Authorize with Google"}</span>
                </button>

                <div className="mt-8 border-t border-white/10 pt-6 text-left">
                  <h4 className="text-[10px] font-bold uppercase tracking-wider text-amber-500 mb-3">Permissions Requested</h4>
                  <ul className="space-y-2 text-xs text-gray-400 font-sans">
                    <li className="flex items-start space-x-2">
                      <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0 mt-0.5" />
                      <span><strong>Google Drive:</strong> Backup AI-classified electrical photos to your Drive.</span>
                    </li>
                  </ul>
                </div>
              </div>
            </motion.div>
          ) : (
            /* DASHBOARD */
            <motion.div
              key="dashboard"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="space-y-8"
            >
              {/* Stats Row */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatCard label="Files Selected" value={stats.totalAvailable} icon={<FolderOpen className="w-5 h-5 text-blue-400" />} />
                <StatCard label="Analyzed" value={stats.totalScanned} icon={<Search className="w-5 h-5 text-purple-400" />} />
                <StatCard label="Electrical Found" value={stats.electricalFound} icon={<Sparkles className="w-5 h-5 text-amber-400" />} />
                <StatCard label="Saved to Drive" value={stats.savedToDriveCount} icon={<CheckCircle2 className="w-5 h-5 text-green-400" />} />
              </div>

              {/* File Selection + Scan Controls */}
              <div className="bg-[#0d0d0d] rounded-sm border border-white/10 p-6">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div className="flex items-center space-x-2">
                    <FolderOpen className="w-5 h-5 text-amber-500" />
                    <h3 className="font-serif text-white text-lg tracking-tight">Select Files to Scan</h3>
                  </div>
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={handleSelectFiles}
                      disabled={isScanning}
                      className="flex items-center space-x-2 px-4 py-2 bg-[#111111] border border-white/10 rounded-sm text-xs font-semibold text-white hover:border-amber-500 transition-all disabled:opacity-50 cursor-pointer"
                    >
                      <Search className="w-4 h-4" />
                      <span>Browse Files</span>
                    </button>
                    <button
                      onClick={handleStartScan}
                      disabled={isScanning || !scannedFiles.length}
                      className="flex items-center space-x-2 px-4 py-2 bg-amber-500 text-black rounded-sm text-xs font-bold uppercase tracking-wider hover:bg-amber-400 transition-all disabled:opacity-50 shadow-lg cursor-pointer"
                    >
                      {isScanning ? (
                        <RefreshCw className="w-4 h-4 animate-spin" />
                      ) : (
                        <Play className="w-4 h-4" />
                      )}
                      <span>{isScanning ? "Scanning..." : "Start Scan"}</span>
                    </button>
                    {isScanning && (
                      <button
                        onClick={handleStopScan}
                        className="flex items-center space-x-2 px-3 py-2 bg-[#111111] border border-white/10 rounded-sm text-xs text-gray-400 hover:text-red-400 transition-all cursor-pointer"
                      >
                        <Square className="w-4 h-4" />
                        <span>Stop</span>
                      </button>
                    )}
                  </div>
                </div>

                {scannedFiles.length > 0 && (
                  <div className="mt-4 border border-white/10 rounded-sm overflow-hidden">
                    <div className="px-4 py-2 bg-[#111111] border-b border-white/10 text-[10px] font-bold uppercase tracking-widest text-gray-400 flex items-center justify-between">
                      <span>{scannedFiles.length} file(s) queued</span>
                      <button
                        onClick={() => {
                          setScannedFiles([]);
                          addLog("Cleared file selection.", "info");
                        }}
                        className="text-gray-500 hover:text-red-400 transition-colors"
                      >
                        Clear
                      </button>
                    </div>
                    <div className="max-h-48 overflow-y-auto">
                      {scannedFiles.map((f, i) => (
                        <div key={i} className="px-4 py-2 border-b border-white/5 flex items-center justify-between text-xs hover:bg-white/5 transition-colors">
                          <span className="font-mono text-gray-300 truncate max-w-lg">{f.filename}</span>
                          <span className="text-gray-500 text-[10px] ml-2">{(f.size / 1024).toFixed(0)}KB</span>
                          <button
                            onClick={() => removeFile(i)}
                            className="ml-3 text-gray-600 hover:text-red-400 transition-colors"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Results + Logs Grid */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Results */}
                <div className="lg:col-span-2 bg-[#0d0d0d] rounded-sm border border-white/10 p-6">
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center space-x-2">
                      <Sparkles className="w-5 h-5 text-amber-500" />
                      <h3 className="font-serif text-white text-lg tracking-tight">Scan Results</h3>
                    </div>
                    {scanResults.length > 0 && (
                      <button
                        onClick={handleClearResults}
                        className="text-[10px] font-bold uppercase tracking-widest text-gray-500 hover:text-red-400 transition-colors cursor-pointer"
                      >
                        Clear Results
                      </button>
                    )}
                  </div>

                  {/* Tabs */}
                  <div className="flex space-x-1 mb-4">
                    <TabButton label="Electrical" active={activeTab === "electrical"} onClick={() => setActiveTab("electrical")} count={stats.electricalFound} />
                    <TabButton label="All" active={activeTab === "all"} onClick={() => setActiveTab("all")} count={stats.totalScanned} />
                    <TabButton label="Skipped" active={activeTab === "skipped"} onClick={() => setActiveTab("skipped")} count={stats.totalScanned - stats.electricalFound} />
                  </div>

                  {/* Grid */}
                  {filteredResults.length === 0 ? (
                    <div className="text-center py-16 text-gray-500">
                      <Sparkles className="w-12 h-12 mx-auto mb-4 opacity-30" />
                      <p className="text-sm">No results yet. Select files and run a scan.</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                      {filteredResults.map((r) => (
                        <ResultCard
                          key={r.id}
                          result={r}
                          onClick={() => setSelectedResult(r)}
                          currentFile={currentScanningFile}
                          isScanning={isScanning}
                        />
                      ))}
                    </div>
                  )}
                </div>

                {/* Logs */}
                <div className="bg-[#0d0d0d] rounded-sm border border-white/10 p-6">
                  <div className="flex items-center space-x-2 mb-6">
                    <Clock className="w-5 h-5 text-amber-500" />
                    <h3 className="font-serif text-white text-lg tracking-tight">Scan Log</h3>
                  </div>

                  <div className="max-h-[500px] overflow-y-auto space-y-2">
                    {logs.length === 0 ? (
                      <p className="text-xs text-gray-500 text-center py-8">No logs yet.</p>
                    ) : (
                      logs.map((log) => (
                        <div
                          key={log.id}
                          className={`text-xs p-2 rounded-sm ${
                            log.type === "error"
                              ? "bg-red-500/10 text-red-400 border border-red-500/20"
                              : log.type === "success"
                              ? "bg-green-500/10 text-green-400 border border-green-500/20"
                              : log.type === "warning"
                              ? "bg-yellow-500/10 text-yellow-400 border border-yellow-500/20"
                              : "bg-[#111111] text-gray-300 border border-white/5"
                          }`}
                        >
                          <div className="flex items-center space-x-2">
                            <span className="text-[10px] font-mono text-gray-500">{log.timestamp}</span>
                            <span className="flex-1">{log.message}</span>
                          </div>
                        </div>
                      ))
                    )}
                    <div ref={logEndRef} />
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}

// --- Sub-components ---

function StatCard({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
  return (
    <div className="bg-[#0d0d0d] rounded-sm border border-white/10 p-4 flex items-center space-x-3">
      <div className="p-2 bg-white/5 rounded-sm">{icon}</div>
      <div>
        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500">{label}</p>
        <p className="text-2xl font-bold text-white">{value}</p>
      </div>
    </div>
  );
}

function TabButton({ label, active, onClick, count }: { label: string; active: boolean; onClick: () => void; count: number }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 text-xs font-bold uppercase tracking-wider rounded-sm transition-all ${
        active
          ? "bg-amber-500 text-black shadow-lg"
          : "bg-[#111111] text-gray-400 hover:text-white border border-white/10"
      }`}
    >
      {label} <span className="text-[10px] opacity-75">({count})</span>
    </button>
  );
}

function ResultCard({ result, onClick, currentFile, isScanning }: { result: ScanResult; onClick: () => void; currentFile: string | undefined; isScanning: boolean }) {
  const isElectrical = result.analysisResult.isElectrical;
  const isCurrent = result.filePath === currentFile;

  return (
    <motion.div
      onClick={onClick}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      className={`rounded-sm border cursor-pointer overflow-hidden transition-all ${
        isCurrent
          ? isElectrical
            ? "border-amber-500 shadow-lg shadow-amber-500/20"
            : "border-gray-500"
          : isElectrical
          ? "border-green-500/30 hover:border-green-400"
          : "border-white/10 hover:border-white/20"
      }`}
    >
      {/* Thumbnail placeholder */}
      <div className={`h-32 flex items-center justify-center ${isElectrical ? "bg-green-500/10" : "bg-gray-500/10"}`}>
        {isScanning && isCurrent ? (
          <RefreshCw className="w-8 h-8 text-amber-500 animate-spin" />
        ) : isElectrical ? (
          <Sparkles className="w-8 h-8 text-amber-500" />
        ) : (
          <AlertTriangle className="w-8 h-8 text-gray-500" />
        )}
      </div>

      <div className="p-3">
        <p className="text-xs font-mono text-gray-300 truncate">{result.fileName}</p>
        <div className="flex items-center space-x-1 mt-2">
          {isElectrical ? (
            <span className="text-[10px] font-bold text-green-400 uppercase tracking-wider">Match</span>
          ) : (
            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Skipped</span>
          )}
          {result.savedToDrive && (
            <span className="text-[10px] font-bold text-blue-400 ml-2 uppercase tracking-wider">✓ Drive</span>
          )}
        </div>
      </div>
    </motion.div>
  );
}
