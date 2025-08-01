import RecAPI, { DiskType, FileType, UserAuth } from "@services/rec-api.js"
import { parentPort, workerData } from "worker_threads"
import fs from "fs";

export type UploadWorkerData = {
    // serializable user auth for constructing RecAPI and RecFileSystem
    auth: UserAuth
}

// before execution, remote file doesn't exist
export type UploadTask = {
    // identify the file
    id: string,
    diskType: DiskType,
    groupId?: string,
    type: FileType,
    // path in local file system
    path: string
}

export type UploadWorkerMessage = {
    // receive a task
    type: "task",
    index: number,
    task: UploadTask
} | {
    // finish a task and return recursive tasks
    type: "finish",
    // which thread finished the task
    index: number,
    tasks: UploadTask[]
} | {
    // error occurs
    type: "error",
    error: string
} | {
    // exit in the end
    type: "exit"
}

// construct RecAPI and RecFileSystem
const data = workerData as UploadWorkerData;
const { auth } = data;
const api = new RecAPI(auth);

parentPort!.on("message", async (msg: UploadWorkerMessage) => {
    try {
        const { type } = msg;
        if (type === "task") {
            const { id, diskType, groupId, type, path } = msg.task;

            // if folder, list directory entries and return tasks
            if (type === "folder") {
                // execute task
                const name = path.split("/").pop()!;
                const res = await api.mkdirByFolderIds(id, [name], diskType, groupId);

                // construct tasks
                const files = fs.readdirSync(path);
                // log list files
                const tasks = files.map(f => {
                    const p = path + "/" + f;
                    const stats = fs.statSync(p);
                    return {
                        id: res[0].number,
                        diskType: diskType,
                        groupId: groupId,
                        type: stats.isDirectory() ? "folder" : "file",
                        path: p
                    };
                });

                // return tasks
                parentPort!.postMessage({
                    type: "finish",
                    index: msg.index,
                    tasks: tasks
                });
                
            } else if (type === "file") {
                // execute task
                const stats = fs.statSync(path);
                // if empty file, leave out
                if (stats.size !== 0) {
                    console.log(`[INFO] ${path}: uploading`);
                    await api.uploadByFolderId(id, path, diskType, groupId);
                } else {
                    console.warn(`[WARN] ${path}: empty file will be ignored`);
                }

                // return empty tasks
                parentPort!.postMessage({
                    type: "finish",
                    index: msg.index,
                    tasks: []
                });
            }

        } else if (type === "exit") {
            // exit
            process.exit(0);
        }
    } catch (e) {
        parentPort!.postMessage({ 
            type: "error", 
            error: String(e)
        });
        // exit
        process.exit(0);
    }
});