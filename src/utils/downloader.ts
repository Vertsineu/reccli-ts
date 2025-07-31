import { PanDavClient } from "@services/pan-dav-api.js";
import axios from "axios";
import fs from "fs";
import { Readable, Stream, Transform } from "stream";
import { PauseSignal } from "@utils/pause-signal.js";
import { PausableDownloadStream } from "@utils/stream-utils.js";

export type ProgressCallback = (transferred: number, rate: number) => void;

export async function downloadFile(url: string, dest: string) {
    const response = await axios<Stream>({
        method: 'GET',
        url: url,
        responseType: 'stream', // set response type as 'stream'
    });

    const writer = fs.createWriteStream(dest, {
        highWaterMark: 1024 * 1024, // 1MB buffer size
    });

    return new Promise<void>((resolve, reject) => {
        response.data.pipe(writer);

        writer.on('finish', resolve);
        writer.on('error', reject);
    })
}

export async function downloadToWebDav(url: string, dest: string, client: PanDavClient, onProgress?: ProgressCallback, abortSignal?: AbortSignal, pauseSignal?: PauseSignal) {
    // Check if already cancelled
    if (abortSignal?.aborted) {
        throw new Error('Download was cancelled');
    }

    // Create a pausable stream that supports resume with Range requests
    const stream = new PausableDownloadStream(url, pauseSignal, abortSignal);

    // Always calculate progress, regardless of whether onProgress callback exists
    let transferred = 0;
    let lastTransferred = 0;
    const recentRates: number[] = [];

    // Combined transform stream for both flow control and progress tracking
    const streamControlTransform = new Transform({
        transform(chunk, encoding, callback) {
            // check if cancelled
            if (abortSignal?.aborted) {
                callback(new Error('Download was cancelled'));
                return;
            }

            // Update the transferred bytes counter
            transferred += chunk.length;
            
            // Pass the chunk through
            callback(null, chunk);
        }
    });

    const progressStream = stream.pipe(streamControlTransform);

    // Set up interval for rate calculation and pause/resume handling - every 200ms
    const progressInterval = setInterval(() => {
        const bytesDiff = transferred - lastTransferred;
        // Calculate bytes per second
        const currentRate = bytesDiff * 5; // 200ms * 5 = 1 second

        if (bytesDiff > 0) {
            recentRates.push(currentRate);
            // Keep only the last 5 rates for smoothing
            if (recentRates.length > 5) {
                recentRates.shift();
            }

            const avgRate = recentRates.reduce((sum, rate) => sum + rate, 0) / recentRates.length;

            // Only call onProgress if callback is provided
            onProgress?.(transferred, Math.floor(avgRate));
        }

        lastTransferred = transferred;
    }, 200);

    // when succeeded
    progressStream.on('end', () => {
        // Only call onProgress if callback is provided
        onProgress?.(transferred, 0);
    });

    // when failed
    abortSignal?.addEventListener('abort', () => {
        // clear progress
        onProgress?.(0, 0);
        stream.destroy();
        streamControlTransform.destroy();
        progressStream.destroy();
    });

    // Create a promise-based approach for partial file updates
    return client.putFileContents(dest, progressStream)
        .finally(() => {
            clearInterval(progressInterval);
        });
}