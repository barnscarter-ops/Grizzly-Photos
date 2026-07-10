import { execSync } from "child_process";
import * as path from "path";

export function isGooglePhotosInstalled(): boolean {
  try {
    // Check for Google Photos Desktop App in common Windows install locations
    const locations = [
      "%LOCALAPPDATA%\\Google\\Photos",
      "%PROGRAMFILES%\\Google\\Photos",
    ];

    for (const loc of locations) {
      try {
        const result = execSync(`powershell -Command "Test-Path '${loc}'"`, {
          encoding: "utf-8",
        });
        if (result.trim() === "True") {
          return true;
        }
      } catch {
        continue;
      }
    }
    return false;
  } catch {
    return false;
  }
}

export function getSyncFolderPath(): string {
  return path.join(process.env.USERPROFILE || "", "Google Photos");
}

export async function installGooglePhotosApp(): Promise<boolean> {
  try {
    // Download and silently install Google Photos Desktop App
    const installerPath = path.join(
      process.env.LOCALAPPDATA || "",
      "GooglePhotos_installer.exe"
    );

    // Download installer from official source
    execSync(
      `powershell -Command "Invoke-WebRequest -Uri 'https://photos.googleapis.com/photosdownloadsetup.exe' -OutFile '${installerPath}' -SilentButtons"`,
      { stdio: "pipe" }
    );

    // Install silently
    execSync(`"${installerPath}" /S`, { stdio: "pipe" });

    // Clean up installer
    try {
      const { execSync } = require("child_process");
      execSync(`del "${installerPath}"`, { stdio: "pipe" });
    } catch {
      // Cleanup not critical
    }

    return true;
  } catch {
    console.log(
      "Could not auto-install Google Photos Desktop App. Please install manually:"
    );
    console.log("1. Visit https://photos.google.com/photosdownloadsetup");
    console.log("2. Download and run the installer");
    console.log("3. Set sync folder to: %USERPROFILE%\\Google Photos");
    return false;
  }
}
