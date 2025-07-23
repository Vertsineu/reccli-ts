import { PanDavClient } from "@services/pan-dav-api.js";
import axios from "axios";
import fs from "fs";
import { Readable, Stream, Transform } from "stream";

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

import { PauseSignal } from "@utils/pause-signal.js";

export async function downloadToWebDav(url: string, dest: string, client: PanDavClient, onProgress?: ProgressCallback, abortSignal?: AbortSignal, pauseSignal?: PauseSignal | { readonly paused: boolean }) {
    // Check if already cancelled
    if (abortSignal?.aborted) {
        throw new Error('Download was cancelled');
    }

    const response = await axios<Readable>({
        method: 'GET',
        url: url,
        responseType: 'stream', // set response type as 'stream'
        signal: abortSignal, // Pass AbortSignal to axios
    });

    const stream = response.data;

    if (onProgress) {
        let transferred = 0;
        let lastTransferred = 0;
        const recentRates: number[] = [];

        // Set up interval for rate calculation - every 200ms
        const intervalId = setInterval(() => {
            // Don't update if paused
            if (pauseSignal?.paused) return;

            const now = Date.now();
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

                onProgress(transferred, Math.floor(avgRate));
            }

            lastTransferred = transferred;
        }, 200);

        const progressTransform = new Transform({
            transform(chunk, encoding, callback) {
                // check if cancelled
                if (abortSignal?.aborted) {
                    callback(new Error('Download was cancelled'));
                    return;
                }

                // update progress
                (async () => {
                    // check if paused or cancelled
                    while (pauseSignal?.paused) {
                        await new Promise(resolve => setTimeout(resolve, 100));
                        // Check for cancellation while paused
                        if (abortSignal?.aborted) {
                            throw new Error('Download was cancelled');
                        }
                    }

                    // Just update the transferred bytes counter
                    transferred += chunk.length;

                    callback(null, chunk);
                })().catch(callback);
            }
        });

        const progressStream = stream.pipe(progressTransform);

        // update rate to 0 when stream ends
        progressStream.on('end', () => {
            clearInterval(intervalId);
            onProgress(transferred, 0);
        });

        // Handle stream errors and cancellation
        return new Promise((resolve, reject) => {
            if (abortSignal) {
                abortSignal.addEventListener('abort', () => {
                    clearInterval(intervalId);
                    stream.destroy();
                    progressStream.destroy();
                    reject(new Error('Download was cancelled'));
                });
            }
            client.putFileContents(dest, progressStream)
                .then(resolve)
                .catch(error => {
                    clearInterval(intervalId);
                    reject(error);
                });
        });
    } else {
        // Handle stream errors and cancellation for non-progress case
        return new Promise((resolve, reject) => {
            if (abortSignal) {
                abortSignal.addEventListener('abort', () => {
                    stream.destroy();
                    reject(new Error('Download was cancelled'));
                });
            }

            client.putFileContents(dest, stream)
                .then(resolve)
                .catch(reject);
        });
    }
}