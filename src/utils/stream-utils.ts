import { Readable, Transform, Writable } from "stream";
import axios from "axios";
import { PauseSignal } from "@utils/pause-signal.js";

/**
 * Get total file size using Range request
 */
async function getBytesTotal(url: string, abortSignal?: AbortSignal): Promise<number> {
    try {
        // Use Range request to get total size from Content-Range header
        const response = await axios.get(url, {
            headers: {
                'Range': 'bytes=0-0' // Request only the first byte
            },
            signal: abortSignal
        });
        
        // Parse Content-Range header: "bytes 0-0/total_size"
        const contentRange = response.headers['content-range'];
        const match = contentRange.match(/bytes \d+-\d+\/(\d+)/);
        return match ? parseInt(match[1], 10) : -1;
    } catch (error) {
        // Handle network errors gracefully
        if (axios.isAxiosError(error)) {
            throw new Error(`Failed to get file size: ${error.response?.status} ${error.response?.statusText || error.message}`);
        }
        throw error;
    }
}

/**
 * Create a Range request for downloading from a specific byte position
 */
async function requestRangedDownload(url: string, startByte: number = 0, abortSignal?: AbortSignal): Promise<Readable> {
    try {
        const response = await axios<Readable>({
            method: 'GET',
            url: url,
            responseType: 'stream',
            signal: abortSignal,
            headers: {
                'Range': `bytes=${startByte}-`
            }
        });
        
        return response.data;
    } catch (error) {
        // Handle network errors gracefully
        if (axios.isAxiosError(error)) {
            throw new Error(`Failed to download from byte ${startByte}: ${error.response?.status} ${error.response?.statusText || error.message}`);
        }
        throw error;
    }
}

/**
 * A pausable download stream that supports resume with HTTP Range requests
 */
export class PausableDownloadStream extends Readable {
    private downloadStream: Readable | null = null;
    private bytesReceived = 0;
    private bytesTotal = -1;
    
    // Store bound functions as class properties for proper cleanup
    private handlePause: () => void;
    private handleResume: () => void;

    // url must support range requests
    constructor(
        private url: string, 
        private pauseSignal?: PauseSignal,
        private abortSignal?: AbortSignal
    ) {
        super();
        // Bind methods and store as properties
        this.handlePause = () => this.handlePauseSignal(true);
        this.handleResume = () => this.handlePauseSignal(false);
        this.setupEventListeners();
    }

    private setupEventListeners(): void {
        // set up pause signal listener if provided
        this.pauseSignal?.on('pause', this.handlePause);
        this.pauseSignal?.on('resume', this.handleResume);

        // handle abort signal
        this.abortSignal?.addEventListener('abort', () => {
            this.downloadStream?.destroy();
            this.downloadStream = null;
            this.destroy();
        });
    }

    private handlePauseSignal(paused: boolean): void {
        if (paused && this.downloadStream) {
            // Pause: destroy current stream
            this.downloadStream?.destroy();
            this.downloadStream = null;
        } else if (!paused && !this.downloadStream) {
            // Resume: start new stream with Range header
            this.startStream();
        }
    };

    // lazy load total bytes
    private async getBytesTotal(): Promise<number> {
        if (this.bytesTotal === -1) {
            try {
                return this.bytesTotal = await getBytesTotal(this.url, this.abortSignal);
            } catch (error) {
                // If we can't get file size, emit error instead of throwing
                this.emit('error', error);
                return -1;
            }
        }
        return this.bytesTotal;
    }

    private async startStream(): Promise<void> {
        if (this.downloadStream) {
            return; // Already started  
        }

        try {
            const totalBytes = await this.getBytesTotal();
            if (totalBytes === -1) {
                // getBytesTotal failed and already emitted an error
                return;
            }

            if (this.bytesReceived >= totalBytes) {
                // If we have already received all bytes, push null to signal end
                this.push(null);
                return;
            }

            this.downloadStream = await requestRangedDownload(this.url, this.bytesReceived, this.abortSignal);
        } catch (error) {
            if (!this.abortSignal?.aborted) {
                this.emit('error', error);
            }
            return;
        }

        this.downloadStream.on('data', (chunk: Buffer) => {
            if (!this.pauseSignal?.paused && !this.abortSignal?.aborted) {
                this.bytesReceived += chunk.length;
                
                // Directly push the chunk, and pause downloadStream if backpressure
                const canContinue = this.push(chunk);
                if (!canContinue) {
                    this.downloadStream?.pause();
                }
            }
        });
        
        this.downloadStream.on('end', () => {
            if (!this.pauseSignal?.paused && !this.abortSignal?.aborted) {
                this.push(null);
            }
        });
        
        this.downloadStream.on('error', (error) => {
            if (!this.abortSignal?.aborted) {
                this.emit('error', error);
            }
        });
    }

    // backpressure handling
    _read(): void {
        if (!this.downloadStream) {
            // Start the download stream when first read is requested
            if (!this.pauseSignal?.paused && !this.abortSignal?.aborted) {
                this.startStream();
            }
            return;
        }

        // Check if paused or aborted
        if (this.pauseSignal?.paused || this.abortSignal?.aborted) {
            return;
        }

        // Resume the download stream if it was paused due to backpressure
        if (this.downloadStream.isPaused()) {
            this.downloadStream.resume();
        }
    }

    _destroy(error: Error | null, callback: (error?: Error | null) => void): void {
        this.downloadStream?.destroy();
        this.downloadStream = null;
        
        // Clean up event listeners
        this.pauseSignal?.off('pause', this.handlePause);
        this.pauseSignal?.off('resume', this.handleResume);

        callback(error);
    }

}

export type ProgressCallback = (transferred: number, rate: number) => void;

/**
 * A transform stream that calculates transfer rate and reports progress
 */
export class ProgressRateStream extends Transform {
    private transferred = 0;
    private lastTransferred = 0;
    private recentRates: number[] = [];
    private progressInterval: NodeJS.Timeout;

    constructor(private onProgress?: ProgressCallback) {
        super();
        
        // Set up interval for rate calculation - every 200ms
        this.progressInterval = setInterval(() => {
            const bytesDiff = this.transferred - this.lastTransferred;
            // Calculate bytes per second
            const currentRate = bytesDiff * 5; // 200ms * 5 = 1 second

            if (bytesDiff > 0) {
                this.recentRates.push(currentRate);
                // Keep only the last 5 rates for smoothing
                if (this.recentRates.length > 5) {
                    this.recentRates.shift();
                }

                const avgRate = this.recentRates.reduce((sum, rate) => sum + rate, 0) / this.recentRates.length;

                // Only call onProgress if callback is provided
                this.onProgress?.(this.transferred, Math.floor(avgRate));
            }

            this.lastTransferred = this.transferred;
        }, 200);

        // Handle stream end
        this.on('end', () => {
            this.onProgress?.(this.transferred, 0);
        });
    }

    _transform(chunk: any, encoding: BufferEncoding, callback: (error?: Error | null, data?: any) => void): void {
        // Update the transferred bytes counter
        this.transferred += chunk.length;
        
        // Pass the chunk through
        callback(null, chunk);
    }

    _destroy(error: Error | null, callback: (error?: Error | null) => void): void {
        if (this.progressInterval) {
            clearInterval(this.progressInterval);
        }
        callback(error);
    }

    // Method to reset progress (useful for abort scenarios)
    resetProgress(): void {
        this.transferred = 0;
        this.lastTransferred = 0;
        this.recentRates = [];
        // Reset progress callback
        this.onProgress?.(0, 0);
    }
}