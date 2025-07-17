import RecAPI, { DiskType, FileType, UserAuth } from "@services/rec-api.js";
import { parentPort, workerData } from "worker_threads";
import { downloadToWebDav } from "@utils/downloader.js";
import { createPanDavClient, PanDavAuth } from "@services/pan-dav.js";

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
    // error occurs
    type: "error",
    error: string
} | {
    // exit in the end
    type: "exit"
}

// construct RecAPI and RecFileSystem
const data = workerData as TransferWorkerData;
const { recAuth, panDavAuth } = data;
const api = new RecAPI(recAuth);
const client = createPanDavClient(panDavAuth);

parentPort!.on("message", async (msg: TransferWorkerMessage) => {
    try {
        const { type } = msg;
        if (type === "task") {
            const { id, diskType, groupId, type, path } = msg.task;
            // if folder, list directory entries and return tasks
            if (type === "folder") {
                // execute task
                client.createDirectory(path);

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
                console.log(`[INFO] ${path}: transferring`);
                await downloadToWebDav(url, path, client);

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
        console.log(e);
        parentPort!.postMessage({
            type: "error",
            error: String(e)
        });
        // exit
        process.exit(1);
    }
});