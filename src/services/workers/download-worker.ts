import RecAPI, { RecAuth, UserAuth } from "@services/rec-api.js";
import { workerData, parentPort } from "worker_threads";
import fs from "fs";
import { downloadFile } from "@utils/downloader.js";
import { WorkerTask, WorkerBase } from "@utils/worker-utils.js";

export type DownloadWorkerData = {
    // serializable user auth for constructing RecAPI and RecFileSystem
    userAuth: UserAuth,
    recAuth: RecAuth
}

class DownloadWorker extends WorkerBase {
    private api: RecAPI;

    constructor(data: DownloadWorkerData) {
        // Enable signals for download worker (supports pause/resume/abort)
        super({ enableSignals: true });
        
        const { userAuth, recAuth } = data;
        this.api = new RecAPI(userAuth, undefined, recAuth);
    }

    // Handle folder task processing
    protected async processFolderTask(task: WorkerTask, msgIndex: number, retryCount: number, maxRetries: number): Promise<void> {
        const { id, diskType, groupId, path } = task;

        // if directory already exists, skip creation
        if (fs.existsSync(path)) {
            console.log(`[INFO] ${path}: directory already exists, skipping...`);
        } else {
            console.log(`[INFO] ${path}: creating directory (attempt ${retryCount + 1}/${maxRetries})`);
            fs.mkdirSync(path, { recursive: true });
            console.log(`[INFO] ${path}: directory created`);
        }

        // construct tasks
        const files = (await this.api.listById(id, diskType, groupId)).datas;
        // Sort files: folders first, then files, both sorted by name
        files.sort((a, b) => {
            if (a.type !== b.type) {
                return a.type === "folder" ? -1 : 1;
            }
            return a.name.localeCompare(b.name);
        });
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
    protected async processFileTask(task: WorkerTask, msgIndex: number, retryCount: number, maxRetries: number): Promise<void> {
        const { id, groupId, path } = task;

        // execute task
        const dict = await this.api.getDownloadUrlByIds([id], groupId);
        const url = dict[id];

        download: do {
            do {
                // if file already exists, check size
                if (!fs.existsSync(path)) break;

                const currentSize = fs.statSync(path).size;
                const info = await this.api.getFileInfo({ id, type: "file" }, groupId);
                const expectedSize = info.bytes;

                // log size check
                console.log(`[INFO] ${path}: exists with size ${currentSize}, expected ${expectedSize}`);

                // if size matches, skip download
                if (currentSize === expectedSize) {
                    console.log(`[INFO] ${path}: file already downloaded completely, skipping...`);
                    parentPort!.postMessage({
                        type: "progress",
                        index: msgIndex,
                        path: path,
                        transferred: currentSize,
                        rate: 0
                    });
                    break download;
                }

                // if partial file exists, remove it for clean restart
                console.log(`[INFO] ${path}: partial file detected, removing for clean restart`);
                fs.unlinkSync(path);
            } while (false);

            console.log(`[INFO] ${path}: downloading (attempt ${retryCount + 1}/${maxRetries})`);
            // Download file with pause/abort support
            await downloadFile(url, path, (transferred, rate) => {
                parentPort!.postMessage({
                    type: "progress",
                    index: msgIndex,
                    path: path,
                    transferred,
                    rate
                });
            }, this.abortSignal, this.pauseSignal);
            console.log(`[INFO] ${path}: download completed`);
        } while (false);

        // return empty tasks
        parentPort!.postMessage({
            type: "finish",
            index: msgIndex,
            tasks: []
        });
    }
}

// Create worker instance
const data = workerData as DownloadWorkerData;
new DownloadWorker(data);
