import { GoogleMediaItem } from "./types";

/**
 * Fetch a list of media items from Google Photos.
 */
export async function listMediaItems(
  accessToken: string,
  pageSize: number = 50,
  pageToken?: string
): Promise<{ mediaItems: GoogleMediaItem[]; nextPageToken?: string }> {
  let url = `https://photoslibrary.googleapis.com/v1/mediaItems?pageSize=${pageSize}`;
  if (pageToken) {
    url += `&pageToken=${pageToken}`;
  }

  const response = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(
      errData.error?.message || `Failed to list photos: ${response.statusText}`
    );
  }

  return response.json();
}

/**
 * Search/find a Google Photos album by name, or create it if not found.
 */
export async function findOrCreateAlbum(
  accessToken: string,
  title: string
): Promise<string> {
  // 1. Search for existing album
  const listUrl = "https://photoslibrary.googleapis.com/v1/albums?pageSize=50";
  const listRes = await fetch(listUrl, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
  });

  if (listRes.ok) {
    const listData = await listRes.json();
    const existing = listData.albums?.find(
      (a: any) => a.title.toLowerCase() === title.toLowerCase()
    );
    if (existing) {
      return existing.id;
    }
  }

  // 2. Create the album if not found
  const createUrl = "https://photoslibrary.googleapis.com/v1/albums";
  const createRes = await fetch(createUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      album: { title },
    }),
  });

  if (!createRes.ok) {
    const errData = await createRes.json().catch(() => ({}));
    throw new Error(
      errData.error?.message || `Failed to create album: ${createRes.statusText}`
    );
  }

  const album = await createRes.json();
  return album.id;
}

/**
 * Add a media item to a Google Photos album.
 */
export async function addMediaItemToAlbum(
  accessToken: string,
  albumId: string,
  mediaItemId: string
): Promise<void> {
  const url = `https://photoslibrary.googleapis.com/v1/albums/${albumId}:batchAddMediaItems`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      mediaItemIds: [mediaItemId],
    }),
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(
      errData.error?.message || `Failed to add photo to album: ${response.statusText}`
    );
  }
}

/**
 * Find a Google Drive folder by name or create it if it doesn't exist.
 */
export async function findOrCreateFolder(
  accessToken: string,
  folderName: string
): Promise<string> {
  // 1. Search for folder
  const query = encodeURIComponent(
    `name = '${folderName}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`
  );
  const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name)`;
  const searchRes = await fetch(searchUrl, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (searchRes.ok) {
    const searchData = await searchRes.json();
    if (searchData.files && searchData.files.length > 0) {
      return searchData.files[0].id;
    }
  }

  // 2. Create folder if not found
  const createUrl = "https://www.googleapis.com/drive/v3/files";
  const createRes = await fetch(createUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: folderName,
      mimeType: "application/vnd.google-apps.folder",
    }),
  });

  if (!createRes.ok) {
    const errData = await createRes.json().catch(() => ({}));
    throw new Error(
      errData.error?.message || `Failed to create Drive folder: ${createRes.statusText}`
    );
  }

  const folder = await createRes.json();
  return folder.id;
}

/**
 * Download a photo blob from Google Photos.
 */
export async function fetchPhotoBlob(
  baseUrl: string,
  width: number = 2048
): Promise<Blob> {
  // Append sizing parameter to download higher resolution image
  const cleanedUrl = baseUrl.split("=")[0];
  const downloadUrl = `${cleanedUrl}=w${width}`;

  const response = await fetch(downloadUrl);
  if (!response.ok) {
    throw new Error(`Failed to download photo image: ${response.statusText}`);
  }
  return response.blob();
}

/**
 * Upload a file blob to Google Drive in a specific folder.
 */
export async function uploadFileToDrive(
  accessToken: string,
  blob: Blob,
  filename: string,
  folderId?: string
): Promise<{ id: string; name: string; webViewLink?: string }> {
  const metadata = {
    name: filename,
    parents: folderId ? [folderId] : [],
  };

  const formData = new FormData();
  formData.append(
    "metadata",
    new Blob([JSON.stringify(metadata)], { type: "application/json" })
  );
  formData.append("file", blob);

  const uploadRes = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      body: formData,
    }
  );

  if (!uploadRes.ok) {
    const errData = await uploadRes.json().catch(() => ({}));
    throw new Error(
      errData.error?.message || `Failed to upload to Drive: ${uploadRes.statusText}`
    );
  }

  return uploadRes.json();
}

/**
 * Check if a Google Photos album exists by name (case-insensitive).
 */
export async function checkAlbumExists(
  accessToken: string,
  albumName: string
): Promise<{ id: string; title: string; productUrl?: string } | null> {
  const listUrl = "https://photoslibrary.googleapis.com/v1/albums?pageSize=50";
  const listRes = await fetch(listUrl, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
  });

  if (!listRes.ok) {
    const errData = await listRes.json().catch(() => ({}));
    throw new Error(
      errData.error?.message || `Failed to list albums: ${listRes.statusText}`
    );
  }

  const listData = await listRes.json();
  const existing = listData.albums?.find(
    (a: any) => a.title.toLowerCase() === albumName.toLowerCase()
  );
  return existing || null;
}

/**
 * Check if a Google Drive folder exists by name (case-insensitive).
 */
export async function checkFolderExists(
  accessToken: string,
  folderName: string
): Promise<{ id: string; name: string; webViewLink?: string } | null> {
  const query = encodeURIComponent(
    `name = '${folderName}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`
  );
  const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name,webViewLink)`;
  const searchRes = await fetch(searchUrl, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!searchRes.ok) {
    const errData = await searchRes.json().catch(() => ({}));
    throw new Error(
      errData.error?.message || `Failed to check Drive folder: ${searchRes.statusText}`
    );
  }

  const searchData = await searchRes.json();
  if (searchData.files && searchData.files.length > 0) {
    return searchData.files[0];
  }
  return null;
}

