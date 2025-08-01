import { Worker, parentPort } from "worker_threads";
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
    path?: string
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

export interface WorkerConfig<T = any> {
    workerCount: number;
    workerPath: string;
    workerData: T;
    abortSignal?: AbortSignal;
    pauseSignal?: PauseSignal;
}

export class MultiWorkerExecutor<T = any> {
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

    constructor(private config: WorkerConfig<T>) {
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
        } else {
            console.warn(`[WARN] Unknown message type: ${type}`);
            console.warn(`[WARN] Message content: ${JSON.stringify(msg)}`);
        }
    }

    private handleFinishMessage(
        msg: Extract<WorkerMessage, { type: "finish" }>, 
        resolve: () => void
    ): void {
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
        msg: Extract<WorkerMessage, { type: "progress" }>
    ): void {
        if (!this.onProgress || this.config.abortSignal?.aborted || this.config.pauseSignal?.paused) return;

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
        msg: Extract<WorkerMessage, { type: "failed" }>,
        reject: (error: Error) => void
    ): void {
        this.terminateAllWorkers();
        reject(new Error(`Execution failed: ${msg.error}${msg.path ? ` (Path: ${msg.path})` : ''}`));
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

// Abstract base class for all workers
export abstract class WorkerBase {
    protected pauseSignal?: PauseSignal;
    protected abortController?: AbortController;
    protected abortSignal?: AbortSignal;

    constructor(options?: { enableSignals?: boolean }) {
        if (options?.enableSignals) {
            this.pauseSignal = new PauseSignal();
            this.abortController = new AbortController();
            this.abortSignal = this.abortController.signal;
        }

        // Set up message handler
        parentPort!.on("message", async (msg: WorkerMessage) => {
            try {
                await this.handleMessage(msg);
            } catch (e: any) {
                this.handleFatalError(e, msg);
            }
        });
    }

    // Abstract methods that must be implemented by concrete workers
    protected abstract processFolderTask(task: WorkerTask, msgIndex: number, retryCount: number, maxRetries: number): Promise<void>;
    protected abstract processFileTask(task: WorkerTask, msgIndex: number, retryCount: number, maxRetries: number): Promise<void>;

    // Message router with global pause handling
    protected async handleMessage(msg: WorkerMessage): Promise<void> {
        const { type } = msg;

        if (type === "pause") {
            this.handlePauseMessage();
        } else if (type === "resume") {
            this.handleResumeMessage();
        } else if (type === "task") {
            await this.handleTaskMessage(msg);
        } else if (type === "exit") {
            this.handleExitMessage(); // This will not return
        } else {
            console.warn(`[WARN] Unknown message type: ${type}`);
            console.warn(`[WARN] Message content: ${JSON.stringify(msg)}`);
        }
    }

    // Handle fatal errors
    protected handleFatalError(error: any, msg?: WorkerMessage): void {
        console.error(`[WORKER ERROR] Fatal error in worker:`, error);

        // Trigger abort signal on fatal error if available
        this.abortController?.abort();
        
        // Try to send failed message if possible
        try {
            parentPort!.postMessage({
                type: "failed",
                error: `Worker fatal error: ${error.message || error}`,
                path: msg?.type === "task" ? msg.task?.path : undefined
            });
        } catch (sendError) {
            console.error(`[WORKER ERROR] Failed to send error message:`, sendError);
        }

        // Exit with error code to indicate failure
        process.exit(1);
    }

    // Handle pause command
    protected handlePauseMessage(): void {
        this.pauseSignal?.pause();
    }

    // Handle resume command
    protected handleResumeMessage(): void {
        this.pauseSignal?.resume();
    }

    // Handle exit command
    protected handleExitMessage(): void {
        // Trigger abort signal before exiting if available
        this.abortController?.abort();
        process.exit(0);
    }

    // Handle retry logic and exponential backoff
    protected async handleRetry(error: any, task: WorkerTask, retryCount: number, maxRetries: number): Promise<boolean> {
        console.error(`[ERROR] Failed to process ${task.type} ${task.path} (attempt ${retryCount}/${maxRetries}):`, error);

        if (retryCount >= maxRetries) {
            // After max retries, mark as failed
            console.error(`[FAILED] Task failed after ${maxRetries} attempts for ${task.path}`);

            // Trigger abort signal when task fails after max retries if available
            this.abortController?.abort();
            
            // Send failed message to main thread
            parentPort!.postMessage({
                type: "failed",
                error: `Task failed after ${maxRetries} attempts: ${error.message || error}`,
                taskPath: task.path
            });
            return false; // Don't retry
        } else {
            // Wait before retry (exponential backoff)
            const waitTime = Math.min(1000 * Math.pow(2, retryCount - 1), 5000);
            console.log(`[INFO] Waiting ${waitTime}ms before retry ${retryCount + 1}/${maxRetries} for ${task.path}`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
            return true; // Continue retrying
        }
    }

    // Handle task execution with retry logic
    protected async handleTaskMessage(msg: Extract<WorkerMessage, { type: "task" }>): Promise<void> {
        const { task } = msg;

        // Apply retry strategy at task level for both folders and files
        let retryCount = 0;
        const maxRetries = 5;

        while (retryCount < maxRetries) {
            try {
                // Global pause logic - wait if paused before processing task
                while (this.pauseSignal?.paused) {
                    await new Promise(resolve => setTimeout(resolve, 100));
                }

                if (task.type === "folder") {
                    await this.processFolderTask(task, msg.index, retryCount, maxRetries);
                    break; // Success, exit retry loop
                } else if (task.type === "file") {
                    await this.processFileTask(task, msg.index, retryCount, maxRetries);
                    break; // Success, exit retry loop
                }
            } catch (error: any) {
                // Global pause logic - wait if paused before processing task
                while (this.pauseSignal?.paused) {
                    await new Promise(resolve => setTimeout(resolve, 100));
                }

                retryCount++;
                const shouldRetry = await this.handleRetry(error, task, retryCount, maxRetries);
                if (!shouldRetry) {
                    return; // Exit if max retries reached
                }
            }
        }
    }
}
