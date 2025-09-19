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
    const abortHandler = () => {
        // Reset progress using the stream's method
        progressRateStream.resetProgress();
        downloadStream.destroy();
        progressRateStream.destroy();
        writer.destroy();
    };

    abortSignal?.addEventListener('abort', abortHandler);

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
    } finally {
        // Always remove the abort listener to prevent memory leaks
        abortSignal?.removeEventListener('abort', abortHandler);
    }
}

export async function downloadToWebDav(url: string, dest: string, client: PanDavClient, onProgress?: ProgressCallback, abortSignal?: AbortSignal, pauseSignal?: PauseSignal) {
    // Create a pausable stream that supports resume with Range requests
    const downloadStream = new PausableDownloadStream(url, pauseSignal, abortSignal);

    // Create a progress rate stream for tracking transfer progress
    const progressRateStream = new ProgressRateStream(onProgress);
    
    // Connect the streams and handle errors properly
    const uploadStream = downloadStream.pipe(progressRateStream);
    
    // Forward downloadStream errors to uploadStream to ensure they're caught
    downloadStream.on('error', (error) => {
        uploadStream.destroy(error);
    });

    // when failed
    const abortHandler = () => {
        // Reset progress using the stream's method
        progressRateStream.resetProgress();
        downloadStream.destroy();
        progressRateStream.destroy();
        uploadStream.destroy();
    };
    
    abortSignal?.addEventListener('abort', abortHandler);

    try {
        // Upload downloaded file contents
        return await client.putFileContents(dest, uploadStream);
    } catch (error) {
        // Clean up streams on error
        downloadStream.destroy();
        progressRateStream.destroy();
        uploadStream.destroy();
        throw error;
    } finally {
        // Always remove the abort listener to prevent memory leaks
        abortSignal?.removeEventListener('abort', abortHandler);
    }
}