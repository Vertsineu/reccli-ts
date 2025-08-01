import { Worker } from "worker_threads";
import { PauseSignal } from "@utils/pause-signal.js";
import { DiskType, FileType } from "@services/rec-api.js";

export type ProgressCallback = (filePath: string, transferred: number, rate: number) => void;

export type WorkerTask = {
    // identify the file
    id: string,
    diskType: DiskType,
    groupId?: string,
    type: FileType,
    // path in local file system
    path: string
}

export type WorkerMessage = {
    // receive a task
    type: "task",
    index: number,
    task: WorkerTask
} | {
    // finish a task and return recursive tasks
    type: "finish",
    // which thread finished the task
    index: number,
    tasks: WorkerTask[]
} | {
    // progress update for file transfer
    type: "progress",
    index: number,
    path: string,
    transferred: number,
    rate: number
} | {
    // transfer failed - should mark transfer as failed
    type: "failed",
    error: string,
    taskPath?: string
} | {
    // pause the worker
    type: "pause"
} | {
    // resume the worker
    type: "resume"
} | {
    // exit in the end
    type: "exit"
}

export interface WorkerConfig {
    workerCount: number;
    workerPath: string;
    workerData: any;
    abortSignal?: AbortSignal;
    pauseSignal?: PauseSignal;
}

export class MultiWorkerExecutor {
    private workers: Worker[] = [];
    private ready: boolean[] = [];
    private queue: WorkerTask[] = [];
    private workerProgress = new Map<number, { path: string, transferred: number, rate: number, completedSize: number }>();
    private lastProgressUpdate = Date.now();
    
    // Store progress callback as instance variable
    private onProgress?: ProgressCallback;
    
    // Store event listener functions for proper cleanup
    private abortHandler: () => void;
    private pauseListener: () => void;
    private resumeListener: () => void;

    constructor(private config: WorkerConfig) {
        // Initialize event handlers once in constructor
        this.abortHandler = () => this.terminateAllWorkers();

        this.pauseListener = () => this.handlePauseSignal(true);
        this.resumeListener = () => this.handlePauseSignal(false);

        // Set up event listeners immediately if signals are provided
        this.setupEventListeners();
    }

    private handlePauseSignal(paused: boolean): void {
        if (this.config.abortSignal?.aborted) return;
        this.workers.forEach(w => {
            w.postMessage({ type: paused ? 'pause' : 'resume' });
        });
    }

    public async execute(
        task: WorkerTask,
        onProgress?: ProgressCallback
    ): Promise<void> {
        // Store progress callback as instance variable
        this.onProgress = onProgress;
        
        // Initialize workers
        this.initializeWorkers();

        try {
            // Create and await the execution promise
            const executionPromise = this.createExecutionPromise();
            
            // Start the first task if not cancelled
            if (!this.config.abortSignal?.aborted) {
                this.ready[0] = false;
                this.workers[0].postMessage({ type: "task", index: 0, task: task });
            }

            // Wait for completion
            await executionPromise;
        } finally {
            // Clean up resources
            this.cleanup();
        }
    }

    private initializeWorkers(): void {
        this.workers = Array.from({ length: this.config.workerCount }, () => 
            new Worker(this.config.workerPath, { 
                workerData: this.config.workerData
            })
        );
        this.ready = new Array(this.config.workerCount).fill(true);
        this.queue = [];
        this.workerProgress.clear();
    }

    private setupEventListeners(): void {
        // Set up abort handler
        this.config.abortSignal?.addEventListener('abort', this.abortHandler);

        // Set up pause/resume handlers
        this.config.pauseSignal?.on('pause', this.pauseListener);
        this.config.pauseSignal?.on('resume', this.resumeListener);
    }

    private createExecutionPromise(): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            this.workers.forEach(worker => {
                worker.on("message", async (msg: WorkerMessage) => {
                    try {
                        // Check if aborted before processing any message
                        if (this.config.abortSignal?.aborted) {
                            reject(new Error("Execution was cancelled"));
                            return;
                        }

                        // Wait while paused
                        while (this.config.pauseSignal?.paused && !this.config.abortSignal?.aborted) {
                            await new Promise(resolve => setTimeout(resolve, 100));
                        }

                        // Check again after waiting
                        if (this.config.abortSignal?.aborted) {
                            reject(new Error("Execution was cancelled"));
                            return;
                        }

                        // Route the message to appropriate handler
                        this.handleWorkerMessage(msg, resolve, reject);
                    } catch (error) {
                        reject(error as Error);
                    }
                });
            });
        });
    }

    private handleWorkerMessage(
        msg: WorkerMessage,
        resolve: () => void,
        reject: (error: Error) => void
    ): void {
        const { type } = msg;

        if (type === "finish") {
            this.handleFinishMessage(msg, resolve);
        } else if (type === "progress") {
            this.handleProgressMessage(msg);
        } else if (type === "failed") {
            this.handleFailedMessage(msg, reject);
        }
    }

    private handleFinishMessage(
        msg: WorkerMessage, 
        resolve: () => void
    ): void {
        if (msg.type !== "finish") return;

        // Update progress tracking
        const currentProgress = this.workerProgress.get(msg.index);
        if (currentProgress) {
            const finalSize = currentProgress.transferred;
            currentProgress.completedSize += finalSize;
            currentProgress.transferred = 0;
            currentProgress.rate = 0;
            this.workerProgress.set(msg.index, currentProgress);

            // Send final progress update
            if (this.onProgress && !this.config.abortSignal?.aborted && !this.config.pauseSignal?.paused) {
                const { totalTransferred, totalRate, activeWorkers } = this.calculateTotalProgress();
                this.onProgress(currentProgress.path, totalTransferred, activeWorkers > 0 ? Math.floor(totalRate) : 0);
            }
        }

        // Set worker as ready and add new tasks to queue
        this.ready[msg.index] = true;
        this.queue.push(...msg.tasks);

        // Allocate tasks to ready workers
        this.allocateTasksToWorkers();

        // Check if all tasks are completed and resolve if so
        if (this.ready.every(r => r)) {
            this.terminateAllWorkers();
            resolve();
        }
    }

    private handleProgressMessage(
        msg: WorkerMessage
    ): void {
        if (msg.type !== "progress" || !this.onProgress || this.config.abortSignal?.aborted || this.config.pauseSignal?.paused) return;

        // Update progress for this worker
        const existingProgress = this.workerProgress.get(msg.index);
        this.workerProgress.set(msg.index, {
            path: msg.path,
            transferred: msg.transferred,
            rate: msg.rate,
            completedSize: existingProgress?.completedSize || 0
        });

        // Throttle progress updates
        const now = Date.now();
        if (now - this.lastProgressUpdate < 100) return;
        this.lastProgressUpdate = now;

        // Calculate and report aggregated progress
        const { totalTransferred, totalRate, activeWorkers } = this.calculateTotalProgress();
        this.onProgress(msg.path, totalTransferred, activeWorkers > 0 ? Math.floor(totalRate) : 0);
    }

    private handleFailedMessage(
        msg: WorkerMessage,
        reject: (error: Error) => void
    ): void {
        if (msg.type !== "failed") return;

        this.terminateAllWorkers();
        reject(new Error(`Execution failed: ${msg.error}${msg.taskPath ? ` (Path: ${msg.taskPath})` : ''}`));
    }

    private calculateTotalProgress(): { totalTransferred: number, totalRate: number, activeWorkers: number } {
        let totalTransferred = 0;
        let totalRate = 0;
        let activeWorkers = 0;

        for (const [, progress] of this.workerProgress.entries()) {
            totalTransferred += progress.completedSize + progress.transferred;
            if (progress.rate > 0) {
                totalRate += progress.rate;
                activeWorkers++;
            }
        }

        return { totalTransferred, totalRate, activeWorkers };
    }

    private allocateTasksToWorkers(): void {
        while (this.queue.length > 0 && !this.config.abortSignal?.aborted && !this.config.pauseSignal?.paused) {
            const index = this.ready.indexOf(true);
            if (index === -1) return;
            
            const task = this.queue.shift();
            this.ready[index] = false;
            this.workers[index].postMessage({ type: "task", index: index, task: task });
        }
    }

    private terminateAllWorkers(): void {
        this.workers.forEach(w => {
            w.postMessage({ type: "exit" });
            w.terminate();
        });
    }

    private cleanup(): void {
        // Clean up abort listener
        this.config.abortSignal?.removeEventListener('abort', this.abortHandler);

        // Clean up pause/resume listeners
        this.config.pauseSignal?.off('pause', this.pauseListener);
        this.config.pauseSignal?.off('resume', this.resumeListener);

        // Clear progress tracking and callback
        this.workerProgress.clear();
        this.onProgress = undefined;
    }
}
