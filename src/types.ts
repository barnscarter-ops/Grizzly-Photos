export interface GoogleMediaItem {
  id: string;
  description?: string;
  productUrl: string;
  baseUrl: string;
  mimeType: string;
  filename: string;
  mediaMetadata: {
    creationTime: string;
    width: string;
    height: string;
    photo?: {
      cameraMake?: string;
      cameraModel?: string;
      focalLength?: number;
      apertureFNumber?: number;
      isoEquivalent?: number;
      exposureTime?: string;
    };
  };
}

export interface ScannedPhoto {
  id: string;
  filename: string;
  baseUrl: string;
  creationTime: string;
  isAnalyzed: boolean;
  isElectrical?: boolean;
  descriptiveName?: string;
  description?: string;
  electricalType?: string;
  componentsDetected?: string[];
  craftsmanshipRating?: string;
  savedToDrive?: boolean;
  savedToAlbum?: boolean;
  driveFileId?: string;
  driveLink?: string;
  error?: string;
}

export interface ScanStats {
  totalAnalyzed: number;
  electricalFound: number;
  savedToDriveCount: number;
  savedToAlbumCount: number;
  totalAvailable: number;
}

export interface ScanLog {
  id: string;
  timestamp: string;
  message: string;
  type: "info" | "success" | "warning" | "error";
}
