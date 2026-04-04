import { useState, useCallback } from 'react';
import * as ExpoFileSystem from 'expo-file-system/legacy';

/**
 * Drop-in replacement for @epubjs-react-native/expo-file-system's useFileSystem.
 * That package imports writeAsStringAsync from 'expo-file-system' directly.
 * In Expo SDK 54 those functions moved to 'expo-file-system/legacy', so the
 * published adapter crashes with "failed to write jszip js file" at runtime.
 */
export function useFileSystem() {
  const [file, setFile] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [downloading, setDownloading] = useState(false);
  const [size, setSize] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const downloadFile = useCallback((fromUrl: string, toFile: string) => {
    const callback = (dp: ExpoFileSystem.DownloadProgressData) => {
      setProgress(
        Math.round((dp.totalBytesWritten / dp.totalBytesExpectedToWrite) * 100)
      );
    };

    const resumable = ExpoFileSystem.createDownloadResumable(
      fromUrl,
      (ExpoFileSystem.documentDirectory ?? '') + toFile,
      { cache: true },
      callback
    );

    setDownloading(true);
    return resumable
      .downloadAsync()
      .then((value) => {
        if (!value) throw new Error('Download failed');
        if (value.headers['Content-Length']) {
          setSize(Number(value.headers['Content-Length']));
        }
        setSuccess(true);
        setError(null);
        setFile(value.uri);
        return { uri: value.uri, mimeType: value.mimeType ?? null };
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Error downloading file');
        return { uri: null, mimeType: null };
      })
      .finally(() => setDownloading(false));
  }, []);

  const getFileInfo = useCallback(async (fileUri: string) => {
    const info = await ExpoFileSystem.getInfoAsync(fileUri);
    return {
      uri: info.uri,
      exists: info.exists,
      isDirectory: info.isDirectory,
      size: (info as { size?: number }).size,
    };
  }, []);

  return {
    file,
    progress,
    downloading,
    size,
    error,
    success,
    documentDirectory: ExpoFileSystem.documentDirectory,
    cacheDirectory: ExpoFileSystem.cacheDirectory,
    bundleDirectory: undefined as string | undefined,
    readAsStringAsync: ExpoFileSystem.readAsStringAsync as (
      fileUri: string,
      options?: { encoding?: 'utf8' | 'base64' }
    ) => Promise<string>,
    writeAsStringAsync: ExpoFileSystem.writeAsStringAsync as (
      fileUri: string,
      contents: string,
      options?: { encoding?: 'utf8' | 'base64' }
    ) => Promise<void>,
    deleteAsync: ExpoFileSystem.deleteAsync as (fileUri: string) => Promise<void>,
    downloadFile,
    getFileInfo,
  };
}
