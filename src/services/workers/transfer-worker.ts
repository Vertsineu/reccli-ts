import RecAPI, { RecAuth, UserAuth } from "@services/rec-api.js";
import { parentPort, workerData } from "worker_threads";
import { downloadToWebDav } from "@utils/downloader.js";
import { createPanDavClient, PanDavAuth } from "@services/pan-dav-api.js";
import { PauseSignal } from "@utils/pause-signal.js";
import { WorkerTask, WorkerMessage } from "@utils/multi-worker-executor.js";

export type TransferWorkerData = {
    // serializable user auth for constructing RecAPI and RecFileSystem
    userAuth: UserAuth,
    recAuth: RecAuth,
    // serializable pan dav auth for constructing PanDavClient
    panDavAuth: PanDavAuth
}

// construct RecAPI and RecFileSystem
const data = workerData as TransferWorkerData;
const { userAuth, recAuth, panDavAuth } = data;
const api = new RecAPI(userAuth, undefined, recAuth);
const client = createPanDavClient(panDavAuth);

// Worker pause signal
const pauseSignal = new PauseSignal();

// Worker abort controller for cancelling operations
const abortController = new AbortController();
const abortSignal = abortController.signal;

// Main message handler with global pause logic
parentPort!.on("message", async (msg: WorkerMessage) => {
    try {
        // Route message to appropriate handler
        await handleMessage(msg);

    } catch (e: any) {
        handleFatalError(e, msg);
    }
});

// Message router with global pause handling
async function handleMessage(msg: WorkerMessage): Promise<void> {
    const { type } = msg;

    if (type === "pause") {
        handlePauseMessage();
    } else if (type === "resume") {
        handleResumeMessage();
    } else if (type === "task") {
        await handleTaskMessage(msg);
    } else if (type === "exit") {
        handleExitMessage(); // This will not return
    } else {
        console.warn(`[WARN] Unknown message type: ${type}`);
        console.warn(`[WARN] Message content: ${JSON.stringify(msg)}`);
    }
}

// Handle fatal errors
function handleFatalError(error: any, msg?: WorkerMessage): void {
    console.error(`[WORKER ERROR] Fatal error in worker:`, error);

    // Trigger abort signal on fatal error
    abortController.abort();
    
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
function handlePauseMessage(): void {
    pauseSignal.pause();
}

// Handle resume command
function handleResumeMessage(): void {
    pauseSignal.resume();
}

// Handle exit command
function handleExitMessage(): void {
    // Trigger abort signal before exiting
    abortController.abort();
    process.exit(0);
}

// Handle folder task processing
async function processFolderTask(task: WorkerTask, msgIndex: number, retryCount: number, maxRetries: number): Promise<void> {
    const { id, diskType, groupId, path } = task;
    const exists = await client.exists(path);

    // if directory already exists, skip creation
    if (exists) {
        console.log(`[INFO] ${path}: directory already exists, skipping...`);
    } else {
        console.log(`[INFO] ${path}: creating directory (attempt ${retryCount + 1}/${maxRetries})`);
        await client.createDirectory(path);
        console.log(`[INFO] ${path}: directory created`);
    }

    // construct tasks
    const files = (await api.listById(id, diskType, groupId)).datas;
    const tasks = files.map(f => ({
        id: f.number,
        diskType: f.disk_type,
        groupId: groupId, // extend groupId from parent task
        type: f.type,
        path: path + "/" + (f.type === "folder" ? f.name : f.file_ext ? f.name + "." + f.file_ext : f.name)
    }));

    // return tasks
    parentPort!.postMessage({
        type: "finish",
        index: msgIndex,
        tasks: tasks
    });
}

// Handle file task processing
async function processFileTask(task: WorkerTask, msgIndex: number, retryCount: number, maxRetries: number): Promise<void> {
    const { id, groupId, path } = task;
    
    // execute task
    const dict = await api.getDownloadUrlByIds([id], groupId);
    const url = dict[id];

    transfer: do {
        do {
            const exists = await client.exists(path);

            // if not exist, then transfer
            if (!exists) break;

            const stat = await client.stat(path);
            const currentSize = "data" in stat ? stat.data.size : stat.size;
            const info = await api.getFileInfo({ id, type: "file" }, groupId);
            const originalSize = info.bytes;

            // if size matches, skip transfer
            if (originalSize === currentSize) {
                console.log(`[INFO] ${path}: file already transferred, skipping...`);
                parentPort!.postMessage({
                    type: "progress",
                    index: msgIndex,
                    path: path,
                    transferred: currentSize,
                    rate: 0
                });
                break transfer;
            }
        } while (false);

        console.log(`[INFO] ${path}: transferring (attempt ${retryCount + 1}/${maxRetries})`);
        // Use the worker's pauseSignal and abortSignal for file transfer
        await downloadToWebDav(url, path, client, (transferred, rate) => {
            parentPort!.postMessage({
                type: "progress",
                index: msgIndex,
                path: path,
                transferred: transferred,
                rate: rate
            });
        }, abortSignal, pauseSignal);
        console.log(`[INFO] ${path}: transfer completed`);
    } while (false);

    // return empty tasks
    parentPort!.postMessage({
        type: "finish",
        index: msgIndex,
        tasks: []
    });
}

// Handle retry logic and exponential backoff
async function handleRetry(error: any, task: WorkerTask, retryCount: number, maxRetries: number): Promise<boolean> {
    console.error(`[ERROR] Failed to process ${task.type} ${task.path} (attempt ${retryCount}/${maxRetries}):`, error);

    if (retryCount >= maxRetries) {
        // After max retries, mark as failed
        console.error(`[FAILED] Task failed after ${maxRetries} attempts for ${task.path}`);

        // Trigger abort signal when task fails after max retries
        abortController.abort();
        
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
async function handleTaskMessage(msg: Extract<WorkerMessage, { type: "task" }>): Promise<void> {
    const { task } = msg;

    // Apply retry strategy at task level for both folders and files
    let retryCount = 0;
    const maxRetries = 5;

    while (retryCount < maxRetries) {
        try {
            // Global pause logic - wait if paused before processing task
            while (pauseSignal.paused) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }

            if (task.type === "folder") {
                await processFolderTask(task, msg.index, retryCount, maxRetries);
                break; // Success, exit retry loop
            } else if (task.type === "file") {
                await processFileTask(task, msg.index, retryCount, maxRetries);
                break; // Success, exit retry loop
            }
        } catch (error: any) {
            // Global pause logic - wait if paused before processing task
            while (pauseSignal.paused) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }

            retryCount++;
            const shouldRetry = await handleRetry(error, task, retryCount, maxRetries);
            if (!shouldRetry) {
                return; // Exit if max retries reached
            }
        }
    }
}