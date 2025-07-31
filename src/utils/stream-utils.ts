import { Readable } from "stream";
import axios from "axios";
import { PauseSignal } from "@utils/pause-signal.js";
import { PanDavClient } from "@services/pan-dav-api.js";

/**
 * Get total file size using Range request
 */
async function getBytesTotal(url: string, abortSignal?: AbortSignal): Promise<number> {
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
}

/**
 * Create a Range request for downloading from a specific byte position
 */
async function requestRangedDownload(url: string, startByte: number = 0, abortSignal?: AbortSignal): Promise<Readable> {
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
}

async function requestRangedUpload(client: PanDavClient, path: string, chunk: Buffer, startByte: number = 0, abortSignal?: AbortSignal): Promise<void> {
    // use client.partialUpdateFileContents
    await client.partialUpdateFileContents(path, startByte, startByte + chunk.length - 1, chunk, {
        signal: abortSignal
    });
}

/**
 * A pausable download stream that supports resume with HTTP Range requests
 */
export class PausableDownloadStream extends Readable {
    private downloadStream: Readable | null = null;
    private bytesReceived = 0;
    private bytesTotal = -1;

    // url must support range requests
    constructor(
        private url: string, 
        private pauseSignal?: PauseSignal,
        private abortSignal?: AbortSignal
    ) {
        super();
        this.setupEventListeners();
    }

    private setupEventListeners(): void {
        // set up pause signal listener if provided
        this.pauseSignal?.on('pause', () => {
            this.handlePauseSignal(true);
        });
        this.pauseSignal?.on('resume', () => {
            this.handlePauseSignal(false);
        });

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
            return this.bytesTotal = await getBytesTotal(this.url, this.abortSignal);
        }
        return this.bytesTotal;
    }

    private async startStream(): Promise<void> {
        if (this.downloadStream) {
            return; // Already started
        }

        if (this.bytesReceived >= await this.getBytesTotal()) {
            // If we have already received all bytes, push null to signal end
            this.push(null);
            return;
        }

        try {
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
        this.pauseSignal?.off('pause', this.handlePauseSignal);
        this.pauseSignal?.off('resume', this.handlePauseSignal);

        callback(error);
    }

}
