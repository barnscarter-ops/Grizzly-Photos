// Local file representation from Google Photos sync folder
export interface LocalFile {
  path: string;
  filename: string;
  size: number;
  created: string;
  mimeType: string;
}

// Result of Gemini classification
export interface AnalysisResult {
  isElectrical: boolean;
  descriptiveName: string;
  description: string;
  electricalType: string;
  componentsDetected: string[];
  craftsmanshipRating: string;
}

// Scanned result for a local file
export interface ScanResult {
  id: string;
  filePath: string;
  fileName: string;
  fileSize: number;
  analysisResult: AnalysisResult;
  savedToDrive: boolean;
  driveFileId?: string;
  driveLink?: string;
  timestamp: string;
}

// Scan configuration
export interface ScanConfig {
  albumName: string;
  folderName: string;
  lastScan: string | null;
  syncFolderPath: string;
}

// Scan statistics
export interface ScanStats {
  totalScanned: number;
  electricalFound: number;
  savedToDriveCount: number;
  totalAvailable: number;
}

export interface ScanLog {
  id: string;
  timestamp: string;
  message: string;
  type: "info" | "success" | "warning" | "error";
}
