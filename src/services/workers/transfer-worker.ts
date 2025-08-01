import RecAPI, { DiskType, FileType, RecAuth, UserAuth } from "@services/rec-api.js";
import { parentPort, workerData } from "worker_threads";
import { downloadToWebDav } from "@utils/downloader.js";
import { createPanDavClient, PanDavAuth } from "@services/pan-dav-api.js";
import { PauseSignal } from "@utils/pause-signal.js";

export type TransferWorkerData = {
    // serializable user auth for constructing RecAPI and RecFileSystem
    userAuth: UserAuth,
    recAuth: RecAuth,
    // serializable pan dav auth for constructing PanDavClient
    panDavAuth: PanDavAuth
}

// before execution, path doesn't exist
export type TransferTask = {
    // identify the file
    id: string,
    diskType: DiskType,
    groupId?: string,
    type: FileType,
    // path in local file system
    path: string
}

export type TransferWorkerMessage = {
    // receive a task
    type: "task",
    index: number,
    task: TransferTask
} | {
    // finish a task and return recursive tasks
    type: "finish",
    // which thread finished the task
    index: number,
    tasks: TransferTask[]
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

parentPort!.on("message", async (msg: TransferWorkerMessage) => {
    try {
        const { type } = msg;

        if (type === "pause") {
            pauseSignal.pause();
            return;
        }

        if (type === "resume") {
            pauseSignal.resume();
            return;
        }

        if (type === "exit") {
            // Trigger abort signal before exiting
            abortController.abort();
            process.exit(0);
        }

        if (type === "task") {
            // Wait if paused before processing task
            while (pauseSignal.paused) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }

            const { id, diskType, groupId, type, path } = msg.task;
            
            // Apply retry strategy at task level for both folders and files
            let retryCount = 0;
            const maxRetries = 3;

            while (retryCount < maxRetries) {
                try {
                    // if folder, list directory entries and return tasks
                    if (type === "folder") {
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
                            index: msg.index,
                            tasks: tasks
                        });
                        break; // Success, exit retry loop
                    } else if (type === "file") {
                        // execute task
                        const dict = await api.getDownloadUrlByIds([id], groupId);
                        const url = dict[id];
                        console.log(`[INFO] ${path}: transferring (attempt ${retryCount + 1}/${maxRetries})`);

                        transfer: do {
                            do {
                                const exists = await client.exists(path);

                                // log existence check
                                console.log(`[INFO] ${path}: exists: ${exists}`);

                                // if not exist, then transfer
                                if (!exists) break;

                                const stat = await client.stat(path);
                                const currentSize = "data" in stat ? stat.data.size : stat.size;
                                const info = await api.getFileInfo({ id, type: "file" }, groupId);
                                const originalSize = info.bytes;

                                // log two sizes
                                console.log(`[INFO] ${path}: original size = ${originalSize}, current size = ${currentSize}`);

                                // if size matches, skip transfer
                                if (originalSize === currentSize) {
                                    console.log(`[INFO] ${path}: file already transferred, skipping...`);
                                    parentPort!.postMessage({
                                        type: "progress",
                                        index: msg.index,
                                        path: path,
                                        transferred: currentSize,
                                        rate: 0
                                    });
                                    break transfer;
                                }
                            } while (false);

                            console.log(`[INFO] ${path}: transferring file (attempt ${retryCount + 1}/${maxRetries})`);
                            // Use the worker's pauseSignal and abortSignal for file transfer
                            await downloadToWebDav(url, path, client, (transferred, rate) => {
                                parentPort!.postMessage({
                                    type: "progress",
                                    index: msg.index,
                                    path: path,
                                    transferred: transferred,
                                    rate: rate
                                });
                            }, abortSignal, pauseSignal);
                            console.log(`[INFO] ${path}: file transfer completed`);
                        } while (false);

                        // return empty tasks
                        parentPort!.postMessage({
                            type: "finish",
                            index: msg.index,
                            tasks: []
                        });
                        break; // Success, exit retry loop
                    }
                } catch (error: any) {
                    retryCount++;
                    const taskType = type === "folder" ? "directory" : "file";
                    console.error(`[ERROR] Failed to process ${taskType} ${path} (attempt ${retryCount}/${maxRetries}):`, error);

                    if (retryCount >= maxRetries) {
                        // After max retries, mark as failed
                        console.error(`[FAILED] Task failed after ${maxRetries} attempts for ${path}`);

                        // Trigger abort signal when task fails after max retries
                        abortController.abort();
                        
                        // Send failed message to main thread
                        parentPort!.postMessage({
                            type: "failed",
                            error: `Task failed after ${maxRetries} attempts: ${error.message || error}`,
                            taskPath: path
                        });
                        return;
                    } else {
                        // Wait before retry (exponential backoff)
                        const waitTime = Math.min(1000 * Math.pow(2, retryCount - 1), 5000);
                        console.log(`[RETRY] Waiting ${waitTime}ms before retry ${retryCount + 1}/${maxRetries} for ${path}`);
                        await new Promise(resolve => setTimeout(resolve, waitTime));
                    }
                }
            }
        }

    } catch (e: any) {
        // error occurs - this should mark the transfer as failed
        console.error(`[WORKER ERROR] Fatal error in worker:`, e);

        // Trigger abort signal on fatal error
        abortController.abort();
        
        // Try to send failed message if possible
        try {
            parentPort!.postMessage({
                type: "failed",
                error: `Worker fatal error: ${e.message || e}`,
                taskPath: msg.type === "task" ? msg.task?.path : undefined
            });
        } catch (sendError) {
            console.error(`[WORKER ERROR] Failed to send error message:`, sendError);
        }

        // Exit with error code to indicate failure
        process.exit(1);
    }
});