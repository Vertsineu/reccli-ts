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

    // 获取文件的总大小（如果可用）
    const contentLength = parseInt(response.headers['content-length'] || '0', 10);
    const stream = response.data;

    if (onProgress) {
        let transferred = 0;
        let lastTime = Date.now();
        let lastTransferred = 0;
        // 存储最近几次的速率值，用于平滑计算
        const recentRates: number[] = [];
        // 是否为最后的数据块
        let isLastChunk = false;
        // 上次报告的进度百分比，用于避免99.9%卡顿
        let lastReportedPercentage = 0;

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

                    // 检测是否接近文件末尾（如果知道文件大小）
                    if (contentLength > 0) {
                        isLastChunk = transferred >= contentLength * 0.99;
                    }

                    // Update progress every 200ms to avoid too frequent updates
                    if (timeDiff >= 200 || isLastChunk) {
                        const bytesDiff = transferred - lastTransferred;

                        // 计算当前速率
                        let currentRate = bytesDiff / (timeDiff / 1000);

                        // 限制最大速率，避免瞬时峰值
                        currentRate = Math.min(currentRate, 120 * 1024 * 1024); // 最大120MB/s

                        // 将当前速率添加到最近速率数组中
                        recentRates.push(currentRate);
                        if (recentRates.length > 5) {
                            recentRates.shift(); // 保留最近5个速率值
                        }

                        // 计算平均速率，减少波动
                        const avgRate = recentRates.reduce((sum, rate) => sum + rate, 0) / recentRates.length;

                        // 计算当前完成百分比
                        let percentage = contentLength > 0 ? (transferred / contentLength) * 100 : 0;

                        // 如果接近完成但还未完全完成，避免卡在99.9%
                        if (percentage > 99.5 && percentage < 100 && !isLastChunk) {
                            // 如果进度接近100%但未完成，暂时限制进度上限在99.5%
                            percentage = Math.min(percentage, 99.5);

                            // 确保进度不会倒退
                            if (percentage < lastReportedPercentage) {
                                percentage = lastReportedPercentage;
                            }
                        }

                        lastReportedPercentage = percentage;

                        // 报告进度
                        onProgress(transferred, Math.floor(avgRate));

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

        // 当流结束时，确保进度显示为100%
        progressStream.on('end', () => {
            if (onProgress && contentLength > 0) {
                // 流结束时报告完整的大小和零速率
                onProgress(contentLength, 0);
            }
        });

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