import { PanDavClient } from "@services/pan-dav-api.js";
import fs from "fs";
import { pipeline } from "stream/promises";
import { PauseSignal } from "@utils/pause-signal.js";
import { PausableDownloadStream, ProgressRateStream, ProgressCallback } from "@utils/stream-utils.js";

export async function downloadFile(url: string, dest: string, onProgress?: ProgressCallback, abortSignal?: AbortSignal, pauseSignal?: PauseSignal) {
    // Create a pausable stream that supports resume with Range requests
    const downloadStream = new PausableDownloadStream(url, pauseSignal, abortSignal);

    // Create a progress rate stream for tracking transfer progress
    const progressRateStream = new ProgressRateStream(onProgress);

    // Create file writer stream
    const writer = fs.createWriteStream(dest, {
        highWaterMark: 1024 * 1024, // 1MB buffer size
    });

    // Handle abort signal
    abortSignal?.addEventListener('abort', () => {
        // Reset progress using the stream's method
        progressRateStream.resetProgress();
        downloadStream.destroy();
        progressRateStream.destroy();
        writer.destroy();
    });

    try {
        // Use pipeline for better error handling and cleanup
        await pipeline(downloadStream, progressRateStream, writer);
    } catch (error) {
        // Clean up the partially downloaded file on error
        try {
            if (fs.existsSync(dest)) {
                fs.unlinkSync(dest);
            }
        } catch (cleanupError) {
            console.warn(`[WARN] Failed to clean up partial file ${dest}:`, cleanupError);
        }
        throw error;
    }
}

export async function downloadToWebDav(url: string, dest: string, client: PanDavClient, onProgress?: ProgressCallback, abortSignal?: AbortSignal, pauseSignal?: PauseSignal) {
    // Create a pausable stream that supports resume with Range requests
    const downloadStream = new PausableDownloadStream(url, pauseSignal, abortSignal);

    // Create a progress rate stream for tracking transfer progress
    const progressRateStream = new ProgressRateStream(onProgress);
    
    // Connect the streams
    const uploadStream = downloadStream.pipe(progressRateStream);

    // when failed
    abortSignal?.addEventListener('abort', () => {
        // Reset progress using the stream's method
        progressRateStream.resetProgress();
        downloadStream.destroy();
        progressRateStream.destroy();
        uploadStream.destroy();
    });

    // Create a promise-based approach for partial file updates
    return client.putFileContents(dest, uploadStream);
}