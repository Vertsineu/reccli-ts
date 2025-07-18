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
        let lastTime = Date.now();
        let lastTransferred = 0;

        const progressTransform = new Transform({
            transform(chunk, encoding, callback) {
                // Check for cancellation during streaming
                if (abortSignal?.aborted) {
                    callback(new Error('Download was cancelled'));
                    return;
                }

                // Wait if paused (non-blocking check)
                const waitForResume = async () => {
                    while (pauseSignal?.paused) {
                        await new Promise(resolve => setTimeout(resolve, 100));
                        // Check for cancellation while paused
                        if (abortSignal?.aborted) {
                            throw new Error('Download was cancelled');
                        }
                    }
                };

                waitForResume().then(() => {
                    transferred += chunk.length;
                    const now = Date.now();
                    const timeDiff = now - lastTime;

                    // Update progress every 200ms to avoid too frequent updates
                    if (timeDiff >= 200) {
                        const bytesDiff = transferred - lastTransferred;
                        const rate = bytesDiff / (timeDiff / 1000); // bytes per second
                        onProgress(transferred, rate);

                        lastTime = now;
                        lastTransferred = transferred;
                    }

                    callback(null, chunk);
                }).catch(error => {
                    callback(error);
                });
            }
        });

        const progressStream = stream.pipe(progressTransform);

        // Handle stream errors and cancellation
        return new Promise((resolve, reject) => {
            if (abortSignal) {
                abortSignal.addEventListener('abort', () => {
                    stream.destroy();
                    progressStream.destroy();
                    reject(new Error('Download was cancelled'));
                });
            }

            client.putFileContents(dest, progressStream)
                .then(resolve)
                .catch(reject);
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