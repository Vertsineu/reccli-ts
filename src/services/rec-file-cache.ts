import { FileType } from "@services/rec-api"

// cache file tree
export type CacheFile = { 
    name: string,
    type: FileType,
    // if type is file, it surly be undefined
    // if type if folder, when it's undefined, it means it's not loaded yet
    // when it's an empty array, it means it's loaded but it's an empty folder
    children: CacheFile[] | undefined
}

export class RecFileCache {
    private root: CacheFile = {
        name: "/",
        type: "folder",
        children: undefined
    }

    constructor() {}

    // path must be absolute path!
    // path can be file or folder
    // clear the parent folder of the file
    // if not exists, clear the root
    public clearCache(filePath?: string): void {
        if (!filePath) {
            this.root.children = undefined;
            return;
        }

        const path = filePath.split("/").filter(Boolean);
        let current = this.root;
        for (const name of path.slice(0, -1)) {
            // if doesn't exist, do nothing
            if (!current.children) return;
            const next = current.children.find(child => child.name === name);
            if (!next) return;
            current = next;
        }
        current.children = undefined;
    }

    // path must be absolute path!
    // path must be a folder exists and children can exist or not
    // if children doesn't exist, return undefined
    public listCacheFolder(folderPath: string): CacheFile[] | undefined {
        const path = folderPath.split("/").filter(Boolean);
        let current = this.root;
        for (const name of path) {
            // if doesn't exist, return undefined
            if (!current.children) return undefined;
            const next = current.children.find(child => child.name === name);
            if (!next) return undefined;
            current = next;
        }
        return current.children;
    }

    // path must be absolute path!
    // path must be a folder exists but children must be undefined
    public updateCacheFolder(folderPath: string, files: CacheFile[]): void {
        // check if children is undefined
        if (files.some(f => f.children !== undefined)) {
            throw new Error("Children of a folder must be undefined");
        }

        const path = folderPath.split("/").filter(Boolean);
        let current = this.root;
        for (const name of path) {
            // if doesn't exist, do nothing
            if (!current.children) return;
            const next = current.children.find(child => child.name === name);
            if (!next) return;
            current = next;
        }
        current.children = files;
    }

    
}