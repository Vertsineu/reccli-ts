import fs from 'fs/promises';
import { Stats } from 'fs';
import path from 'path';
import os from 'os';
import * as drivelist from 'drivelist';

export type RetType<T> =
    { stat: true, data: T } |
    { stat: false, msg: string }

export interface LocalFile {
    name: string;
    type: 'file' | 'directory';
    size: number;
    modifiedAt: string;
}

// convert fs.Stats to LocalFile
function convertStat(name: string, stat: Stats): LocalFile {
    return {
        name,
        type: stat.isDirectory() ? 'directory' : 'file',
        size: stat.size,
        modifiedAt: stat.mtime.toISOString()
    };
}

export class LocalFileSystem {
    private cwd: string;
    private readonly isWindows: boolean;

    constructor() {
        this.isWindows = os.platform() === 'win32';
        this.cwd = this.isWindows ? '\\' : os.homedir();
    }

    /**
     * Get all available drives (using drivelist)
     */
    private async getSystemDrives(): Promise<Array<{ name: string; label: string; mountpoint: string; }>> {
        // Early return for Unix-like systems
        if (!this.isWindows) {
            return [{ name: '/', label: 'Root filesystem', mountpoint: '/' }];
        }

        // Windows: get drive list using drivelist
        try {
            const drives = await drivelist.list();
            const mountpoints: Array<{ name: string; label: string; mountpoint: string; }> = [];
            
            for (const drive of drives) {
                if (drive.mountpoints && drive.mountpoints.length > 0) {
                    for (const mp of drive.mountpoints) {
                        // mp.path is directly in format like "C:\", "D:\", etc.
                        // Just need to remove the trailing backslash to get drive letter
                        const driveLetter = mp.path.replace(/\\$/, ''); // Remove trailing \
                        mountpoints.push({
                            name: driveLetter,
                            label: driveLetter,  // Only show drive letter like C:, D:, E:
                            mountpoint: driveLetter  // Use drive letter format directly as mountpoint
                        });
                    }
                }
            }
            
            // Sort by drive letter
            mountpoints.sort((a, b) => a.name.localeCompare(b.name));
            return mountpoints;
        } catch (error) {
            console.warn('Failed to get drive list:', error);
            // Fallback: return C: drive
            return [{ name: 'C:', label: 'C:', mountpoint: 'C:' }];
        }
    }

    /**
     * Resolve target path based on current path and target
     */
    // normalize path to absolute path based on current working directory
    private normalizePath(targetPath: string): string {
        // Handle empty path - return current working directory
        if (!targetPath || targetPath.trim() === '') {
            return this.cwd;
        }

        // Handle absolute paths
        if (this.isWindows) {
            if (targetPath.match(/^[A-Z]:/i) || targetPath === '\\') {
                return targetPath;
            }
        } else {
            if (targetPath.startsWith('/')) {
                return targetPath;
            }
        }

        // Handle relative paths
        if (targetPath === '..') {
            if (this.isWindows) {
                if (this.cwd === '\\') {
                    return '\\'; // Stay at root
                } else if (this.cwd.match(/^[A-Z]:$/i)) {
                    return '\\'; // Back to drive selection from drive root
                } else if (this.cwd.match(/^[A-Z]:\\$/i)) {
                    return '\\'; // Back to drive selection from drive root with backslash
                } else {
                    const parentPath = path.dirname(this.cwd);
                    // If parent is drive root (like "C:"), go back to drive selection
                    if (parentPath.match(/^[A-Z]:$/i)) {
                        return '\\';
                    }
                    return parentPath;
                }
            } else {
                if (this.cwd === '/') {
                    return '/';
                } else {
                    const parentPath = path.dirname(this.cwd);
                    return parentPath === '.' ? '/' : parentPath;
                }
            }
        }

        // Handle other relative paths
        if (this.isWindows) {
            if (this.cwd === '\\') {
                return targetPath; // From drive root, target becomes absolute
            } else if (this.cwd.match(/^[A-Z]:$/i)) {
                return this.cwd + '\\' + targetPath;
            } else {
                return path.join(this.cwd, targetPath);
            }
        } else {
            return this.cwd === '/' ? '/' + targetPath : path.posix.join(this.cwd, targetPath);
        }
    }

    // convert virtual path to real system path
    private toRealPath(virtualPath: string): string {
        if (!this.isWindows) {
            return virtualPath;
        }

        // Windows path conversion
        if (virtualPath.match(/^[A-Z]:$/i)) {
            return virtualPath.toUpperCase() + '\\';
        }
        
        if (virtualPath.match(/^[A-Z]:/i)) {
            return virtualPath.replace(/\//g, '\\');
        }

        return virtualPath;
    }

    // get current working directory
    public pwd(): RetType<string> {
        return {
            stat: true,
            data: this.cwd
        };
    }

    // list directory contents
    public async ls(targetPath: string = ""): Promise<RetType<LocalFile[]>> {
        const virtualPath = this.normalizePath(targetPath);

        // Special handling: Windows drive listing
        if (this.isWindows && virtualPath === '\\') {
            const drives = await this.getSystemDrives();
            const files: LocalFile[] = drives.map(drive => ({
                name: drive.label,
                type: 'directory' as const,
                size: 0,
                modifiedAt: new Date().toISOString()
            }));

            return {
                stat: true,
                data: files
            };
        }

        // Regular directory listing
        const realPath = this.toRealPath(virtualPath);
        
        try {
            const stat = await fs.stat(realPath);
            if (!stat.isDirectory()) {
                return {
                    stat: false,
                    msg: `${virtualPath} is not a directory`
                };
            }

            const entries = await fs.readdir(realPath);
            
            // Convert entries to LocalFile objects, filtering out inaccessible files
            const files = (await Promise.all(
                entries.map(async (entry) => {
                    try {
                        const entryRealPath = path.join(realPath, entry);
                        const entryStat = await fs.stat(entryRealPath);
                        return convertStat(entry, entryStat);
                    } catch (error) {
                        console.warn(`Cannot access ${entry}:`, error);
                        return null;
                    }
                })
            )).filter((file): file is LocalFile => file !== null);

            return {
                stat: true,
                data: files
            };

        } catch (error) {
            return {
                stat: false,
                msg: `${virtualPath} not found`
            };
        }
    }

    // change working directory
    public async cd(targetPath: string): Promise<RetType<void>> {
        const virtualPath = this.normalizePath(targetPath);
        const realPath = this.toRealPath(virtualPath);

        try {
            const stat = await fs.stat(realPath);
            if (!stat.isDirectory()) {
                return {
                    stat: false,
                    msg: `${virtualPath} is not a directory`
                };
            }

            this.cwd = virtualPath;
            return {
                stat: true,
                data: undefined
            };

        } catch (error) {
            return {
                stat: false,
                msg: `${virtualPath} not found`
            };
        }
    }

    // get path information
    public async stat(targetPath: string): Promise<RetType<{ isDirectory: boolean, isWritable: boolean }>> {
        const virtualPath = this.normalizePath(targetPath);

        // Special handling: Windows root directory and drive root directories
        if (this.isWindows && (virtualPath === '\\' || virtualPath.match(/^[A-Z]:$/i))) {
            return {
                stat: true,
                data: {
                    isDirectory: true,
                    isWritable: false
                }
            };
        }

        const realPath = this.toRealPath(virtualPath);
        
        try {
            const stat = await fs.stat(realPath);
            
            // Check if path is writable
            let isWritable = false;
            try {
                await fs.access(realPath, fs.constants.W_OK);
                isWritable = true;
            } catch {
                isWritable = false;
            }
            
            return {
                stat: true,
                data: {
                    isDirectory: stat.isDirectory(),
                    isWritable
                }
            };
        } catch {
            return {
                stat: false,
                msg: `${virtualPath} not found`
            };
        }
    }
}

export default LocalFileSystem;
