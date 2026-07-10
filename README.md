# Grizzly Photos — Electrical Media Scanner

Automatically scan photos for electrical work using AI, organize matches, and backup to Google Drive.

## Overview

Grizzly Photos replaces the deprecated Google Photos Library API with a local-first architecture:

1. **File Selection** — Pick photos from your local machine or the Google Photos sync folder
2. **AI Classification** — Gemini 2.5 Flash analyzes each photo for electrical work
3. **Drive Upload** — Matches are uploaded to your Google Drive with AI-generated filenames

## Setup

### 1. Install Google Photos Desktop App (Optional)

If you want real-time file watching:

1. Visit https://photos.google.com/photosdownloadsetup
2. Download and install the Google Photos Desktop App
3. Configure it to sync to `%USERPROFILE%\Google Photos`

### 2. Configure Environment

Create a `.env` file in the project root:

```env
GEMINI_API_KEY=your_gemini_api_key_here
```

### 3. Install Dependencies

```bash
npm install
```

## Running

### Development

```bash
npm run dev
```

Server runs on http://localhost:3000

### Production Build

```bash
npm run build
npm start
```

## How It Works

1. **Authorize** — Click "Authorize with Google" to grant Drive upload permissions
2. **Select Files** — Browse and select photos to scan
3. **Start Scan** — Files are sent to the Gemini 2.5 Flash model for analysis
4. **View Results** — Electrical matches are highlighted; non-matches are skipped
5. **Upload to Drive** — Matches are uploaded with descriptive filenames

## API Endpoints

| Method | Endpoint          | Description                  |
|--------|-------------------|------------------------------|
| GET    | `/api/config`     | Get scan configuration       |
| PUT    | `/api/config`     | Update scan configuration    |
| GET    | `/api/results`    | Get scan results             |
| GET    | `/api/logs`       | Get scan logs                |
| POST   | `/api/results/clear` | Clear all results         |
| POST   | `/api/scan-local` | Analyze files with Gemini    |
| POST   | `/api/upload-to-drive` | Upload file to Drive    |

## Architecture

- **Frontend:** React 19 + Vite 6 + Tailwind CSS 4
- **Backend:** Express + Node.js
- **AI:** Gemini 2.5 Flash (image classification)
- **Cloud:** Google Drive API v3
- **File Watching:** chokidar (optional, for real-time sync)

## Prerequisites

- Node.js 18+
- Google API key with Gemini access
- Google account with Drive access
