import fs from 'fs/promises';
import path from 'path';
import os from 'os';

export interface LocalFile {
    name: string;
    type: 'file' | 'directory';
    size: number;
    modifiedAt: string;
    path: string;
}

export interface LocalDirectory {
    path: string;
    name: string;
    files: LocalFile[];
}

export class LocalFileSystem {
    private currentPath: string;

    constructor() {
        // 默认从用户主目录开始
        this.currentPath = os.homedir();
    }

    /**
     * 获取当前目录
     */
    public pwd(): string {
        return this.currentPath;
    }

    /**
     * 列出指定目录的文件和文件夹
     */
    public async ls(targetPath?: string): Promise<LocalDirectory> {
        let dirPath: string;
        
        if (!targetPath) {
            dirPath = this.currentPath;
        } else {
            // 处理路径解析，与 changeDirectory 保持一致
            if (targetPath === '..') {
                dirPath = path.dirname(this.currentPath);
            } else if (path.isAbsolute(targetPath)) {
                dirPath = path.resolve(targetPath);
            } else {
                dirPath = path.resolve(this.currentPath, targetPath);
            }
        }
        
        try {
            // 验证路径是否存在且为目录
            const stat = await fs.stat(dirPath);
            if (!stat.isDirectory()) {
                throw new Error(`Path ${dirPath} is not a directory`);
            }

            const entries = await fs.readdir(dirPath);
            const files: LocalFile[] = [];

            for (const entry of entries) {
                try {
                    const entryPath = path.join(dirPath, entry);
                    const entryStat = await fs.stat(entryPath);
                    
                    files.push({
                        name: entry,
                        type: entryStat.isDirectory() ? 'directory' : 'file',
                        size: entryStat.size,
                        modifiedAt: entryStat.mtime.toISOString(),
                        path: entryPath
                    });
                } catch (error) {
                    // 跳过无法访问的文件
                    console.warn(`Cannot access ${entry}:`, error);
                }
            }

            // 排序：目录优先，然后按名称排序
            files.sort((a, b) => {
                if (a.type !== b.type) {
                    return a.type === 'directory' ? -1 : 1;
                }
                return a.name.localeCompare(b.name);
            });

            return {
                path: dirPath,
                name: path.basename(dirPath) || dirPath,
                files
            };
        } catch (error) {
            throw new Error(`Failed to list directory ${dirPath}: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * 更改当前目录
     */
    public async cd(targetPath: string): Promise<string> {
        try {
            let newPath: string;
            
            // 处理特殊路径
            if (targetPath === '..') {
                // 返回上级目录
                newPath = path.dirname(this.currentPath);
            } else if (path.isAbsolute(targetPath)) {
                // 绝对路径直接使用
                newPath = path.resolve(targetPath);
            } else {
                // 相对路径，与当前目录组合
                newPath = path.resolve(this.currentPath, targetPath);
            }
            
            const stat = await fs.stat(newPath);
            if (!stat.isDirectory()) {
                throw new Error(`Path ${newPath} is not a directory`);
            }

            this.currentPath = newPath;
            return this.currentPath;
        } catch (error) {
            throw new Error(`Failed to change directory to ${targetPath}: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * 获取路径信息
     */
    public async stat(targetPath: string): Promise<{ exists: boolean, isDirectory: boolean, isWritable: boolean }> {
        try {
            const stat = await fs.stat(targetPath);
            
            // 检查路径是否可写
            let isWritable = false;
            try {
                await fs.access(targetPath, fs.constants.W_OK);
                isWritable = true;
            } catch {
                isWritable = false;
            }
            
            return {
                exists: true,
                isDirectory: stat.isDirectory(),
                isWritable
            };
        } catch {
            return {
                exists: false,
                isDirectory: false,
                isWritable: false
            };
        }
    }
}

export default LocalFileSystem;
