import { PanDavClient } from "./pan-dav-api.js";
import { FileStat } from "webdav";

export type RetType<T> =
    { stat: true, data: T } |
    { stat: false, msg: string }

export type PanDavFile = {
    filename: string;
    basename: string;
    lastmod: string;
    size: number;
    type: "file" | "folder";
    mime?: string;
    etag?: string;
}

// convert FileStat to PanDavFile
function convertFileStat(stat: FileStat): PanDavFile {
    return {
        filename: stat.filename,
        basename: stat.basename,
        lastmod: stat.lastmod,
        size: stat.size,
        type: stat.type === "directory" ? "folder" : stat.type,
        mime: stat.mime || undefined,
        etag: stat.etag || undefined
    };
}

class PanDavFileSystem {
    private cwd: string = "/";

    constructor(
        private client: PanDavClient
    ) { };

    // normalize path to absolute path based on current working directory
    private normalizePath(path: string): string {
        path = path.trim();

        // if path is already absolute, use it as is
        if (path.startsWith("/")) {
            // remove trailing slash (except for root)
            if (path.length > 1 && path.endsWith("/")) {
                path = path.slice(0, -1);
            }
            return path;
        }

        // handle relative paths - start with current working directory
        const cwdParts = this.cwd.split("/").filter(p => p);
        const pathParts = path.split("/").filter(p => p);

        // process each part of the relative path
        for (const part of pathParts) {
            if (part === "." || part === "") {
                // current directory - do nothing
                continue;
            } else if (part === "..") {
                // parent directory - go up one level
                if (cwdParts.length > 0) {
                    cwdParts.pop();
                }
            } else {
                // regular directory/file name - go down one level
                cwdParts.push(part);
            }
        }

        // construct absolute path
        const absolutePath = cwdParts.length === 0 ? "/" : "/" + cwdParts.join("/");

        return absolutePath;
    }

    // split path into directory and filename
    private splitPath(path: string): [string, string] {
        path = this.normalizePath(path);
        const lastSlash = path.lastIndexOf("/");
        if (lastSlash === 0) {
            return ["/", path.slice(1)];
        }
        return [path.slice(0, lastSlash), path.slice(lastSlash + 1)];
    }

    // concat path from directory and filename
    private concatPath(dir: string, name: string): string {
        dir = this.normalizePath(dir);
        if (dir === "/") {
            return "/" + name;
        }
        if (dir.endsWith("/")) {
            return dir + name;
        }
        return dir + "/" + name;
    }

    // list directory contents
    public async ls(src: string): Promise<RetType<PanDavFile[]>> {
        const targetPath = this.normalizePath(src);

        // check if path exists
        if (!await this.client.exists(targetPath)) {
            return {
                stat: false,
                msg: `${targetPath} not found`
            };
        }

        const stat = await this.client.stat(targetPath);
        const statData = "data" in stat ? stat.data : stat;

        // check if it's a directory 
        if (statData.type !== "directory") {
            return {
                stat: false,
                msg: `${targetPath} is not a directory`
            };
        }

        // get directory contents
        const contents = await this.client.getDirectoryContents(targetPath);
        const contentsData = "data" in contents ? contents.data : contents;

        return {
            stat: true,
            data: contentsData.map(convertFileStat)
        };
    }

    // change working directory
    public async cd(path: string): Promise<RetType<void>> {
        const targetPath = this.normalizePath(path);

        // check if path exists
        if (!await this.client.exists(targetPath)) {
            return {
                stat: false,
                msg: `${targetPath} not found`
            };
        }

        // check if path is a directory
        const stat = await this.client.stat(targetPath);
        const statData = "data" in stat ? stat.data : stat;

        if (statData.type !== "directory") {
            return {
                stat: false,
                msg: `${targetPath} is not a directory`
            };
        }

        // change current working directory
        this.cwd = targetPath;

        return {
            stat: true,
            data: undefined
        };
    }

    // get current working directory
    public pwd(): RetType<string> {
        return {
            stat: true,
            data: this.cwd
        };
    }

    // copy file or directory
    public async cp(src: string, dest: string): Promise<RetType<void>> {
        const srcPath = this.normalizePath(src);
        const destPath = this.normalizePath(dest);

        // check if source exists
        if (!await this.client.exists(srcPath)) {
            return {
                stat: false,
                msg: `${srcPath} not found`
            };
        }

        // check if destination exists
        if (!await this.client.exists(destPath)) {
            return {
                stat: false,
                msg: `${destPath} not found`
            };
        }

        // check if destination is root
        if (destPath === "/") {
            return {
                stat: false,
                msg: `cannot copy to root directory (read-only)`
            };
        }

        const destStat = await this.client.stat(destPath);
        const destStatData = "data" in destStat ? destStat.data : destStat

        // check if destination is a directory
        if (destStatData.type !== "directory") {
            return {
                stat: false,
                msg: `destination ${destPath} is not a directory`
            };
        }

        const [srcParentDir, srcName] = this.splitPath(srcPath);

        // copy the file or directory
        await this.client.copyFile(srcPath, this.concatPath(destPath, srcName));

        return {
            stat: true,
            data: undefined
        };
    }

    // move file or directory
    public async mv(src: string, dest: string): Promise<RetType<void>> {
        const srcPath = this.normalizePath(src);
        const destPath = this.normalizePath(dest);

        // check if source exists
        if (!await this.client.exists(srcPath)) {
            return {
                stat: false,
                msg: `${srcPath} not found`
            };
        }

        // check if destination exists
        if (!await this.client.exists(destPath)) {
            return {
                stat: false,
                msg: `${destPath} not found`
            };
        }

        // check if destination is root
        if (destPath === "/") {
            return {
                stat: false,
                msg: `cannot copy to root directory (read-only)`
            };
        }

        const destStat = await this.client.stat(destPath);
        const destStatData = "data" in destStat ? destStat.data : destStat

        // check if destination is a directory
        if (destStatData.type !== "directory") {
            return {
                stat: false,
                msg: `destination ${destPath} is not a directory`
            };
        }

        const [srcParentDir, srcName] = this.splitPath(srcPath);

        // move the file or directory
        await this.client.moveFile(srcPath, this.concatPath(destPath, srcName));

        return {
            stat: true,
            data: undefined
        };
    }

    // remove file or directory
    public async rm(src: string): Promise<RetType<void>> {
        const srcPath = this.normalizePath(src);

        // check if source exists
        if (!await this.client.exists(srcPath)) {
            return {
                stat: false,
                msg: `${srcPath} not found`
            };
        }

        // check if source is root
        if (srcPath === "/") {
            return {
                stat: false,
                msg: `cannot remove root directory (read-only)`
            };
        }

        // check if source is under root directory
        const srcPathParts = srcPath.split("/").filter(p => p);
        if (srcPathParts.length === 1) {
            return {
                stat: false,
                msg: `cannot remove files directly under root directory (read-only)`
            };
        }

        // remove the file or directory
        await this.client.deleteFile(srcPath);

        return {
            stat: true,
            data: undefined
        };
    }

    // create directory
    public async mkdir(src: string): Promise<RetType<void>> {
        const srcPath = this.normalizePath(src);

        // check if directory already exists
        if (await this.client.exists(srcPath)) {
            return {
                stat: false,
                msg: `${srcPath} already exists`
            };
        }

        // check if parent directory exists
        const [parentDir, dirName] = this.splitPath(srcPath);
        if (parentDir !== "/" && !await this.client.exists(parentDir)) {
            return {
                stat: false,
                msg: `parent directory ${parentDir} not found`
            };
        }

        // check if source is root
        if (srcPath === "/") {
            return {
                stat: false,
                msg: `cannot create directory at root (read-only)`
            };
        }

        // check if source is under root directory
        const srcPathParts = srcPath.split("/").filter(p => p);
        if (srcPathParts.length === 1) {
            return {
                stat: false,
                msg: `cannot create directories directly under root directory (read-only)`
            };
        }

        await this.client.createDirectory(srcPath);

        return {
            stat: true,
            data: undefined
        };
    }

    public async unwrap(src: string): Promise<RetType<void>> {
        const srcPath = this.normalizePath(src);

        // check if source exists
        if (!await this.client.exists(srcPath)) {
            return {
                stat: false,
                msg: `${srcPath} not found`
            };
        }

        // check if source is a directory
        const stat = await this.client.stat(srcPath);
        const statData = "data" in stat ? stat.data : stat;
        if (statData.type !== "directory") {
            return {
                stat: false,
                msg: `${srcPath} is not a directory`
            };
        }

        // check if source is root
        if (srcPath === "/") {
            return {
                stat: false,
                msg: `cannot unwrap root directory (read-only)`
            };
        }

        // check if source is under root directory
        const srcPathParts = srcPath.split("/").filter(p => p);
        if (srcPathParts.length === 1) {
            return {
                stat: false,
                msg: `cannot unwrap files directly under root directory (read-only)`
            };
        }

        // first list all contents in the directory
        const contents = await this.client.getDirectoryContents(srcPath);
        const contentsData = "data" in contents ? contents.data : contents;
        // if any file with the same name exists in the parent directory, return error
        const [parentDir, _] = this.splitPath(srcPath);
        const parentContents = await this.client.getDirectoryContents(parentDir);
        const parentContentsData = "data" in parentContents ? parentContents.data : parentContents;
        const existingNames = new Set(parentContentsData.map(item => item.basename));
        if (contentsData.some(item => existingNames.has(item.basename))) {
            return {
                stat: false,
                msg: `file with the same name exists in parent folder of ${srcPath}`
            };
        }

        // then mv all files in the directory to the parent directory
        const moves = contentsData.map(file => {
            const filePath = srcPath + "/" + file.basename;
            const destPath = parentDir;
            return this.client.moveFile(filePath, this.concatPath(destPath, file.basename));
        });
        // wait for all mv to finish and catch result/error
        const results = await Promise.allSettled(moves);
        // if any mv failed, then return the error
        const errors = results.filter(r => r.status === "rejected").map(r => r.reason);
        if (errors.length > 0) {
            return {
                stat: false,
                msg: `unwrap failed: ${errors.join(", ")}`
            };
        }

        // last remove the directory itself
        const [srcParentDir, srcName] = this.splitPath(srcPath);
        await this.client.deleteFile(this.concatPath(srcParentDir, srcName));

        return {
            stat: true,
            data: undefined
        };
    }

    // rename file or directory
    public async rename(src: string, name: string): Promise<RetType<void>> {
        const srcPath = this.normalizePath(src);

        // check if source exists
        if (!await this.client.exists(srcPath)) {
            return {
                stat: false,
                msg: `${srcPath} not found`
            };
        }

        // check if source is root
        if (srcPath === "/") {
            return {
                stat: false,
                msg: `cannot rename root directory`
            };
        }

        // check if source is under root directory
        const [parentDir, currentName] = this.splitPath(srcPath);
        if (parentDir === "/" && currentName === name) {
            return {
                stat: false,
                msg: `cannot rename root directory to itself`
            };
        }

        // construct destination path
        const destPath = this.concatPath(parentDir, name);

        // check if destination already exists
        if (await this.client.exists(destPath)) {
            return {
                stat: false,
                msg: `${destPath} already exists`
            };
        }

        await this.client.moveFile(srcPath, destPath);

        return {
            stat: true,
            data: undefined
        };
    }

    // get file/directory size
    public async du(src: string): Promise<RetType<number>> {
        const targetPath = this.normalizePath(src);

        // check if path exists
        if (!await this.client.exists(targetPath)) {
            return {
                stat: false,
                msg: `${targetPath} not found`
            };
        }

        const calcSize = async (path: string): Promise<number> => {
            const stat = await this.client.stat(path);
            const statData = "data" in stat ? stat.data : stat;

            if (statData.type === "file") {
                return statData.size;
            } else if (statData.type === "directory") {
                // list all files
                const contents = await this.client.getDirectoryContents(path);
                const contentsData = "data" in contents ? contents.data : contents;

                // construct requests
                const requests = contentsData.map(item => calcSize(path + "/" + item.basename));
                // wait for all requests to complete and sum up sizes
                return (await Promise.all(requests)).reduce((acc, size) => acc + size, 0);
            }

            return 0;
        };

        const size = await calcSize(targetPath);

        return {
            stat: true,
            data: size
        };
    }

    // get file/directory information
    public async stat(src: string): Promise<RetType<PanDavFile>> {
        const targetPath = this.normalizePath(src);

        // check if path exists
        if (!await this.client.exists(targetPath)) {
            return {
                stat: false,
                msg: `${targetPath} not found`
            };
        }

        const stat = await this.client.stat(targetPath);
        const statData = "data" in stat ? stat.data : stat;

        return {
            stat: true,
            data: convertFileStat(statData)
        };
    }

    // check if file/directory exists
    public async exists(src: string): Promise<RetType<boolean>> {
        const targetPath = this.normalizePath(src);
        const exists = await this.client.exists(targetPath);

        return {
            stat: true,
            data: exists
        };
    }
};

export default PanDavFileSystem;