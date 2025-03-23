import RecAPI, { DiskType, FileType } from "@services/rec-api.js";
import fs from "fs";
import { downloadFile } from "@utils/downloader.js";

export type Role = {
    label: string,
    download: boolean,
    upload: boolean
}

// download not only means download, but also means save to cloud, etc.
// upload not only means upload, but also means rename, etc.
export const roles = [
    { label: "无权限", download: false, upload: false },  // 无权限
    { label: "拥有者", download: true, upload: true },    // 拥有者
    { label: "上传下载", download: true, upload: true },    // 上传下载
    { label: "仅下载", download: true, upload: false },   // 仅下载
    // can only download file self uploaded
    { label: "仅上传", download: true, upload: true },    // 仅上传
    { label: "仅预览", download: false, upload: false },  // 仅预览
    { label: "发布", download: true, upload: true},     // 发布
    { label: "管理者", download: true, upload: true },    // 管理者
]

export type RecFile = {
    id: string,
    disk_type: DiskType,
    role: Role,
    groupId?: string,

    name: string,
    size: number,
    type: FileType
    creator: string,
    lastModified: string
}

export type RetType<T> = 
    { stat: true, data: T } |
    { stat: false, msg: string }

const cloudRoot: RecFile = {
    id: "0",
    disk_type: "cloud",
    role: roles[1],

    name: "cloud",
    size: 0,
    type: "folder",
    creator: "",
    lastModified: "",
};
const recycleRoot: RecFile = {
    id: "0",
    disk_type: "recycle",
    role: roles[0],

    name: "recycle",
    size: 0,
    type: "folder",
    creator: "",
    lastModified: "",
};
const backupRoot: RecFile = {
    id: "0",
    disk_type: "backup",
    role: roles[1],

    name: "backup",
    size: 0,
    type: "folder",
    creator: "",
    lastModified: "",
};
const groupRoot: RecFile = {
    id: "0",
    disk_type: "cloud",
    role: roles[0],

    name: "group",
    size: 0,
    type: "folder",
    creator: "",
    lastModified: "",
};

const rootFolders: RecFile[] = [
    cloudRoot, recycleRoot, backupRoot, groupRoot
] as const;

// need to catch error self
class RecFileSystem {
    // 从根目录开始的当前路径
    private cwd: RecFile[] = [];

    constructor(
        private api: RecAPI
    ) {}

    // calcPath can be a file or a folder
    private async calcPath(path: string): Promise<RecFile[] | null> {
        // copy the current cwd
        let cwd = [...this.cwd];
        // first trim the path
        path = path.trim();
        // if begin with /, then go to root
        if (path.startsWith("/")) {
            cwd = [];
            path = path.slice(1);
        }
        // split the path by /
        const paths = path.split("/");
        // for each path, check if it is a folder, and add it to cwd
        for (const p of paths) {
            // if p is empty or p === ".", continue
            if (!p || p === ".") continue;
            // if p === "..", then go back
            if (p === "..") {
                if (cwd.length === 0) continue;
                cwd.pop();
                continue;
            }
            // list all files in current folder
            const files = await this.lsc(cwd);
            // if ls failed, return null
            if (!files.stat) return null;
            const file = files.data.find(f => f.name === p);
            // if not found, return null
            if (!file) return null;
            cwd.push(file);
        }

        return cwd;
    }

    // splicePath can splice the last part of path
    private splicePath(path: string): [string, string] {
        path = path.trim();
        const index = path.lastIndexOf("/");
        if (index === -1) return ["", path];
        return [path.slice(0, index), path.slice(index + 1)];
    }

    // get current working directory
    public pwd(): RetType<string> {
        return {
            stat: true, 
            data: "/" + this.cwd.map(f => f.name).join("/")
        };
    }

    // only function to get the hierarchy of files
    private async lsc(cwd?: RecFile[]): Promise<RetType<RecFile[]>> {
        // 如果没有传入 cwd，则使用当前路径
        cwd = cwd || this.cwd;
        if (cwd.length === 0) {
            // 根目录，规定只有 cloud, recycle, backup, group 四个目录
            return {
                stat: true,
                data: rootFolders
            };
        }
        // 当前目录为 group，需要列举出所有 group
        if (cwd.length == 1 && cwd[0] == groupRoot) {
            const groups = await this.api.getGroups();
            return {
                stat: true,
                data: groups.datas.map(g => ({
                    id: "0",
                    disk_type: "cloud",
                    role: roles[0],
                    groupId: g.group_number,

                    name: g.group_name,
                    size: 0,
                    type: "folder",
                    creator: "",
                    lastModified: ""
                }))
            };
        }
        // 如果当前目录是 /group/xxx/，则需要获取权限
        if (cwd.length == 2 && cwd[0] == groupRoot) {
            const group = cwd[1]; // current group
            const folders = await this.api.listById(group.id, group.disk_type, group.groupId);
            // array of roles
            const roleIdPairArray: {id: string, role: Role}[] = (await this.api.getPrivilegeByGroupId(group.groupId!)).resource_operations.map(r => ({
                id: r.folder_id,
                role: roles[r.role_type]
            }));
            // dict of roles
            const roleIdPairDict: {[key: string]: Role} = {};
            for (const roleIdPair of roleIdPairArray) {
                roleIdPairDict[roleIdPair.id] = roleIdPair.role;
            }

            return {
                stat: true,
                data: folders.datas.map(f => ({
                    id: f.number,
                    disk_type: f.disk_type,
                    role: roleIdPairDict[f.number] || roles[0], // get role from privilege, default to 0
                    groupId: group.groupId, // extend groupId
                    // if file, add file extension, otherwise, just name
                    name: f.type === "folder" ? f.name : f.file_ext ? f.name + "." + f.file_ext : f.name,
                    size: Number(f.bytes),
                    type: f.type,
                    creator: f.creater_user_real_name,
                    lastModified: f.last_update_date
                }))
            }
        }
        if (cwd[cwd.length - 1].type !== "folder") return {
            stat: false,
            msg: "current working directory is not a folder"
        };

        // get current folder id
        const folder = cwd[cwd.length - 1];
        const files = await this.api.listById(folder.id, folder.disk_type, folder.groupId);
        return {
            stat: true,
            data: files.datas.map(f => ({
                id: f.number,
                disk_type: f.disk_type,
                role: folder.role, // extend role
                groupId: folder.groupId, // extend groupId
                // if file, add file extension, otherwise, just name
                name: f.type === "folder" ? f.name : f.file_ext ? f.name + "." + f.file_ext : f.name,
                size: Number(f.bytes),
                type: f.type,
                creator: f.creater_user_real_name,
                lastModified: f.last_update_date
            }))
        };
    }

    public async ls(src: string): Promise<RetType<RecFile[]>> {
        const path = await this.calcPath(src);
        if (!path) return {
            stat: false,
            msg: `${src} not found`
        };
        return this.lsc(path);
    }

    public async cd(src: string): Promise<RetType<void>> {
        const path = await this.calcPath(src);
        // if path is null or path is a file, then cd failed
        if (!path || (path.length !== 0 && path[path.length - 1].type !== "folder")) 
            return {
                stat: false,
                msg: `${src} is not a folder`
            };
        // else set path to new path
        this.cwd = path;
        return { stat: true, data: undefined };
    }

    // dest can be a folder, if file, return false
    public async cp(src: string, dest: string): Promise<RetType<void>> {
        const srcPath = await this.calcPath(src);
        if (!srcPath || srcPath.length === 0) return {
            stat: false,
            msg: `${src} not found`
        };
        const destPath = await this.calcPath(dest);
        if (!destPath || destPath.length === 0) return {
            stat: false,
            msg: `${dest} not found`
        };

        const srcFile = srcPath[srcPath.length - 1];
        const destFolder = destPath[destPath.length - 1];
        // if destFolder is not a folder, then cp failed
        if (destFolder.type !== "folder") return {
            stat: false,
            msg: `${dest} is not a folder`
        };

        // if srcFile is root folder, then cp failed
        if (srcFile.id === "0") return {
            stat: false,
            msg: `cannot copy root folder`
        };

        // if destFolder is group, then cp failed
        if (destFolder === groupRoot) return {
            stat: false,
            msg: `cannot copy to group root folder`
        };

        // if groupId is different, then cp failed
        if (srcFile.groupId !== destFolder.groupId) return {
            stat: false,
            msg: `cannot copy between different groups`
        };

        // if srcFile or destFolder is recycle, then cp failed, you should use restore or recycle
        if (srcPath[0].disk_type === "recycle" || destPath[0].disk_type === "recycle") return {
            stat: false,
            msg: `cannot copy to or from recycle`
        };

        // if destFolder is backup, then cp failed
        if (destPath[0].disk_type === "backup") return {
            stat: false,
            msg: `cannot copy to backup`
        };

        // if destFolder is or is subfolder of srcFolder, then cp failed
        if (destPath.length >= srcPath.length && destPath.slice(0, srcPath.length).every((f, i) => f.id === srcPath[i].id)) return {
            stat: false,
            msg: `cannot copy to or into subfolder`
        };

        await this.api.operationByIdType("copy", [{id: srcFile.id, type: srcFile.type}], destFolder.id, destFolder.disk_type, destFolder.groupId);

        return {
            stat: true,
            data: undefined
        };
    }

    // dest should be a folder, if file, return false
    public async mv(src: string, dest: string): Promise<RetType<void>> {
        const srcPath = await this.calcPath(src);
        if (!srcPath || srcPath.length === 0) return {
            stat: false,
            msg: `${src} not found`
        };
        const destPath = await this.calcPath(dest);
        if (!destPath || destPath.length === 0) return {
            stat: false,
            msg: `${dest} not found`
        };

        const srcFile = srcPath[srcPath.length - 1];
        const destFolder = destPath[destPath.length - 1];
        // if destFolder is not a folder, then mv failed
        if (destFolder.type !== "folder") return {
            stat: false,
            msg: `${dest} is not a folder`
        };

        // if srcFile is root folder, then mv failed
        if (srcFile.id === "0") return {
            stat: false,
            msg: `cannot move root folder`
        };

        // if destFolder is group, then mv failed
        if (destFolder === groupRoot) return {
            stat: false,
            msg: `cannot move to group root folder`
        };

        // if groupId is different, then mv failed
        if (srcFile.groupId !== destFolder.groupId) return {
            stat: false,
            msg: `cannot move between different groups`
        };

        // if srcFile or destFolder is recycle, then mv failed, you should use restore or recycle
        if (srcPath[0].disk_type === "recycle" || destPath[0].disk_type === "recycle") return {
            stat: false,
            msg: `cannot move to or from recycle`
        };

        // if destFolder is backup, then mv failed
        if (destPath[0].disk_type === "backup") return {
            stat: false,
            msg: `cannot move to backup`
        };
        
        // if destFolder is or is subfolder of srcFolder, then mv failed
        if (destPath.length >= srcPath.length && destPath.slice(0, srcPath.length).every((f, i) => f.id === srcPath[i].id)) return {
            stat: false,
            msg: `cannot move to or into subfolder`
        };

        await this.api.operationByIdType("move", [{id: srcFile.id, type: srcFile.type}], destFolder.id, destFolder.disk_type, destFolder.groupId);

        return {
            stat: true,
            data: undefined
        };
    }

    public async rm(src: string): Promise<RetType<void>> {
        const path = await this.calcPath(src);
        // if path is null or path is root, then rm failed
        if (!path || path.length === 0) return {
            stat: false,
            msg: `${src} not found`
        };
        const file = path[path.length - 1];
        // if path is a root folder or groupRoot, then rm failed
        if (file.id === "0" || file === groupRoot) return {
            stat: false,
            msg: `cannot remove root folder or group root folder`
        };

        await this.api.operationByIdType("delete", [{id: file.id, type: file.type}], undefined, file.disk_type, file.groupId);
        
        return {
            stat: true,
            data: undefined
        };
    }

    public async recycle(src: string): Promise<RetType<void>> {
        const path = await this.calcPath(src);
        // if path is null or path is root, then recycle failed
        if (!path || path.length === 0) return {
            stat: false,
            msg: `${src} not found`
        };
        const file = path[path.length - 1];
        // if path is a root folder or groupRoot, then recycle failed
        if (file.id === "0" || file === groupRoot) return {
            stat: false,
            msg: `cannot recycle root folder or group root folder`
        };
        // if path in recycle, then recycle failed
        if (path[0].disk_type === "recycle") return {
            stat: false,
            msg: `cannot recycle a file in recycle`
        };
        // if groupId is not empty, then recycle failed
        if (file.groupId) return {
            stat: false,
            msg: `cannot recycle a file in group`
        };


        await this.api.operationByIdType("recycle", [{id: file.id, type: file.type}], undefined, file.disk_type, file.groupId);
        
        return {
            stat: true,
            data: undefined
        };
    }

    // dest should be a folder, if file, return false
    public async restore(src: string, dest: string): Promise<RetType<void>> {
        const srcPath = await this.calcPath(src);
        if (!srcPath || srcPath.length === 0) return {
            stat: false,
            msg: `${src} not found`
        };
        const destPath = await this.calcPath(dest);
        if (!destPath || destPath.length === 0) return {
            stat: false,
            msg: `${dest} not found`
        };

        const srcFile = srcPath[srcPath.length - 1];
        const destFolder = destPath[destPath.length - 1];

        // if destFolder is not a folder, then cp failed
        if (destFolder.type !== "folder") return {
            stat: false,
            msg: `${dest} is not a folder`
        };

        // if srcFile or destFolder is root folder, then cp failed
        if (srcFile.id === "0" || destFolder.id === "0") return {
            stat: false,
            msg: `cannot restore root folder`
        };

        // if srcFile is not in recycle or destFolder is in recycle, then restore failed
        if (srcPath[0].disk_type !== "recycle" || destFolder.disk_type === "recycle") return {
            stat: false,
            msg: `cannot restore a file not in recycle or restore to recycle`
        };

        // if destFolder is backup, then restore failed
        if (destPath[0].disk_type === "backup") return {
            stat: false,
            msg: `cannot restore to backup`
        };

        // if groupId is different, then cp failed
        if (srcFile.groupId !== destFolder.groupId) return {
            stat: false,
            msg: `cannot restore between different groups`
        };

        await this.api.operationByIdType("restore", [{id: srcFile.id, type: srcFile.type}], destFolder.id, destFolder.disk_type, destFolder.groupId);

        return {
            stat: true,
            data: undefined
        };
    }

    public async rename(src: string, name: string): Promise<RetType<void>> {
        const path = await this.calcPath(src);
        // if path is null or path is root, then rename failed
        if (!path || path.length === 0) return {
            stat: false,
            msg: `${src} not found`
        };
        const file = path[path.length - 1];
        // if path is a root folder or groupRoot, then rename failed
        if (file.id === "0" || file === groupRoot) return {
            stat: false,
            msg: `cannot rename root folder or group root folder`
        };

        // if name is empty, then rename failed
        if (!name) return {
            stat: false,
            msg: `file name is empty`
        };

        if (file.type == "file")
            await this.api.renameByIdExt({id: file.id, type: file.type}, name, file.groupId);
        else if (file.type == "folder")
            await this.api.renameByIdType({id: file.id, type: file.type}, name, file.groupId);

        return {
            stat: true,
            data: undefined
        };
    }

    public async mkdir(src: string): Promise<RetType<void>> {
        // first splice the path and get the path and name
        const [path, name] = this.splicePath(src);

        // if name is empty, then mkdir failed
        if (!name) return {
            stat: false,
            msg: `folder name is empty`
        };

        const cwd = await this.calcPath(path);
        // if cwd is null or cwd is root, then mkdir failed
        if (!cwd || cwd.length === 0) return {
            stat: false,
            msg: `${path} not found`
        };
        // if cwd is in recycle, then mkdir failed
        if (cwd[0].disk_type === "recycle") return {
            stat: false,
            msg: `cannot make folder in recycle`
        };

        const file = cwd[cwd.length - 1];
        // if cwd is null or cwd is a root folder or groupRoot, then mkdir failed
        if (file === groupRoot) return {
            stat: false,
            msg: `cannot make folder in group root folder`
        };

        await this.api.mkdirByFolderIds(file.id, [name], file.disk_type, file.groupId);

        return {
            stat: true,
            data: undefined
        };
    }

    public async upload(src: string, dest: string): Promise<RetType<void>> {
        const path = await this.calcPath(dest);
        // if path is null or path is root, then upload failed
        if (!path || path.length === 0) return {
            stat: false,
            msg: `${dest} not found`
        };
        const folder = path[path.length - 1];
        // if path is groupRoot, then upload failed
        if (folder === groupRoot) return {
            stat: false,
            msg: `cannot upload to group root folder`
        };
        // if path is backupRoot, then upload failed
        if (folder === backupRoot) return {
            stat: false,
            msg: `cannot upload to backup root folder`
        };
        // if path is not a folder, then upload failed
        if (folder.type !== "folder") return {
            stat: false,
            msg: `${dest} is not a folder`
        };
        // if has no upload permission, then upload failed
        if (!folder.role.upload) return {
            stat: false,
            msg: `no upload permission`
        };

        // if src is not a file, then upload failed
        try {
            const stats = fs.statSync(src);
            if (!stats.isFile()) return {
                stat: false,
                msg: `${src} is not a file`
            };
        } catch (e) {
            return {
                stat: false,
                msg: String(e)
            };
        }

        await this.api.uploadByFolderId(folder.id, src, folder.disk_type, folder.groupId);

        return {
            stat: true,
            data: undefined
        };
    }

    // dest can be a file or a folder
    // if dest is a folder, treat as a folder, download with the name of src
    // if dest not exist, try make a file, if failed, then download failed
    public async download(src: string, dest: string): Promise<RetType<void>> {
        const path = await this.calcPath(src);
        // if path is null or path is root, then download failed
        if (!path || path.length === 0) return {
            stat: false,
            msg: `${src} not found`
        };
        const file = path[path.length - 1];
        // if path is a root folder or groupRoot, then download failed
        if (file.id === "0" || file === groupRoot) return {
            stat: false,
            msg: `cannot download root folder or group root folder`
        };
        // if path is a folder, then download failed
        if (file.type === "folder") return {
            stat: false,
            msg: `${src} is a folder`
        };
        // if path is in recycle, then download failed
        if (path[0].disk_type === "recycle") return {
            stat: false,
            msg: `cannot download a file in recycle`
        };
        // if has no download permission, then download failed
        if (!file.role.download) return {
            stat: false,
            msg: `no download permission`
        };

        // if dest is not a folder, then download failed
        try {
            if (!fs.existsSync(dest)) {
                // if dest not exist, try make a file
                fs.closeSync(fs.openSync(dest, "w"));
            }
            const stats = fs.statSync(dest);
            if (stats.isDirectory()) {
                // if dest is a folder, then download with the name of src
                dest = dest + (dest.endsWith("/") ? "" : "/") + file.name;
                // touch the file
                fs.closeSync(fs.openSync(dest, "w"));
            }
        } catch (e) {
            return {
                stat: false,
                msg: String(e)
            };
        }

        const dict = await this.api.getDownloadUrlByIds([file.id], file.groupId);
        const url = dict[file.id];

        // download file using url
        await downloadFile(url, dest);

        return {
            stat: true,
            data: undefined
        };
    }

    // save from group to cloud
    public async save(src: string, dest: string): Promise<RetType<void>> {
        const srcPath = await this.calcPath(src);
        // if path is null or path is root, then save failed
        if (!srcPath || srcPath.length === 0) return {
            stat: false,
            msg: `${src} not found`
        };
        // if path is not in group, then save failed
        if (srcPath.length <= 2 || srcPath[0] !== groupRoot) return {
            stat: false,
            msg: `${src} is not in group`
        };

        const destPath = await this.calcPath(dest);
        // if path is null or path is root, then save failed
        if (!destPath || destPath.length === 0) return {
            stat: false,
            msg: `${dest} not found`
        };
        // if path is not in cloud, then save failed
        if (destPath[0].disk_type !== "cloud") return {
            stat: false,
            msg: `${dest} is not in cloud`
        };

        const srcFile = srcPath[srcPath.length - 1];
        // if has no download permission, then save failed
        if (!srcFile.role.download) return {
            stat: false,
            msg: `no download permission`
        };
        

        const destFolder = destPath[destPath.length - 1];
        // if destFolder is not a folder, then save failed
        if (destFolder.type !== "folder") return {
            stat: false,
            msg: `${dest} is not a folder`
        };

        await this.api.saveToCloud([{id: srcFile.id, type: srcFile.type}], destFolder.id, srcFile.groupId!);

        return {
            stat: true,
            data: undefined
        };
    }

    public async whoami(): Promise<RetType<{
        gid: string
        name: string,
        email: string,
    }>> {
        const user = await this.api.getUserInfo();
        return {
            stat: true,
            data: {
                gid: user.gid,
                name: user.name,
                email: user.email
            }
        };
    }

    public async groups(): Promise<RetType<{
        number: string,
        name: string,
        createTime: string,
        category: string,
        owner: string,
        members: number
    }[]>> {
        const groups = await this.api.getGroups();
        return {
            stat: true,
            data: groups.datas.map(g => ({
                number: g.group_number,
                name: g.group_name,
                createTime: g.group_created_date,
                category: g.group_category_name,
                owner: g.group_owner_name,
                members: g.group_memeber_count
            }))
        };
    }

    // get space info
    public async df(): Promise<RetType<{
        user: {
            usedBytes: number,
            totalBytes: number,
        },
        group: {
            usedBytes: number,
            totalBytes: number,
        }
    }>> {
        const res = await this.api.getSpaceInfo();
        return {
            stat: true,
            data: {
                user: {
                    usedBytes: res.self_used_space,
                    totalBytes: res.self_total_space,
                },
                group: {
                    usedBytes: res.group_used_space,
                    totalBytes: res.group_total_space,
                }
            }
        };
    }

}

export default RecFileSystem;