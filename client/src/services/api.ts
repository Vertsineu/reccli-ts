import axios, { AxiosInstance } from 'axios';
import {
    FileItem,
    TransferTask,
    LoginRequest,
    LoginResponse,
    ApiResponse,
    UserInfo,
    StorageInfo,
    FileSystemStats
} from '@/types/api';

class ApiClient {
    private api: AxiosInstance;
    private sessionId: string | null = null;

    constructor() {
        this.api = axios.create({
            baseURL: '/api',
            timeout: 30000,
        });

        // Request interceptor to add session ID
        this.api.interceptors.request.use((config) => {
            if (this.sessionId) {
                config.headers['X-Session-ID'] = this.sessionId;
            }
            return config;
        });

        // Response interceptor for error handling
        this.api.interceptors.response.use(
            (response) => response,
            (error) => {
                if (error.response?.status === 401) {
                    this.sessionId = null;
                    localStorage.removeItem('sessionId');
                }
                return Promise.reject(error);
            }
        );

        // Load session from localStorage
        this.sessionId = localStorage.getItem('sessionId');
    }

    // Authentication
    async login(credentials: LoginRequest): Promise<LoginResponse> {
        const response = await this.api.post<LoginResponse>('/login', credentials);
        this.sessionId = response.data.sessionId;
        localStorage.setItem('sessionId', this.sessionId);
        return response.data;
    }

    async logout(): Promise<void> {
        await this.api.post('/logout');
        this.sessionId = null;
        localStorage.removeItem('sessionId');
    }

    isAuthenticated(): boolean {
        return !!this.sessionId;
    }

    // Health check
    async healthCheck(): Promise<{ status: string; timestamp: string }> {
        const response = await axios.get('/health');
        return response.data;
    }

    // Rec File System
    async recListFiles(path: string = ''): Promise<FileItem[]> {
        const response = await this.api.get<ApiResponse<FileItem[]>>('/rec/list', {
            params: { path }
        });
        return response.data.data;
    }

    async recCreateDirectory(path: string): Promise<void> {
        await this.api.post('/rec/mkdir', { path });
    }

    async recDeleteFile(path: string): Promise<void> {
        await this.api.delete('/rec/delete', { params: { path } });
    }

    async recRenameFile(src: string, name: string): Promise<void> {
        await this.api.post('/rec/rename', { src, name });
    }

    async recGetUserInfo(): Promise<UserInfo> {
        const response = await this.api.get<ApiResponse<UserInfo>>('/rec/whoami');
        return response.data.data;
    }

    async recGetStorageInfo(): Promise<StorageInfo> {
        const response = await this.api.get<ApiResponse<StorageInfo>>('/rec/df');
        return response.data.data;
    }

    async recGetPathSize(path: string): Promise<number> {
        const response = await this.api.get<ApiResponse<number>>('/rec/du', {
            params: { path }
        });
        return response.data.data;
    }

    // PanDav File System
    async panDavListFiles(path: string = ''): Promise<FileItem[]> {
        const response = await this.api.get<ApiResponse<FileItem[]>>('/pandav/list', {
            params: { path }
        });
        return response.data.data;
    }

    async panDavCreateDirectory(path: string): Promise<void> {
        await this.api.post('/pandav/mkdir', { path });
    }

    async panDavDeleteFile(path: string): Promise<void> {
        await this.api.delete('/pandav/delete', { params: { path } });
    }

    async panDavRenameFile(src: string, name: string): Promise<void> {
        await this.api.post('/pandav/rename', { src, name });
    }

    async panDavGetStat(path: string): Promise<FileSystemStats> {
        const response = await this.api.get<ApiResponse<FileSystemStats>>('/pandav/stat', {
            params: { path }
        });
        return response.data.data;
    }

    async panDavCheckExists(path: string): Promise<boolean> {
        const response = await this.api.get<ApiResponse<boolean>>('/pandav/exists', {
            params: { path }
        });
        return response.data.data;
    }

    async panDavGetPathSize(path: string): Promise<number> {
        const response = await this.api.get<ApiResponse<number>>('/pandav/du', {
            params: { path }
        });
        return response.data.data;
    }

    // Transfer Operations
    async createTransfer(srcPath: string, destPath: string, transferType: 'webdav' | 'disk' = 'webdav'): Promise<{ taskId: string }> {
        const response = await this.api.post<{ taskId: string }>('/transfer/create', {
            srcPath,
            destPath,
            transferType
        });
        return response.data;
    }

    async startTransfer(taskId: string): Promise<void> {
        await this.api.post(`/transfer/${taskId}/start`);
    }

    async pauseTransfer(taskId: string): Promise<void> {
        await this.api.post(`/transfer/${taskId}/pause`);
    }

    async resumeTransfer(taskId: string): Promise<void> {
        await this.api.post(`/transfer/${taskId}/resume`);
    }

    async cancelTransfer(taskId: string): Promise<void> {
        await this.api.post(`/transfer/${taskId}/cancel`);
    }

    async restartTransfer(taskId: string): Promise<void> {
        await this.api.post(`/transfer/${taskId}/restart`);
    }

    async getTransfer(taskId: string): Promise<TransferTask> {
        const response = await this.api.get<TransferTask>(`/transfer/${taskId}`);
        return response.data;
    }

    async getTransferStatus(taskId: string): Promise<TransferTask> {
        const response = await this.api.get<TransferTask>(`/transfer/${taskId}/status`);
        return response.data;
    }

    async getAllTransfers(): Promise<TransferTask[]> {
        const response = await this.api.get<TransferTask[]>('/transfers');
        return response.data;
    }

    async deleteTransfer(taskId: string): Promise<void> {
        await this.api.delete(`/transfer/${taskId}`);
    }

    // Local File System
    async localListDirectory(path?: string): Promise<FileItem[]> {
        const response = await this.api.get<ApiResponse<{ path: string; name: string; files: FileItem[] }>>('/local/list', {
            params: path ? { path } : {}
        });
        return response.data.data.files;
    }

    async localChangeDirectory(path: string): Promise<{ currentPath: string }> {
        const response = await this.api.post<ApiResponse<{ path: string }>>('/local/cd', { path });
        return { currentPath: response.data.data.path };
    }

    async localGetCurrentPath(): Promise<{ currentPath: string }> {
        const response = await this.api.get<ApiResponse<{ path: string }>>('/local/pwd');
        return { currentPath: response.data.data.path };
    }

    async localStat(path: string): Promise<{ exists: boolean; isDirectory: boolean; isWritable: boolean }> {
        const response = await this.api.get<ApiResponse<{ exists: boolean; isDirectory: boolean; isWritable: boolean }>>('/local/stat', {
            params: { path }
        });
        return response.data.data;
    }
}

export const apiClient = new ApiClient();
