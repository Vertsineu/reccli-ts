import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import RecFileSystem from '@services/rec-file-system.js';
import PanDavFileSystem from '@services/pan-dav-file-system.js';
import { PauseSignal } from '@utils/pause-signal.js';

// AbortController for cancelling transfers
interface TransferController {
    abortController: AbortController;
    pauseSignal: PauseSignal;
    transferPromise?: Promise<any>;
}

export interface TransferTask {
    id: string;
    sessionId: string;
    srcPath: string;
    destPath: string;
    status: 'pending' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';
    progress: number; // 0-1000
    totalSize: number;
    transferredSize: number;
    speed: number; // bytes per second
    startedAt?: Date;
    completedAt?: Date;
    error?: string;
    createdAt: Date;
    // For speed smoothing
    speedHistory?: number[];
    lastProgressUpdate?: Date;
}

export interface TransferFile {
    path: string;
    name: string;
    size: number;
    transferred: number;
    status: 'pending' | 'transferring' | 'completed' | 'failed';
}

class TransferManager extends EventEmitter {
    private tasks: Map<string, TransferTask> = new Map();
    private runningTasks: Set<string> = new Set();
    private transferControllers: Map<string, TransferController> = new Map();
    private readonly MAX_CONCURRENT_TRANSFERS = 8;

    public createTransferTask(
        sessionId: string,
        srcPath: string,
        destPath: string
    ): string {
        const taskId = uuidv4();
        const task: TransferTask = {
            id: taskId,
            sessionId,
            srcPath,
            destPath,
            status: 'pending',
            progress: 0,
            totalSize: 0,
            transferredSize: 0,
            speed: 0,
            createdAt: new Date()
        };

        this.tasks.set(taskId, task);
        this.emit('taskCreated', task);

        return taskId;
    }

    public async startTransfer(
        taskId: string,
        recFileSystem: RecFileSystem,
        panDavFileSystem: PanDavFileSystem
    ): Promise<void> {
        const task = this.tasks.get(taskId);
        if (!task) {
            throw new Error('Transfer task not found');
        }

        if (task.status !== 'pending') {
            throw new Error('Transfer task has already been run');
        }

        // Remove the concurrent transfer limit check - let frontend control this
        if (this.runningTasks.size >= this.MAX_CONCURRENT_TRANSFERS) {
            throw new Error('Maximum concurrent transfers reached');
        }

        task.status = 'running';
        task.startedAt = new Date();
        this.runningTasks.add(taskId);

        // Create abort controller for this transfer
        const abortController = new AbortController();
        const pauseSignal = new PauseSignal();
        const transferController: TransferController = { abortController, pauseSignal };
        this.transferControllers.set(taskId, transferController);

        this.emit('taskStarted', task);

        try {
            // Store the transfer promise for potential cancellation
            transferController.transferPromise = this.executeTransfer(task, recFileSystem, panDavFileSystem, abortController.signal, pauseSignal);
            await transferController.transferPromise;

            // Only update status if not cancelled or paused
            if (task.status === 'running') {
                task.status = 'completed';
                task.progress = 1000;
                task.completedAt = new Date();
                this.emit('taskCompleted', task);
            }
        } catch (error) {
            // Don't change status if it's already been set to cancelled or paused
            if (task.status === 'running') {
                task.status = 'failed';
                task.error = String(error);
                this.emit('taskFailed', task);
            }
            // Status was already changed by pause/cancel operations
            // The appropriate events were already emitted by those methods
        } finally {
            this.runningTasks.delete(taskId);
            this.transferControllers.delete(taskId);
        }
    }

    public pauseTransfer(taskId: string): void {
        const task = this.tasks.get(taskId);
        if (!task) {
            throw new Error('Transfer task not found');
        }

        if (task.status === 'running') {
            task.status = 'paused';

            // Set pause signal to true - this will pause workers and downloads
            // without terminating them, allowing for true resume functionality
            const controller = this.transferControllers.get(taskId);
            if (controller) {
                controller.pauseSignal.pause();
            }

            this.emit('taskPaused', task);
        }
    }

    public resumeTransfer(
        taskId: string,
        recFileSystem: RecFileSystem,
        panDavFileSystem: PanDavFileSystem
    ): void {
        const task = this.tasks.get(taskId);
        if (!task) {
            throw new Error('Transfer task not found');
        }

        if (task.status === 'paused') {
            // Resume the paused transfer by setting pause signal to false
            const controller = this.transferControllers.get(taskId);
            if (controller) {
                task.status = 'running';
                controller.pauseSignal.resume();
                this.emit('taskResumed', task);
            } else {
                // If controller doesn't exist, we need to restart the transfer
                // Reset status to pending first, then start
                task.status = 'pending';
                task.error = undefined;
                this.startTransfer(taskId, recFileSystem, panDavFileSystem).catch(error => {
                    console.error(`Failed to restart transfer during resume:`, error);
                    task.status = 'failed';
                    task.error = String(error);
                    this.emit('taskFailed', task);
                });
            }
        }
    }

    public cancelTransfer(taskId: string): void {
        const task = this.tasks.get(taskId);
        if (!task) {
            throw new Error('Transfer task not found');
        }

        task.status = 'cancelled';

        // Cancel the transfer completely - this will terminate all operations
        // Unlike pause, this stops everything and cleans up resources
        const controller = this.transferControllers.get(taskId);
        if (controller) {
            controller.abortController.abort();
        }

        this.runningTasks.delete(taskId);
        this.transferControllers.delete(taskId);
        this.emit('taskCancelled', task);
    }

    public restartTransfer(
        taskId: string,
        recFileSystem: RecFileSystem,
        panDavFileSystem: PanDavFileSystem
    ): void {
        const task = this.tasks.get(taskId);
        if (!task) {
            throw new Error('Transfer task not found');
        }

        task.status = 'pending';
        task.progress = 0;
        task.transferredSize = 0;
        task.error = undefined;
        task.startedAt = undefined;
        task.completedAt = undefined;

        this.emit('taskRestarted', task);
        this.startTransfer(taskId, recFileSystem, panDavFileSystem);
    }

    public getTask(taskId: string): TransferTask | undefined {
        return this.tasks.get(taskId);
    }

    public getTasksBySession(sessionId: string): TransferTask[] {
        return Array.from(this.tasks.values()).filter(task => task.sessionId === sessionId);
    }

    public getAllTasks(): TransferTask[] {
        return Array.from(this.tasks.values());
    }

    public removeTask(taskId: string): boolean {
        const task = this.tasks.get(taskId);
        if (task && task.status !== 'pending') {
            this.cancelTransfer(taskId);
        }

        // Clean up any remaining controllers
        this.transferControllers.delete(taskId);

        return this.tasks.delete(taskId);
    }

    private async executeTransfer(
        task: TransferTask,
        recFileSystem: RecFileSystem,
        panDavFileSystem: PanDavFileSystem,
        abortSignal: AbortSignal,
        pauseSignal: PauseSignal
    ): Promise<void> {
        // Check if already cancelled
        if (abortSignal.aborted) {
            throw new Error('Transfer was cancelled');
        }

        // Calculate total size first
        await this.calculateTotalSize(task, recFileSystem);

        // Check cancellation again
        if (abortSignal.aborted) {
            throw new Error('Transfer was cancelled');
        }

        // Get the source file info using a direct method instead of ls
        // We need to access the private calcPath method through a workaround
        // Let's check if the source path exists by using the du method first
        const duResult = await recFileSystem.du(task.srcPath);
        if (!duResult.stat) {
            throw new Error(`Source path not found: ${task.srcPath}`);
        }

        // Get PanDav client
        const panDavClient = panDavFileSystem.getClient();
        if (!panDavClient) {
            throw new Error('PanDav client not available');
        }

        // Validate destination
        const destExists = await panDavClient.exists(task.destPath);
        if (!destExists) {
            throw new Error(`Destination path not found: ${task.destPath}`);
        }

        // Final cancellation check before transfer
        if (abortSignal.aborted) {
            throw new Error('Transfer was cancelled');
        }

        // Use RecFileSystem's transfer method directly - it handles both files and directories
        const progressCallback = (filePath: string, transferred: number, rate: number) => {
            // Check if cancelled during progress update
            if (abortSignal.aborted) {
                return; // Stop updating progress if cancelled
            }

            // Update task progress based on transferred bytes
            task.transferredSize = transferred;

            // Apply speed smoothing using exponential moving average
            if (!task.speedHistory) {
                task.speedHistory = [];
            }

            // Add current rate to history (keep last 10 values)
            task.speedHistory.push(rate);
            if (task.speedHistory.length > 10) {
                task.speedHistory.shift();
            }

            // Calculate smoothed speed using exponential moving average
            let smoothedSpeed = rate;
            if (task.speedHistory.length > 1) {
                const alpha = 0.3; // Smoothing factor (0.1 = more smooth, 0.9 = less smooth)
                smoothedSpeed = task.speedHistory.reduce((acc, curr, idx) => {
                    if (idx === 0) return curr;
                    return alpha * curr + (1 - alpha) * acc;
                }, task.speedHistory[0]);
            }

            task.speed = Math.floor(smoothedSpeed);
            task.lastProgressUpdate = new Date();

            if (task.totalSize > 0) {
                task.progress = Math.min(1000, Math.floor((transferred / task.totalSize) * 1000));
            }

            this.emit('taskProgress', task);
        };

        // Use RecFileSystem's transfer method with progress callback, abort signal and pause signal
        const transferResult = await recFileSystem.transfer(
            task.srcPath,
            task.destPath,
            panDavClient,
            progressCallback,
            abortSignal,
            pauseSignal
        );

        if (!transferResult.stat) {
            throw new Error(transferResult.msg);
        }

        // Check final cancellation state
        if (abortSignal.aborted) {
            throw new Error('Transfer was cancelled');
        }

        // Ensure final progress is 1000
        task.transferredSize = task.totalSize;
        task.progress = 1000;
        this.emit('taskProgress', task);
    }

    private async calculateTotalSize(task: TransferTask, recFileSystem: RecFileSystem): Promise<void> {
        try {
            const du = await recFileSystem.du(task.srcPath);
            // if failed to get size, set to 0
            if (!du.stat) {
                console.warn(`Failed to calculate size for ${task.srcPath}: ${du.msg}`);
                task.totalSize = 0;
                return;
            }
            task.totalSize = du.data;
        } catch (error) {
            console.warn('Failed to calculate total size:', error);
            task.totalSize = 0;
        }
    }
}

export default TransferManager;
