import RecAPI, { DiskType, FileType, UserAuth } from "@services/rec-api.js";
import { parentPort, workerData } from "worker_threads";
import { downloadToWebDav } from "@utils/downloader.js";
import { createPanDavClient, PanDavAuth } from "@services/pan-dav-api.js";
import { PauseSignal } from "@utils/pause-signal.js";

export type TransferWorkerData = {
    // serializable user auth for constructing RecAPI and RecFileSystem
    recAuth: UserAuth,
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
    // resume the worker
    type: "resume"
} | {
    // exit in the end
    type: "exit"
}

// construct RecAPI and RecFileSystem
const data = workerData as TransferWorkerData;
const { recAuth, panDavAuth } = data;
const api = new RecAPI(recAuth);
const client = createPanDavClient(panDavAuth);

// Worker pause signal
const pauseSignal = new PauseSignal();

// Function to wait if paused
const waitIfPaused = async () => {
    while (pauseSignal.paused) {
        await new Promise(resolve => setTimeout(resolve, 100));
    }
};

parentPort!.on("message", async (msg: TransferWorkerMessage) => {
    try {
        const { type } = msg;

        if (type === "resume") {
            pauseSignal.resume();
            return;
        }

        if (type === "exit") {
            process.exit(0);
        }

        if (type === "task") {
            // Wait if paused before processing task
            await waitIfPaused();

            const { id, diskType, groupId, type, path } = msg.task;
            // if folder, list directory entries and return tasks
            if (type === "folder") {
                try {
                    // execute task - create directory (ignore 409 conflict if already exists)
                    await client.createDirectory(path);
                } catch (error: any) {
                    // Ignore 409 conflict (directory already exists), but fail on other errors
                    if (error.status !== 409) {
                        console.error(`[ERROR] Failed to create directory ${path}:`, error);
                        throw new Error(`Failed to create directory: ${error.message || error}`);
                    }
                    console.log(`[INFO] Directory ${path} already exists, continuing...`);
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
            } else if (type === "file") {
                let retryCount = 0;
                const maxRetries = 3;

                while (retryCount < maxRetries) {
                    try {
                        // execute task
                        const dict = await api.getDownloadUrlByIds([id], groupId);
                        const url = dict[id];
                        console.log(`[INFO] ${path}: transferring (attempt ${retryCount + 1}/${maxRetries})`);

                        // Use the worker's pauseSignal directly for file transfer
                        await downloadToWebDav(url, path, client, (transferred, rate) => {
                            // Don't send progress updates if paused
                            if (!pauseSignal.paused) {
                                parentPort!.postMessage({
                                    type: "progress",
                                    index: msg.index,
                                    path: path,
                                    transferred: transferred,
                                    rate: rate
                                });
                            }
                        }, undefined, pauseSignal);

                        console.log(`[SUCCESS] ${path}: transfer completed`);

                        // return empty tasks
                        parentPort!.postMessage({
                            type: "finish",
                            index: msg.index,
                            tasks: []
                        });
                        break; // Success, exit retry loop
                    } catch (error: any) {
                        retryCount++;
                        console.error(`[ERROR] Failed to transfer file ${path} (attempt ${retryCount}/${maxRetries}):`, error);

                        if (retryCount >= maxRetries) {
                            // After max retries, mark as failed
                            console.error(`[FAILED] Transfer failed after ${maxRetries} attempts for ${path}`);

                            // Send failed message to main thread
                            parentPort!.postMessage({
                                type: "failed",
                                error: `Transfer failed after ${maxRetries} attempts: ${error.message || error}`,
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
        }

    } catch (e: any) {
        // error occurs - this should mark the transfer as failed
        console.error(`[WORKER ERROR] Fatal error in worker:`, e);

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