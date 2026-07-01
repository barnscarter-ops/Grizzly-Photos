import React, { useState, useEffect, useRef } from "react";
import { initializeApp } from "firebase/app";
import {
  getAuth,
  signInWithPopup,
  GoogleAuthProvider,
  onAuthStateChanged,
  User,
  signOut,
} from "firebase/auth";
import { motion, AnimatePresence } from "motion/react";
import {
  FolderCheck,
  Image,
  Layers,
  LogOut,
  Play,
  Square,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  FolderOpen,
  Check,
  Search,
  Maximize2,
  Clock,
  ExternalLink,
  ChevronRight,
  Info,
  Sliders,
  Copy,
} from "lucide-react";
import firebaseConfig from "../firebase-applet-config.json";
import {
  listMediaItems,
  findOrCreateAlbum,
  addMediaItemToAlbum,
  findOrCreateFolder,
  fetchPhotoBlob,
  uploadFileToDrive,
  checkAlbumExists,
  checkFolderExists,
} from "./googleApi";
import { ScannedPhoto, ScanStats, ScanLog } from "./types";

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

export default function App() {
  // Authentication states
  const [user, setUser] = useState<User | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  // Configuration states
  const [albumName, setAlbumName] = useState("Electrical Work Portfolio");
  const [folderName, setFolderName] = useState("Electrical Work Pictures");
  const [scanLimit, setScanLimit] = useState<number>(50);

  // Scanning engine states
  const [isScanning, setIsScanning] = useState(false);
  const [shouldStop, setShouldStop] = useState(false);
  const [currentScanningPhoto, setCurrentScanningPhoto] = useState<ScannedPhoto | null>(null);
  const [scannedPhotos, setScannedPhotos] = useState<ScannedPhoto[]>([]);
  const [logs, setLogs] = useState<ScanLog[]>([]);
  const [stats, setStats] = useState<ScanStats>({
    totalAnalyzed: 0,
    electricalFound: 0,
    savedToDriveCount: 0,
    savedToAlbumCount: 0,
    totalAvailable: 0,
  });

  // UI state
  const [selectedPhoto, setSelectedPhoto] = useState<ScannedPhoto | null>(null);
  const [activeTab, setActiveTab] = useState<"all" | "electrical" | "skipped">("electrical");
  const [copiedText, setCopiedText] = useState<string | null>(null);

  // Discovery tool states
  const [searchResourceName, setSearchResourceName] = useState("grizzly");
  const [isCheckingResources, setIsCheckingResources] = useState(false);
  const [hasCheckedResources, setHasCheckedResources] = useState(false);
  const [checkedAlbumResult, setCheckedAlbumResult] = useState<{ id: string; title: string; productUrl?: string } | null>(null);
  const [checkedFolderResult, setCheckedFolderResult] = useState<{ id: string; name: string; webViewLink?: string } | null>(null);
  const [checkError, setCheckError] = useState<string | null>(null);

  // Refs for log auto-scrolling
  const logEndRef = useRef<HTMLDivElement>(null);

  // Load user profile & state
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setIsAuthLoading(false);
      // Clean up token if logged out
      if (!currentUser) {
        setAccessToken(null);
      }
    });
    return () => unsubscribe();
  }, []);

  // Scroll to bottom of logs when a new log arrives
  useEffect(() => {
    if (logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs]);

  // Handle Login with requested scopes
  const handleLogin = async () => {
    setIsAuthLoading(true);
    setAuthError(null);
    try {
      const provider = new GoogleAuthProvider();
      // Scopes requested by user
      provider.addScope("https://www.googleapis.com/auth/photoslibrary");
      provider.addScope("https://www.googleapis.com/auth/drive.file");
      provider.addScope("https://www.googleapis.com/auth/userinfo.profile");
      provider.addScope("https://www.googleapis.com/auth/userinfo.email");

      const result = await signInWithPopup(auth, provider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      if (!credential?.accessToken) {
        throw new Error("Failed to retrieve Google API Access Token from login.");
      }

      setAccessToken(credential.accessToken);
      addLog("Successfully authenticated with Google & verified API scopes.", "success");
    } catch (err: any) {
      console.error(err);
      setAuthError(err.message || "Authentication failed. Please try again.");
      addLog(`Authentication error: ${err.message}`, "error");
    } finally {
      setIsAuthLoading(false);
    }
  };

  // Handle Logout
  const handleLogout = async () => {
    try {
      await signOut(auth);
      setAccessToken(null);
      setUser(null);
      setScannedPhotos([]);
      setCurrentScanningPhoto(null);
      setLogs([]);
      setStats({
        totalAnalyzed: 0,
        electricalFound: 0,
        savedToDriveCount: 0,
        savedToAlbumCount: 0,
        totalAvailable: 0,
      });
      addLog("Logged out successfully.", "info");
    } catch (err: any) {
      addLog(`Logout error: ${err.message}`, "error");
    }
  };

  // Helper to add logs
  const addLog = (message: string, type: "info" | "success" | "warning" | "error" = "info") => {
    const newLog: ScanLog = {
      id: Math.random().toString(36).substring(2, 9),
      timestamp: new Date().toLocaleTimeString(),
      message,
      type,
    };
    setLogs((prev) => [...prev, newLog]);
  };

  // Copy text to clipboard
  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(text);
    setTimeout(() => setCopiedText(null), 2000);
  };

  // Check if album or folder exists in Google Photos or Google Drive
  const handleCheckResources = async () => {
    if (!accessToken) {
      addLog("Please connect and authorize your Google account first.", "warning");
      return;
    }
    if (!searchResourceName.trim()) {
      addLog("Please enter a valid search name.", "warning");
      return;
    }

    setIsCheckingResources(true);
    setHasCheckedResources(true);
    setCheckedAlbumResult(null);
    setCheckedFolderResult(null);
    setCheckError(null);

    addLog(`🔍 Querying Google APIs for match on: "${searchResourceName}"...`, "info");

    try {
      // 1. Check Photos Album
      const albumResult = await checkAlbumExists(accessToken, searchResourceName);
      if (albumResult) {
        setCheckedAlbumResult(albumResult);
        addLog(`✅ Google Photos Album found: "${albumResult.title}" (ID: ${albumResult.id.substring(0, 12)}...)`, "success");
      } else {
        addLog(`ℹ️ No Google Photos Album found named "${searchResourceName}".`, "info");
      }

      // 2. Check Drive Folder
      const folderResult = await checkFolderExists(accessToken, searchResourceName);
      if (folderResult) {
        setCheckedFolderResult(folderResult);
        addLog(`✅ Google Drive Folder found: "${folderResult.name}" (ID: ${folderResult.id.substring(0, 12)}...)`, "success");
      } else {
        addLog(`ℹ️ No Google Drive Folder found named "${searchResourceName}".`, "info");
      }
    } catch (err: any) {
      console.error(err);
      setCheckError(err.message || "Failed to query Google APIs.");
      addLog(`❌ Resource verification error: ${err.message}`, "error");
    } finally {
      setIsCheckingResources(false);
    }
  };

  // Start the Scanning process
  const handleStartScan = async () => {
    if (!accessToken) {
      addLog("Please log in first before initiating a scan.", "warning");
      return;
    }

    // Explicit confirmation dialog per guidelines
    const confirmed = window.confirm(
      `Confirm Photo Scan & Sync:\n\n` +
      `- Scan up to your last ${scanLimit} photos from Google Photos\n` +
      `- Use Gemini to identify any electrical work\n` +
      `- Save matches into a Photos Album named "${albumName}"\n` +
      `- Upload matches into Google Drive folder "${folderName}"\n\n` +
      `Do you want to proceed with this sync?`
    );

    if (!confirmed) {
      addLog("Scan and sync cancelled by user.", "info");
      return;
    }

    setIsScanning(true);
    setShouldStop(false);
    setScannedPhotos([]);
    setCurrentScanningPhoto(null);
    setStats({
      totalAnalyzed: 0,
      electricalFound: 0,
      savedToDriveCount: 0,
      savedToAlbumCount: 0,
      totalAvailable: 0,
    });

    addLog("Initializing scanning process...", "info");
    addLog(`Target Google Photos Album: "${albumName}"`, "info");
    addLog(`Target Google Drive Folder: "${folderName}"`, "info");

    let albumId = "";
    let driveFolderId = "";

    try {
      // 1. Find or create the Google Photos Album
      addLog(`Resolving Google Photos Album: "${albumName}"...`, "info");
      albumId = await findOrCreateAlbum(accessToken, albumName);
      addLog(`Google Photos Album resolved successfully (ID: ${albumId.substring(0, 10)}...)`, "success");

      // 2. Find or create the Google Drive Folder
      addLog(`Resolving Google Drive Folder: "${folderName}"...`, "info");
      driveFolderId = await findOrCreateFolder(accessToken, folderName);
      addLog(`Google Drive Folder resolved successfully (ID: ${driveFolderId.substring(0, 10)}...)`, "success");
    } catch (err: any) {
      addLog(`Setup failed: ${err.message}. Aborting scan.`, "error");
      setIsScanning(false);
      return;
    }

    try {
      // 3. Fetch latest Photos
      addLog(`Fetching up to ${scanLimit} latest photos from Google Photos Library...`, "info");
      const { mediaItems, nextPageToken } = await listMediaItems(accessToken, scanLimit);

      if (!mediaItems || mediaItems.length === 0) {
        addLog("No photos found in your Google Photos library to scan.", "warning");
        setIsScanning(false);
        return;
      }

      const totalFetched = mediaItems.length;
      addLog(`Fetched ${totalFetched} photos to analyze. Starting Gemini analysis pipeline...`, "success");
      setStats((prev) => ({ ...prev, totalAvailable: totalFetched }));

      // 4. Loop through photos & process
      for (let i = 0; i < mediaItems.length; i++) {
        // Check for pause request
        if (shouldStop) {
          addLog("Scan paused by user request.", "warning");
          break;
        }

        const item = mediaItems[i];
        const localPhoto: ScannedPhoto = {
          id: item.id,
          filename: item.filename,
          baseUrl: item.baseUrl,
          creationTime: new Date(item.mediaMetadata.creationTime).toLocaleString(),
          isAnalyzed: false,
        };

        setCurrentScanningPhoto(localPhoto);
        addLog(`[${i + 1}/${totalFetched}] Analyzing photo: "${item.filename}"...`, "info");

        try {
          // Call server-side API proxy for Gemini Vision analysis
          const response = await fetch("/api/analyze-image", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              baseUrl: item.baseUrl,
              mimeType: item.mimeType,
              filename: item.filename,
            }),
          });

          if (!response.ok) {
            throw new Error(`Server returned error: ${response.statusText}`);
          }

          const analysisResult = await response.json();
          localPhoto.isAnalyzed = true;
          localPhoto.isElectrical = analysisResult.isElectrical;
          localPhoto.descriptiveName = analysisResult.descriptiveName;
          localPhoto.description = analysisResult.description;
          localPhoto.electricalType = analysisResult.electricalType;
          localPhoto.componentsDetected = analysisResult.componentsDetected;
          localPhoto.craftsmanshipRating = analysisResult.craftsmanshipRating;

          setStats((prev) => ({ ...prev, totalAnalyzed: prev.totalAnalyzed + 1 }));

          if (analysisResult.isElectrical) {
            addLog(`⚡ Match identified! [${analysisResult.electricalType}] graded as "${analysisResult.craftsmanshipRating}"`, "success");
            addLog(`📝 AI Descriptive Name: "${analysisResult.descriptiveName}"`, "success");
            addLog(`🔍 AI Description: "${analysisResult.description}"`, "info");

            setStats((prev) => ({ ...prev, electricalFound: prev.electricalFound + 1 }));

            // Step 4a: Download high-resolution photo bytes & upload to Google Drive
            try {
              addLog(`Downloading original image bytes from Google Photos...`, "info");
              const photoBlob = await fetchPhotoBlob(item.baseUrl);

              addLog(`Uploading to Google Drive as "${analysisResult.descriptiveName}"...`, "info");
              const driveFile = await uploadFileToDrive(
                accessToken,
                photoBlob,
                analysisResult.descriptiveName,
                driveFolderId
              );

              localPhoto.savedToDrive = true;
              localPhoto.driveFileId = driveFile.id;
              localPhoto.driveLink = driveFile.webViewLink;
              setStats((prev) => ({ ...prev, savedToDriveCount: prev.savedToDriveCount + 1 }));
              addLog(`📁 Uploaded to Google Drive successfully! File ID: ${driveFile.id.substring(0, 10)}...`, "success");
            } catch (driveErr: any) {
              console.error(driveErr);
              localPhoto.savedToDrive = false;
              localPhoto.error = `Drive Upload Failed: ${driveErr.message}`;
              addLog(`❌ Google Drive upload failed: ${driveErr.message}`, "error");
            }

            // Step 4b: Add to Google Photos Album
            try {
              addLog(`Adding photo to Google Photos Album "${albumName}"...`, "info");
              await addMediaItemToAlbum(accessToken, albumId, item.id);
              localPhoto.savedToAlbum = true;
              setStats((prev) => ({ ...prev, savedToAlbumCount: prev.savedToAlbumCount + 1 }));
              addLog(`🖼️ Photo successfully linked to Album "${albumName}"!`, "success");
            } catch (albumErr: any) {
              console.error(albumErr);
              localPhoto.savedToAlbum = false;
              localPhoto.error = (localPhoto.error ? localPhoto.error + " | " : "") + `Album Add Failed: ${albumErr.message}`;
              addLog(`❌ Failed to add to Google Photos Album: ${albumErr.message}`, "error");
            }
          } else {
            addLog(`⏭️ Photo skipped: Does not depict electrical work.`, "info");
          }

          setScannedPhotos((prev) => [localPhoto, ...prev]);
        } catch (photoErr: any) {
          console.error(photoErr);
          localPhoto.isAnalyzed = true;
          localPhoto.error = photoErr.message;
          setScannedPhotos((prev) => [localPhoto, ...prev]);
          addLog(`❌ Error processing photo "${item.filename}": ${photoErr.message}`, "error");
        }

        // Slight breathing room for UI updates
        await new Promise((resolve) => setTimeout(resolve, 600));
      }

      addLog("All photos in batch scanned and processed successfully!", "success");
    } catch (err: any) {
      console.error(err);
      addLog(`Scan operation failed: ${err.message}`, "error");
    } finally {
      setIsScanning(false);
      setCurrentScanningPhoto(null);
    }
  };

  // Request to stop scanning gracefully on the next photo
  const handleStopScan = () => {
    setShouldStop(true);
    addLog("Requesting scan to pause... current photo will finish processing first.", "warning");
  };

  // Filter gallery items
  const filteredPhotos = scannedPhotos.filter((p) => {
    if (activeTab === "all") return true;
    if (activeTab === "electrical") return p.isElectrical;
    if (activeTab === "skipped") return !p.isElectrical;
    return true;
  });

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-gray-200 font-sans antialiased selection:bg-amber-500 selection:text-black">
      {/* Top Banner / Header */}
      <header className="sticky top-0 z-40 bg-[#0d0d0d] border-b border-white/10 shadow-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="bg-amber-500 text-black p-2 rounded-sm shadow-sm flex items-center justify-center">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-serif tracking-tight text-white flex items-center">
                VoltArchive <span className="text-amber-500 italic text-sm ml-2 font-sans font-semibold tracking-widest uppercase">Scanner & Sync</span>
              </h1>
              <p className="text-[10px] text-gray-500 uppercase tracking-widest font-semibold">AI Automated Electrical Media Library</p>
            </div>
          </div>

          <div className="flex items-center space-x-4">
            {user ? (
              <div className="flex items-center space-x-3">
                <div className="text-right hidden sm:block">
                  <p className="text-xs font-bold text-white leading-tight">
                    {user.displayName || "Electrician"}
                  </p>
                  <p className="text-[10px] text-gray-500 font-mono">{user.email}</p>
                </div>
                {user.photoURL ? (
                  <img
                    referrerPolicy="no-referrer"
                    src={user.photoURL}
                    alt="User profile"
                    className="w-10 h-10 rounded-full border border-white/20 bg-gradient-to-br from-gray-700 to-gray-900"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-full border border-white/20 bg-gradient-to-br from-gray-700 to-gray-900 text-white flex items-center justify-center font-bold text-sm">
                    {user.displayName ? user.displayName[0].toUpperCase() : "E"}
                  </div>
                )}
                <button
                  id="btn-logout"
                  onClick={handleLogout}
                  className="p-2 text-gray-400 hover:text-amber-500 rounded-sm hover:bg-white/5 transition-colors"
                  title="Sign Out"
                >
                  <LogOut className="w-4 h-4" />
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

      {/* Main Content Stage */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <AnimatePresence mode="wait">
          {!user ? (
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
                  Automatically scan your photos for electrical work, organize matches into a clean archive, and backup beautifully labeled, searchable copies to Google Drive.
                </p>

                {authError && (
                  <div className="mb-6 p-4 rounded-sm bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs text-left flex items-start space-x-2 font-mono">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{authError}</span>
                  </div>
                )}

                <button
                  id="btn-google-signin"
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
                  <span>{isAuthLoading ? "Initializing Connection..." : "Authorize with Google"}</span>
                </button>

                <div className="mt-8 border-t border-white/10 pt-6 text-left">
                  <h4 className="text-[10px] font-bold uppercase tracking-wider text-amber-500 mb-3">Permissions Requested</h4>
                  <ul className="space-y-2 text-xs text-gray-400 font-sans">
                    <li className="flex items-start space-x-2">
                      <Check className="w-3.5 h-3.5 text-green-500 shrink-0 mt-0.5" />
                      <span><strong>Google Photos Library:</strong> Scan uploads to extract electrical images & save them into album records.</span>
                    </li>
                    <li className="flex items-start space-x-2">
                      <Check className="w-3.5 h-3.5 text-green-500 shrink-0 mt-0.5" />
                      <span><strong>Google Drive Support:</strong> Backup beautiful, AI-renamed copies of high-res matches securely.</span>
                    </li>
                  </ul>
                </div>
              </div>
            </motion.div>
          ) : (
            /* LOGGED IN DASHBOARD */
            <motion.div
              key="dashboard"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="space-y-8"
            >
              {/* TOP GRID: Controls & Stats */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* 1. Controller & Configurations */}
                <div className="lg:col-span-2 bg-[#0d0d0d] rounded-sm border border-white/10 p-6 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center space-x-2 mb-6">
                      <Sliders className="w-5 h-5 text-amber-500" />
                      <h3 className="font-serif text-white text-lg tracking-tight">Scan & Sync Setup</h3>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                      <div>
                        <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">
                          Photos Album Name
                        </label>
                        <div className="relative">
                          <Image className="absolute left-3 top-3 w-4 h-4 text-gray-500" />
                          <input
                            type="text"
                            value={albumName}
                            onChange={(e) => setAlbumName(e.target.value)}
                            disabled={isScanning}
                            className="w-full pl-10 pr-3 py-2.5 text-xs bg-[#0a0a0a] text-white border border-white/10 rounded-sm focus:outline-none focus:border-amber-500 transition-all disabled:opacity-50 font-sans"
                            placeholder="e.g. Electrical Work"
                          />
                        </div>
                        <p className="text-[10px] text-gray-500 mt-1.5 italic font-sans">
                          Identified electrical work items will be curated in this album.
                        </p>
                      </div>

                      <div>
                        <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">
                          Google Drive Backup Folder
                        </label>
                        <div className="relative">
                          <FolderOpen className="absolute left-3 top-3 w-4 h-4 text-gray-500" />
                          <input
                            type="text"
                            value={folderName}
                            onChange={(e) => setFolderName(e.target.value)}
                            disabled={isScanning}
                            className="w-full pl-10 pr-3 py-2.5 text-xs bg-[#0a0a0a] text-white border border-white/10 rounded-sm focus:outline-none focus:border-amber-500 transition-all disabled:opacity-50 font-sans"
                            placeholder="e.g. Electrical Archive"
                          />
                        </div>
                        <p className="text-[10px] text-gray-500 mt-1.5 italic font-sans">
                          A dedicated folder for named, high-resolution backups.
                        </p>
                      </div>
                    </div>

                    {/* Active Resource Matching Tool */}
                    <div className="mb-6 bg-[#0a0a0a]/50 border border-white/5 rounded-sm p-4 space-y-3">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div>
                          <h4 className="text-[10px] font-bold text-amber-500 uppercase tracking-widest flex items-center">
                            <Search className="w-3.5 h-3.5 mr-1.5" />
                            <span>Verify & Match Existing Cloud Resources</span>
                          </h4>
                          <p className="text-[10px] text-gray-500 font-sans mt-0.5">
                            Search your Google account for predefined albums or folders (e.g. <strong className="text-gray-300">"grizzly"</strong>) and apply them instantly.
                          </p>
                        </div>
                      </div>

                      <div className="flex space-x-2">
                        <input
                          type="text"
                          value={searchResourceName}
                          onChange={(e) => setSearchResourceName(e.target.value)}
                          disabled={isScanning || isCheckingResources}
                          className="flex-1 px-3 py-2 text-xs bg-[#0a0a0a] text-white border border-white/10 rounded-sm focus:outline-none focus:border-amber-500 transition-all font-mono"
                          placeholder="e.g. grizzly"
                        />
                        <button
                          type="button"
                          onClick={handleCheckResources}
                          disabled={isScanning || isCheckingResources}
                          className="px-4 py-2 bg-white hover:bg-amber-500 text-black font-bold uppercase tracking-widest text-[9px] rounded-sm transition-all cursor-pointer disabled:opacity-50"
                        >
                          {isCheckingResources ? "Searching..." : "Search & Verify"}
                        </button>
                      </div>

                      {hasCheckedResources && (
                        <div className="pt-2 border-t border-white/5 space-y-2">
                          {checkError ? (
                            <div className="p-2.5 bg-rose-500/10 border border-rose-500/20 rounded-sm text-rose-400 text-[10px] font-mono flex items-center space-x-1.5">
                              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                              <span>{checkError}</span>
                            </div>
                          ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              {/* Album Check Output */}
                              <div className="bg-[#050505] border border-white/5 p-3 rounded-sm flex flex-col justify-between space-y-2">
                                <div>
                                  <span className="text-[8px] font-bold uppercase tracking-widest text-gray-500">Google Photos Album</span>
                                  {checkedAlbumResult ? (
                                    <div className="mt-1">
                                      <p className="text-xs font-serif font-bold text-green-400 truncate flex items-center">
                                        <CheckCircle2 className="w-3.5 h-3.5 mr-1 text-green-400 shrink-0" />
                                        Found: {checkedAlbumResult.title}
                                      </p>
                                      <p className="text-[9px] text-gray-600 truncate font-mono mt-0.5">ID: {checkedAlbumResult.id.substring(0, 16)}...</p>
                                    </div>
                                  ) : (
                                    <div className="mt-1">
                                      <p className="text-xs text-gray-500 italic">Not found ("{searchResourceName}")</p>
                                      <p className="text-[8px] text-gray-600 font-sans mt-0.5">Will be auto-created during sync.</p>
                                    </div>
                                  )}
                                </div>
                                {checkedAlbumResult && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setAlbumName(checkedAlbumResult.title);
                                      addLog(`Applied matched Album "${checkedAlbumResult.title}" as scan target.`, "success");
                                    }}
                                    className="w-full py-1 bg-amber-500/10 hover:bg-amber-500/20 text-amber-500 border border-amber-500/20 text-[9px] font-bold uppercase tracking-widest rounded-sm transition-all"
                                  >
                                    Use Album
                                  </button>
                                )}
                              </div>

                              {/* Folder Check Output */}
                              <div className="bg-[#050505] border border-white/5 p-3 rounded-sm flex flex-col justify-between space-y-2">
                                <div>
                                  <span className="text-[8px] font-bold uppercase tracking-widest text-gray-500">Google Drive Folder</span>
                                  {checkedFolderResult ? (
                                    <div className="mt-1">
                                      <p className="text-xs font-serif font-bold text-green-400 truncate flex items-center">
                                        <CheckCircle2 className="w-3.5 h-3.5 mr-1 text-green-400 shrink-0" />
                                        Found: {checkedFolderResult.name}
                                      </p>
                                      <p className="text-[9px] text-gray-600 truncate font-mono mt-0.5">ID: {checkedFolderResult.id.substring(0, 16)}...</p>
                                    </div>
                                  ) : (
                                    <div className="mt-1">
                                      <p className="text-xs text-gray-500 italic">Not found ("{searchResourceName}")</p>
                                      <p className="text-[8px] text-gray-600 font-sans mt-0.5">Will be auto-created during sync.</p>
                                    </div>
                                  )}
                                </div>
                                {checkedFolderResult && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setFolderName(checkedFolderResult.name);
                                      addLog(`Applied matched Folder "${checkedFolderResult.name}" as backup target.`, "success");
                                    }}
                                    className="w-full py-1 bg-amber-500/10 hover:bg-amber-500/20 text-amber-500 border border-amber-500/20 text-[9px] font-bold uppercase tracking-widest rounded-sm transition-all"
                                  >
                                    Use Folder
                                  </button>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="mb-6">
                      <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">
                        Scan Volume (Latest Uploads)
                      </label>
                      <div className="flex flex-wrap gap-2">
                        {[10, 20, 50, 100, 250].map((num) => (
                          <button
                            key={num}
                            onClick={() => setScanLimit(num)}
                            disabled={isScanning}
                            className={`px-3 py-2 text-[10px] font-bold rounded-sm border uppercase tracking-widest transition-all cursor-pointer ${
                              scanLimit === num
                                ? "bg-amber-500 border-amber-500 text-black shadow-lg"
                                : "bg-[#0a0a0a] border-white/10 text-gray-400 hover:text-white hover:border-white/20"
                            } disabled:opacity-50`}
                          >
                            Last {num}
                          </button>
                        ))}
                      </div>
                      <p className="text-[10px] text-gray-500 mt-2 flex items-center font-sans">
                        <Info className="w-3.5 h-3.5 text-amber-500/80 mr-1.5 shrink-0" />
                        Photos will be analyzed live. The current AI model is optimized for industrial & residential circuitry.
                      </p>
                    </div>
                  </div>

                  {/* Actions Bar */}
                  <div className="pt-5 border-t border-white/10 flex items-center space-x-3">
                    {!isScanning ? (
                      <button
                        id="btn-start-scan"
                        onClick={handleStartScan}
                        className="flex-1 flex items-center justify-center space-x-2 bg-white hover:bg-amber-500 text-black font-bold py-3.5 px-4 rounded-sm shadow-md cursor-pointer transition-all uppercase tracking-wider text-xs"
                      >
                        <Play className="w-4 h-4 fill-black" />
                        <span>Initialize AI Sync</span>
                      </button>
                    ) : (
                      <button
                        id="btn-stop-scan"
                        onClick={handleStopScan}
                        className="flex-1 flex items-center justify-center space-x-2 bg-rose-950/40 text-rose-400 border border-rose-500/35 font-bold py-3.5 px-4 rounded-sm shadow-md cursor-pointer hover:bg-rose-900/60 hover:text-white transition-all uppercase tracking-wider text-xs animate-pulse"
                      >
                        <Square className="w-4 h-4 fill-current" />
                        <span>Terminate Active Scan</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* 2. Bento Stats Card */}
                <div className="bg-[#0d0d0d] rounded-sm border border-white/10 p-6 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-6">
                      <h3 className="font-serif text-white text-lg tracking-tight">Execution Metrics</h3>
                      {isScanning && (
                        <span className="flex h-2.5 w-2.5 relative">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500"></span>
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="p-4 bg-[#0a0a0a] border border-white/5 rounded-sm">
                        <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">
                          Scanned
                        </p>
                        <p className="text-3xl font-light text-white font-serif mt-1">
                          {stats.totalAnalyzed}
                          <span className="text-xs text-gray-500 font-sans font-medium ml-1">/ {stats.totalAvailable || "?"}</span>
                        </p>
                      </div>

                      <div className="p-4 bg-[#0a0a0a] border border-white/5 rounded-sm">
                        <p className="text-[10px] font-bold text-amber-500 uppercase tracking-widest">
                          Matches Found
                        </p>
                        <p className="text-3xl font-light text-amber-500 font-serif mt-1">
                          {stats.electricalFound}
                        </p>
                      </div>

                      <div className="p-4 bg-[#0a0a0a] border border-white/5 rounded-sm">
                        <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">
                          Drive Backups
                        </p>
                        <p className="text-3xl font-light text-white font-serif mt-1">
                          {stats.savedToDriveCount}
                        </p>
                      </div>

                      <div className="p-4 bg-[#0a0a0a] border border-white/5 rounded-sm">
                        <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">
                          Linked Albums
                        </p>
                        <p className="text-3xl font-light text-white font-serif mt-1">
                          {stats.savedToAlbumCount}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Progress Line */}
                  <div className="mt-6 pt-4 border-t border-white/5">
                    <div className="flex items-center justify-between text-[10px] uppercase tracking-widest text-gray-500 mb-2 font-bold">
                      <span>Total Sync Progress</span>
                      <span className="font-mono text-white">
                        {stats.totalAvailable
                          ? Math.round((stats.totalAnalyzed / stats.totalAvailable) * 100)
                          : 0}
                        %
                      </span>
                    </div>
                    <div className="w-full bg-white/5 rounded-full h-1 overflow-hidden">
                      <div
                        className="bg-amber-500 h-full rounded-full transition-all duration-300"
                        style={{
                          width: `${
                            stats.totalAvailable
                              ? (stats.totalAnalyzed / stats.totalAvailable) * 100
                              : 0
                          }%`,
                        }}
                      ></div>
                    </div>
                  </div>
                </div>
              </div>
 
              {/* PRIORITIZED AI SCENARIOS SECTION */}
              <div className="bg-[#0d0d0d] rounded-sm border border-white/10 p-6 space-y-6">
                <div>
                  <h3 className="font-serif text-white text-lg tracking-tight flex items-center space-x-2">
                    <Sparkles className="w-4 h-4 text-amber-500 animate-pulse" />
                    <span>Prioritized AI Scanning Scenarios</span>
                  </h3>
                  <p className="text-xs text-gray-400 mt-1.5 font-sans">
                    The Gemini AI vision engine parses images with dedicated electrical engineering logic, prioritizing the following components, setups, and craftsmanship patterns.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {/* Category 1 */}
                  <div className="bg-[#0a0a0a] p-4 rounded-sm border border-white/5 space-y-2">
                    <div className="flex items-center space-x-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                      <h4 className="text-[10px] font-bold text-white uppercase tracking-wider">Breakers & Panels</h4>
                    </div>
                    <p className="text-[11px] text-gray-400 leading-relaxed font-sans">
                      Main breaker panels, subpanels, load centers, busbars, dual-pole, and AFCI/GFCI breakers (e.g. Siemens, Square D, Eaton, GE, Cutler-Hammer).
                    </p>
                  </div>

                  {/* Category 2 */}
                  <div className="bg-[#0a0a0a] p-4 rounded-sm border border-white/5 space-y-2">
                    <div className="flex items-center space-x-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                      <h4 className="text-[10px] font-bold text-white uppercase tracking-wider">Rough-In Wiring</h4>
                    </div>
                    <p className="text-[11px] text-gray-400 leading-relaxed font-sans">
                      Non-metallic sheathed cables (Romex NM-B), metal-clad (MC) cables, wire colors (black, white, red, green, bare copper), wire nuts, splice joints, and cable stapling.
                    </p>
                  </div>

                  {/* Category 3 */}
                  <div className="bg-[#0a0a0a] p-4 rounded-sm border border-white/5 space-y-2">
                    <div className="flex items-center space-x-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                      <h4 className="text-[10px] font-bold text-white uppercase tracking-wider">Conduits & Raceways</h4>
                    </div>
                    <p className="text-[11px] text-gray-400 leading-relaxed font-sans">
                      Electrical Metallic Tubing (EMT), Rigid PVC, liquid-tight conduits, conduit bends (90s, offsets, saddles), hangers, straps, and weatherheads.
                    </p>
                  </div>

                  {/* Category 4 */}
                  <div className="bg-[#0a0a0a] p-4 rounded-sm border border-white/5 space-y-2">
                    <div className="flex items-center space-x-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                      <h4 className="text-[10px] font-bold text-white uppercase tracking-wider">Devices & Outlets</h4>
                    </div>
                    <p className="text-[11px] text-gray-400 leading-relaxed font-sans">
                      GFCI/AFCI receptacles, standard duplex outlets, high-power 240V plugs, single-pole/three-way dimmer switches, junction boxes, and faceplates.
                    </p>
                  </div>

                  {/* Category 5 */}
                  <div className="bg-[#0a0a0a] p-4 rounded-sm border border-white/5 space-y-2">
                    <div className="flex items-center space-x-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                      <h4 className="text-[10px] font-bold text-white uppercase tracking-wider">Fixtures & Lighting</h4>
                    </div>
                    <p className="text-[11px] text-gray-400 leading-relaxed font-sans">
                      Recessed lights (LED wafers, cans), ceiling fans, ballast-driven fixtures, floodlights, emergency exit packs, and control switches.
                    </p>
                  </div>

                  {/* Category 6 */}
                  <div className="bg-[#0a0a0a] p-4 rounded-sm border border-white/5 space-y-2">
                    <div className="flex items-center space-x-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                      <h4 className="text-[10px] font-bold text-white uppercase tracking-wider">Specialized & Heavy Power</h4>
                    </div>
                    <p className="text-[11px] text-gray-400 leading-relaxed font-sans">
                      Solar PV inverters (Enphase, SolarEdge), EV chargers (Tesla Wall Connector), backup generators (Generac), VFDs, and disconnect switches.
                    </p>
                  </div>
                </div>

                <div className="pt-4 border-t border-white/5 grid grid-cols-1 md:grid-cols-2 gap-6 text-xs text-gray-400">
                  <div className="space-y-1.5">
                    <h5 className="font-serif italic text-white text-xs">Craftsmanship & Safety Inspection</h5>
                    <p className="text-[11px] leading-relaxed font-sans">
                      AI automatically rates work neatness into tags: <span className="text-green-400 font-medium">Professional & Clean</span> (neat cable dressing, parallel runs) or <span className="text-rose-400 font-medium">Needs Attention / Safety Concern</span> (exposed live wire, messy terminations, open splices).
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    <h5 className="font-serif italic text-white text-xs">Search Optimization Renaming</h5>
                    <p className="text-[11px] leading-relaxed font-sans">
                      Extracted identifiers are packed into standardized, lowercase, underscored filenames, which makes search queries inside Google Drive and Google Photos lightning-fast.
                    </p>
                  </div>
                </div>
              </div>

              {/* DYNAMIC MIDDLE SECTION: Live Scanner & System Logs */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* 1. Live Scanner View */}
                <div className="lg:col-span-2 bg-[#0d0d0d] rounded-sm border border-white/10 overflow-hidden flex flex-col">
                  <div className="px-6 py-4 border-b border-white/10 bg-[#111111] flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <Search className="w-4 h-4 text-amber-500" />
                      <h4 className="font-serif text-white text-sm tracking-tight">AI Analysis Pipeline</h4>
                    </div>
                    {isScanning && (
                      <span className="text-[10px] font-bold text-amber-500 uppercase tracking-widest flex items-center">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse mr-2"></span>
                        Active Scanner Stream
                      </span>
                    )}
                  </div>

                  <div className="p-6 flex-1 flex flex-col justify-center min-h-[300px] bg-[#0d0d0d]">
                    {currentScanningPhoto ? (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
                        {/* Left Side: Glowing Image */}
                        <div className="relative rounded-sm overflow-hidden border border-white/10 bg-[#0a0a0a] aspect-video flex items-center justify-center">
                          <img
                            src={currentScanningPhoto.baseUrl}
                            alt="Current scanning target"
                            className="max-h-[180px] object-contain p-2"
                          />
                          {/* Scanning Overlay Line */}
                          <div className="absolute inset-x-0 top-0 h-0.5 bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.8)] animate-[bounce_2.5s_infinite]"></div>
                        </div>

                        {/* Right Side: Analysis Status */}
                        <div className="space-y-4">
                          <div>
                            <span className="px-2.5 py-1 text-[9px] font-bold uppercase tracking-widest rounded-sm bg-amber-500/10 text-amber-500 border border-amber-500/20">
                              Analyzing...
                            </span>
                            <h5 className="font-serif text-white text-base mt-3 truncate tracking-tight">
                              {currentScanningPhoto.filename}
                            </h5>
                            <p className="text-[10px] text-gray-500 flex items-center mt-1 font-mono uppercase tracking-wider">
                              <Clock className="w-3.5 h-3.5 mr-1.5 text-gray-500" />
                              Created: {currentScanningPhoto.creationTime}
                            </p>
                          </div>

                          <div className="p-4 bg-[#0a0a0a] rounded-sm border border-white/5">
                            <p className="text-[10px] font-bold text-amber-500 uppercase tracking-widest mb-1.5 flex items-center">
                              <Sparkles className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                              Gemini Vision Stream
                            </p>
                            <p className="text-xs text-gray-400 leading-relaxed italic font-serif">
                              Evaluating structural layouts, electrical fixtures, distribution panels, and wiring conduits...
                            </p>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="text-center py-12 max-w-sm mx-auto">
                        <div className="w-12 h-12 rounded-sm bg-[#0a0a0a] border border-white/10 text-gray-600 flex items-center justify-center mx-auto mb-4">
                          <Image className="w-5 h-5 text-amber-500/60" />
                        </div>
                        <h5 className="font-serif text-white text-sm tracking-tight">Scanner Idle</h5>
                        <p className="text-xs text-gray-500 mt-2.5 leading-relaxed font-sans">
                          No processing job is currently running. Select a scan quantity above and click **Initialize AI Sync** to scan your library.
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* 2. System Sync Log (Terminal style) */}
                <div className="bg-[#0d0d0d] rounded-sm border border-white/10 shadow-lg text-gray-200 overflow-hidden flex flex-col h-[380px]">
                  <div className="px-5 py-4 border-b border-white/10 bg-[#111111] flex items-center justify-between">
                    <span className="text-xs font-serif font-bold text-gray-300 tracking-wider">System Logs</span>
                    <span className="text-[9px] font-mono font-bold px-2.5 py-0.5 rounded-sm bg-amber-500/10 text-amber-500 border border-amber-500/20 uppercase tracking-widest">
                      ACTIVE
                    </span>
                  </div>

                  <div className="p-4 flex-1 overflow-y-auto font-mono text-[10px] bg-[#0a0a0a]/40 leading-relaxed space-y-2.5 select-all">
                    {logs.length === 0 ? (
                      <div className="text-gray-600 italic py-4">Processor ready. Awaiting trigger signal...</div>
                    ) : (
                      logs.map((log) => (
                        <div key={log.id} className="flex items-start space-x-2">
                          <span className="text-gray-600 shrink-0 select-none">[{log.timestamp}]</span>
                          <span
                            className={
                              log.type === "success"
                                ? "text-green-400 font-medium"
                                : log.type === "error"
                                ? "text-rose-400 font-semibold"
                                : log.type === "warning"
                                ? "text-amber-400 font-medium"
                                : "text-gray-300"
                            }
                          >
                            {log.message}
                          </span>
                        </div>
                      ))
                    )}
                    <div ref={logEndRef} />
                  </div>
                </div>
              </div>

              {/* BOTTOM SECTION: Gallery of Scanned & Identified Files */}
              <div className="space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <h3 className="font-serif text-white text-xl tracking-tight">Scanned Media Records</h3>
                    <p className="text-xs text-gray-500">
                      View and examine all photographic matches analyzed in the current scan block.
                    </p>
                  </div>

                  {/* Tabs */}
                  <div className="flex bg-[#0d0d0d] p-1 rounded-sm border border-white/10 self-start">
                    {[
                      { id: "all", label: "All Items" },
                      { id: "electrical", label: "Matches" },
                      { id: "skipped", label: "Skipped" },
                    ].map((tab) => (
                      <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id as any)}
                        className={`px-3.5 py-1.5 text-[9px] uppercase tracking-widest font-bold rounded-sm transition-all cursor-pointer ${
                          activeTab === tab.id
                            ? "bg-white text-black shadow-lg"
                            : "text-gray-400 hover:text-white"
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>
                </div>

                {filteredPhotos.length === 0 ? (
                  <div className="bg-[#0d0d0d] border border-white/10 rounded-sm p-12 text-center">
                    <p className="text-gray-500 text-sm">
                      {scannedPhotos.length === 0
                        ? "No photos processed yet. Launch a sync operation above to build your archive."
                        : "No photographs matched the active filters."}
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {filteredPhotos.map((photo) => (
                      <motion.div
                        key={photo.id}
                        layout
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className={`bg-[#0d0d0d] rounded-sm border border-white/10 overflow-hidden shadow-lg hover:border-amber-500/40 transition-all duration-300 flex flex-col justify-between ${
                          photo.isElectrical ? "ring-1 ring-amber-500/10" : ""
                        }`}
                      >
                        {/* Thumbnail Header */}
                        <div className="relative aspect-video bg-[#0a0a0a] flex items-center justify-center overflow-hidden border-b border-white/5">
                          <img
                            src={photo.baseUrl}
                            alt="Gallery item"
                            className="w-full h-full object-cover"
                          />
                          <div className="absolute top-3 right-3 flex flex-col gap-1.5">
                            {photo.isElectrical ? (
                              <span className="bg-amber-500 text-black text-[9px] font-bold px-2 py-0.5 rounded-sm shadow-md flex items-center space-x-1 uppercase tracking-wider">
                                <Sparkles className="w-3 h-3" />
                                <span>Electrical</span>
                              </span>
                            ) : (
                              <span className="bg-[#0a0a0a]/80 backdrop-blur-md text-gray-400 text-[9px] font-bold px-2 py-0.5 rounded-sm border border-white/10 uppercase tracking-wider">
                                Skipped
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Content Body */}
                        <div className="p-5 flex-1 flex flex-col justify-between">
                          <div className="space-y-4">
                            <div>
                              <p className="text-[9px] text-gray-500 font-bold uppercase tracking-widest">
                                Original Filename
                              </p>
                              <p className="text-xs text-gray-300 font-medium truncate mt-0.5">
                                {photo.filename}
                              </p>
                            </div>

                            {photo.isElectrical && (
                              <>
                                <div className="flex flex-wrap gap-1.5 pt-1">
                                  {photo.electricalType && (
                                    <span className="bg-amber-500/10 text-amber-500 border border-amber-500/20 text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-sm">
                                      {photo.electricalType}
                                    </span>
                                  )}
                                  {photo.craftsmanshipRating && (
                                    <span className={`text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-sm border ${
                                      photo.craftsmanshipRating === "Professional & Clean"
                                        ? "bg-green-500/10 text-green-400 border-green-500/20"
                                        : photo.craftsmanshipRating === "Needs Attention / Safety Concern"
                                        ? "bg-rose-500/10 text-rose-400 border-rose-500/20"
                                        : "bg-blue-500/10 text-blue-400 border-blue-500/20"
                                    }`}>
                                      {photo.craftsmanshipRating}
                                    </span>
                                  )}
                                </div>

                                {photo.componentsDetected && photo.componentsDetected.length > 0 && (
                                  <div>
                                    <p className="text-[9px] text-gray-500 font-bold uppercase tracking-widest">
                                      Components Detected
                                    </p>
                                    <div className="flex flex-wrap gap-1 mt-1">
                                      {photo.componentsDetected.map((comp, idx) => (
                                        <span key={idx} className="bg-white/5 text-gray-300 text-[9px] font-mono px-1.5 py-0.5 rounded-sm border border-white/5">
                                          {comp}
                                        </span>
                                      ))}
                                    </div>
                                  </div>
                                )}

                                <div>
                                  <div className="flex items-center justify-between">
                                    <p className="text-[9px] text-amber-500 font-bold uppercase tracking-widest">
                                      AI Identifiable Filename
                                    </p>
                                    <button
                                      onClick={() => handleCopy(photo.descriptiveName || "")}
                                      className="p-1 hover:bg-white/5 rounded-sm text-gray-400 hover:text-white transition-colors"
                                      title="Copy Filename"
                                    >
                                      {copiedText === photo.descriptiveName ? (
                                        <Check className="w-3 h-3 text-green-400" />
                                      ) : (
                                        <Copy className="w-3 h-3" />
                                      )}
                                    </button>
                                  </div>
                                  <p className="text-xs text-amber-500 font-mono font-semibold bg-[#0a0a0a] p-2.5 rounded-sm border border-white/5 break-all select-all mt-1">
                                    {photo.descriptiveName}
                                  </p>
                                </div>

                                <div>
                                  <p className="text-[9px] text-gray-500 font-bold uppercase tracking-widest">
                                    AI Summary & Analysis
                                  </p>
                                  <p className="text-xs text-gray-400 leading-relaxed mt-1 font-sans">
                                    {photo.description}
                                  </p>
                                </div>
                              </>
                            )}

                            {photo.error && (
                              <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-sm text-rose-400 text-[10px] flex items-start space-x-2 font-mono">
                                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                                <span>{photo.error}</span>
                              </div>
                            )}
                          </div>

                          {/* Synced Badges & Web Link */}
                          {photo.isElectrical && (
                            <div className="mt-5 pt-4 border-t border-white/5 flex items-center justify-between text-xs text-gray-400">
                              <div className="flex space-x-2">
                                <span
                                  className={`flex items-center space-x-1 text-[9px] uppercase tracking-widest font-bold py-0.5 px-2 rounded-sm border ${
                                    photo.savedToDrive
                                      ? "bg-green-500/10 text-green-400 border-green-500/20"
                                      : "bg-white/5 text-gray-500 border-white/10"
                                  }`}
                                >
                                  <FolderCheck className="w-3 h-3" />
                                  <span>Drive</span>
                                </span>
                                <span
                                  className={`flex items-center space-x-1 text-[9px] uppercase tracking-widest font-bold py-0.5 px-2 rounded-sm border ${
                                    photo.savedToAlbum
                                      ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
                                      : "bg-white/5 text-gray-500 border-white/10"
                                  }`}
                                >
                                  <Layers className="w-3 h-3" />
                                  <span>Album</span>
                                </span>
                              </div>

                              {photo.driveLink && (
                                <a
                                  href={photo.driveLink}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-amber-500 hover:text-amber-400 font-serif italic text-xs font-semibold flex items-center space-x-1"
                                >
                                  <span>View Drive</span>
                                  <ExternalLink className="w-3 h-3" />
                                </a>
                              )}
                            </div>
                          )}
                        </div>
                      </motion.div>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
