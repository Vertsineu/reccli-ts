import path from 'path';
import os from 'os';
import RecFileSystem from '@services/rec-file-system';
import PanDavFileSystem from '@services/pan-dav-file-system.js';

// resolve ~ and relative path to absolute path
// replace \ with / in the path
export function resolveFullPath(inputPath: string): string {
    return path.resolve(inputPath.replace(/^~/, os.homedir())).replace(/\\/g, "/");
}

// resolve relative path to absolute path in rec file system
export function resolveRecFullPath(rfs: RecFileSystem, inputPath: string): string {
    const cwd = rfs.pwd();
    const path = inputPath.startsWith("/") ? inputPath : cwd.stat ? cwd.data + "/" + inputPath : inputPath;
    // deal with ".." and "." in the path
    const paths = path.split("/");
    const resolvedPaths: string[] = [];
    for (const p of paths) {
        if (!p || p === ".") continue;
        if (p === "..") {
            if (resolvedPaths.length === 0) continue;
            resolvedPaths.pop();
            continue;
        }
        resolvedPaths.push(p);
    }
    return resolvedPaths.join("/");
}

// resolve relative path to absolute path in pan dav
export function resolvePanDavFullPath(pfs: PanDavFileSystem, inputPath: string): string {
    const cwd = pfs.pwd();
    const path = inputPath.startsWith("/") ? inputPath : cwd.stat ? cwd.data + "/" + inputPath : inputPath;

    // deal with ".." and "." in the path
    const paths = path.split("/");
    const resolvedPaths: string[] = [];
    for (const p of paths) {
        if (!p || p === ".") continue;
        if (p === "..") {
            if (resolvedPaths.length === 0) continue;
            resolvedPaths.pop();
            continue;
        }
        resolvedPaths.push(p);
    }
    return resolvedPaths.join("/");
}