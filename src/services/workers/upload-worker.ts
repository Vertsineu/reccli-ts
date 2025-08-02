import RecAPI, { RecAuth, UserAuth } from "@services/rec-api.js";
import { parentPort, workerData } from "worker_threads";
import fs from "fs";
import { WorkerTask, WorkerBase } from "@utils/worker-utils.js";

export type UploadWorkerData = {
    // serializable user auth for constructing RecAPI and RecFileSystem  
    userAuth: UserAuth,
    recAuth: RecAuth
}

class UploadWorker extends WorkerBase {
    private api: RecAPI;

    constructor(data: UploadWorkerData) {
        // Disable signals for upload worker (no pause/resume/abort support)
        super({ enableSignals: false });
        
        const { userAuth, recAuth } = data;
        this.api = new RecAPI(userAuth, undefined, recAuth);
    }

    // Handle folder task processing
    protected async processFolderTask(task: WorkerTask, msgIndex: number, retryCount: number, maxRetries: number): Promise<void> {
        const { id, diskType, groupId, path } = task;
        
        const name = path.split("/").pop()!;
        let folderId = id;

        // Check if folder already exists in remote parent folder
        const folderFiles = (await this.api.listById(id, diskType, groupId)).datas;
        const existingFolder = folderFiles.find(f => f.type === "folder" && f.name === name);

        if (existingFolder) {
            // Folder already exists, use existing folder ID
            console.log(`[INFO] ${path}: directory already exists, using existing one`);
            folderId = existingFolder.number;
        } else {
            // Create new folder
            console.log(`[INFO] ${path}: creating directory (attempt ${retryCount + 1}/${maxRetries})`);
            const res = await this.api.mkdirByFolderIds(id, [name], diskType, groupId);
            folderId = res[0].number;
            console.log(`[INFO] ${path}: directory created`);
        }

        // construct tasks using the folder ID (either existing or newly created)
        const files = fs.readdirSync(path);
        // Sort files: folders first, then files, both sorted by name
        files.sort((a, b) => {
            const statsA = fs.statSync(path + "/" + a);
            const statsB = fs.statSync(path + "/" + b);
            const typeA = statsA.isDirectory() ? "folder" : "file";
            const typeB = statsB.isDirectory() ? "folder" : "file";
            
            if (typeA !== typeB) {
                return typeA === "folder" ? -1 : 1;
            }
            return a.localeCompare(b);
        });
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
    protected async processFileTask(task: WorkerTask, msgIndex: number, retryCount: number, maxRetries: number): Promise<void> {
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
                const folderFiles = (await this.api.listById(id, diskType, groupId)).datas;
                const existingFile = folderFiles.find(f => f.type === "file" && 
                    (f.file_ext ? f.name + "." + f.file_ext : f.name) === fileName);

                if (!existingFile) break;

                // Get remote file info
                const remoteInfo = await this.api.getFileInfo({ id: existingFile.number, type: "file" }, groupId);
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
            await this.api.uploadByFolderId(id, path, diskType, groupId);
            console.log(`[INFO] ${path}: upload completed`);
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
const data = workerData as UploadWorkerData;
new UploadWorker(data);