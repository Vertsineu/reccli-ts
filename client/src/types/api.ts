// API Types
export interface FileItem {
    id: string;
    name: string;
    size: number;
    type: 'file' | 'directory';
    creator?: string;
    lastModified?: string;
}

export interface TransferTask {
    id: string;
    sessionId: string;
    srcPath: string;
    destPath: string;
    status: 'pending' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';
    progress: number;
    totalSize: number;
    transferredSize: number;
    speed: number;
    startedAt?: string;
    completedAt?: string;
    createdAt: string;
    error?: string;
}

export interface LoginRequest {
    recAccount: string;
    recPassword: string;
    panDavAccount: string;
    panDavPassword: string;
}

export interface LoginResponse {
    sessionId: string;
    user: {
        recAccount: string;
        createdAt: string;
    };
}

export interface ApiResponse<T> {
    stat: boolean;
    data: T;
    error?: string;
}

export interface UserInfo {
    gid: string;
    name: string;
    email: string;
}

export interface StorageInfo {
    user: {
        usedBytes: number;
        totalBytes: number;
    };
    group: {
        usedBytes: number;
        totalBytes: number;
    };
}

export interface FileSystemStats {
    path: string;
    type: 'file' | 'directory';
    size: number;
    lastModified: string;
}
