import RecAPI, { RecAuth, UserAuth } from "@services/rec-api.js";
import { parentPort, workerData } from "worker_threads";
import fs from "fs";
import { WorkerTask, WorkerMessage } from "@utils/multi-worker-executor.js";

export type UploadWorkerData = {
    // serializable user auth for constructing RecAPI and RecFileSystem  
    userAuth: UserAuth,
    recAuth: RecAuth
}

// construct RecAPI and RecFileSystem
const data = workerData as UploadWorkerData;
const { userAuth, recAuth } = data;
const api = new RecAPI(userAuth, undefined, recAuth);

// Main message handler
parentPort!.on("message", async (msg: WorkerMessage) => {
    try {
        // Route message to appropriate handler
        await handleMessage(msg);

    } catch (e: any) {
        handleFatalError(e, msg);
    }
});

// Message router
async function handleMessage(msg: WorkerMessage): Promise<void> {
    const { type } = msg;

    if (type === "task") {
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

// Handle exit command
function handleExitMessage(): void {
    process.exit(0);
}

// Handle folder task processing
async function processFolderTask(task: WorkerTask, msgIndex: number, retryCount: number, maxRetries: number): Promise<void> {
    const { id, diskType, groupId, path } = task;
    
    const name = path.split("/").pop()!;
    let folderId = id;

    // Check if folder already exists in remote parent folder
    const folderFiles = (await api.listById(id, diskType, groupId)).datas;
    const existingFolder = folderFiles.find(f => f.type === "folder" && f.name === name);

    if (existingFolder) {
        // Folder already exists, use existing folder ID
        console.log(`[INFO] ${path}: directory already exists, using existing one`);
        folderId = existingFolder.number;
    } else {
        // Create new folder
        console.log(`[INFO] ${path}: creating directory (attempt ${retryCount + 1}/${maxRetries})`);
        const res = await api.mkdirByFolderIds(id, [name], diskType, groupId);
        folderId = res[0].number;
        console.log(`[INFO] ${path}: directory created`);
    }

    // construct tasks using the folder ID (either existing or newly created)
    const files = fs.readdirSync(path);
    const tasks = files.map(f => {
        const p = path + "/" + f;
        const stats = fs.statSync(p);
        return {
            id: folderId,
            diskType: diskType,
            groupId: groupId,
            type: stats.isDirectory() ? "folder" : "file",
            path: p
        };
    });

    // return tasks
    parentPort!.postMessage({
        type: "finish",
        index: msgIndex,
        tasks: tasks
    });
}

// Handle file task processing
async function processFileTask(task: WorkerTask, msgIndex: number, retryCount: number, maxRetries: number): Promise<void> {
    const { id, diskType, groupId, path } = task;
    
    // Get local file stats
    const stats = fs.statSync(path);
    const localSize = stats.size;
    
    // if empty file, skip upload
    if (localSize === 0) {
        console.warn(`[WARN] ${path}: empty file will be ignored`);
        parentPort!.postMessage({
            type: "finish",
            index: msgIndex,
            tasks: []
        });
        return;
    }

    upload: do {
        do {
            // Check if file already exists in remote folder
            const fileName = path.split("/").pop()!;
            const folderFiles = (await api.listById(id, diskType, groupId)).datas;
            const existingFile = folderFiles.find(f => f.type === "file" && 
                (f.file_ext ? f.name + "." + f.file_ext : f.name) === fileName);

            if (!existingFile) break;

            // Get remote file info
            const remoteInfo = await api.getFileInfo({ id: existingFile.number, type: "file" }, groupId);
            const remoteSize = remoteInfo.bytes;

            // log size check
            console.log(`[INFO] ${path}: remote file exists with size ${remoteSize}, local size ${localSize}`);

            // if size matches, skip upload
            if (localSize === remoteSize) {
                console.log(`[INFO] ${path}: file already uploaded completely, skipping...`);
                break upload;
            }

            // if sizes differ, we'll upload (overwrite)
            console.log(`[INFO] ${path}: file sizes differ, will upload to overwrite`);
        } while (false);

        // Proceed with upload
        console.log(`[INFO] ${path}: uploading (attempt ${retryCount + 1}/${maxRetries})`);
        await api.uploadByFolderId(id, path, diskType, groupId);
        console.log(`[INFO] ${path}: upload completed`);
    } while (false);

    // return empty tasks
    parentPort!.postMessage({
        type: "finish",
        index: msgIndex,
        tasks: []
    });
}

// Handle retry logic and exponential backoff (without signal support)
async function handleRetry(error: any, task: WorkerTask, retryCount: number, maxRetries: number): Promise<boolean> {
    console.error(`[ERROR] Failed to process ${task.type} ${task.path} (attempt ${retryCount}/${maxRetries}):`, error);

    if (retryCount >= maxRetries) {
        // After max retries, mark as failed
        console.error(`[FAILED] Task failed after ${maxRetries} attempts for ${task.path}`);
        
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
            if (task.type === "folder") {
                await processFolderTask(task, msg.index, retryCount, maxRetries);
                break; // Success, exit retry loop
            } else if (task.type === "file") {
                await processFileTask(task, msg.index, retryCount, maxRetries);
                break; // Success, exit retry loop
            }
        } catch (error: any) {
            retryCount++;
            const shouldRetry = await handleRetry(error, task, retryCount, maxRetries);
            if (!shouldRetry) {
                return; // Exit if max retries reached
            }
        }
    }
}