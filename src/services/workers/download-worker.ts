import RecAPI, { DiskType, FileType, UserAuth } from "@services/rec-api.js";
import { parentPort, workerData } from "worker_threads";
import fs from "fs";
import { downloadFile } from "@utils/downloader.js";

export type DownloadWorkerData = {
    // serializable user auth for constructing RecAPI and RecFileSystem
    auth: UserAuth
}

// before execution, path doesn't exist
export type DownloadTask = {
    // identify the file
    id: string,
    diskType: DiskType,
    groupId?: string,
    type: FileType,
    // path in local file system
    path: string
}

export type DownloadWorkerMessage = {
    // receive a task
    type: "task",
    index: number,
    task: DownloadTask
} | {
    // finish a task and return recursive tasks
    type: "finish",
    // which thread finished the task
    index: number,
    tasks: DownloadTask[]
} | {
    // error occurs
    type: "error",
    error: string
} | {
    // exit in the end
    type: "exit"
}

// construct RecAPI and RecFileSystem
const data = workerData as DownloadWorkerData;
const { auth } = data;
const api = new RecAPI(auth);

parentPort!.on("message", async (msg: DownloadWorkerMessage) => {
    try {
        const { type } = msg;
        if (type === "task") {
            const { id, diskType, groupId, type, path } = msg.task;
            // if folder, list directory entries and return tasks
            if (type === "folder") {
                // execute task
                fs.mkdirSync(path);

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
                // execute task
                const dict = await api.getDownloadUrlByIds([id], groupId);
                const url = dict[id];
                console.log(`[INFO] ${path}: downloading`);
                await downloadFile(url, path);

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
        // error occurs
        parentPort!.postMessage({
            type: "error",
            error: String(e)
        });
        // exit
        process.exit(1);
    }
});