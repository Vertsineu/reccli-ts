import RecAPI, { RecAuth, UserAuth } from "@services/rec-api.js";
import { parentPort, workerData } from "worker_threads";
import { downloadToWebDav } from "@utils/downloader.js";
import { createPanDavClient, PanDavAuth, PanDavClient } from "@services/pan-dav-api.js";
import { WorkerBase, WorkerTask } from "@utils/worker-utils.js";

export type TransferWorkerData = {
    // serializable user auth for constructing RecAPI and RecFileSystem
    userAuth: UserAuth,
    recAuth: RecAuth,
    // serializable pan dav auth for constructing PanDavClient
    panDavAuth: PanDavAuth
}

// Concrete implementation of TransferWorker
class TransferWorker extends WorkerBase {
    private api: RecAPI;
    private client: PanDavClient;

    constructor(data: TransferWorkerData) {
        super({ enableSignals: true }); // Enable pause/resume and abort signals
        
        this.api = new RecAPI(data.userAuth, undefined, data.recAuth);
        this.client = createPanDavClient(data.panDavAuth);
    }

    // Handle folder task processing
    protected async processFolderTask(task: WorkerTask, msgIndex: number, retryCount: number, maxRetries: number): Promise<void> {
        const { id, diskType, groupId, path } = task;
        const exists = await this.client.exists(path);

        // if directory already exists, skip creation
        if (exists) {
            console.log(`[INFO] ${path}: directory already exists, skipping...`);
        } else {
            console.log(`[INFO] ${path}: creating directory (attempt ${retryCount + 1}/${maxRetries})`);
            await this.client.createDirectory(path);
            console.log(`[INFO] ${path}: directory created`);
        }

        // construct tasks
        const files = (await this.api.listById(id, diskType, groupId)).datas;
        const tasks = files.map((f: any) => ({
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
    protected async processFileTask(task: WorkerTask, msgIndex: number, retryCount: number, maxRetries: number): Promise<void> {
        const { id, groupId, path } = task;
        
        // execute task
        const dict = await this.api.getDownloadUrlByIds([id], groupId);
        const url = dict[id];

        transfer: do {
            do {
                const exists = await this.client.exists(path);

                // if not exist, then transfer
                if (!exists) break;

                const stat = await this.client.stat(path);
                const currentSize = "data" in stat ? stat.data.size : stat.size;
                const info = await this.api.getFileInfo({ id, type: "file" }, groupId);
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
            await downloadToWebDav(url, path, this.client, (transferred, rate) => {
                parentPort!.postMessage({
                    type: "progress",
                    index: msgIndex,
                    path: path,
                    transferred: transferred,
                    rate: rate
                });
            }, this.abortSignal, this.pauseSignal);
            console.log(`[INFO] ${path}: transfer completed`);
        } while (false);

        // return empty tasks
        parentPort!.postMessage({
            type: "finish",
            index: msgIndex,
            tasks: []
        });
    }
}

// Initialize the worker
const data = workerData as TransferWorkerData;
new TransferWorker(data);