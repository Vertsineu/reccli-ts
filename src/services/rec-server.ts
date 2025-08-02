import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import SessionManager, { LoginRequest, SessionData } from '@services/session-manager.js';
import TransferManager, { TransferTask } from '@services/transfer-manager.js';
import { RetType } from '@services/pan-dav-file-system.js';
import { RecFile } from '@services/rec-file-system.js';
import { PanDavFile } from '@services/pan-dav-file-system.js';

interface AuthenticatedRequest extends Request {
    session?: SessionData;
}

class RecServer {
    private app: express.Application;
    private sessionManager: SessionManager;
    private transferManager: TransferManager;
    private port: number;

    constructor(port: number = 3000) {
        this.app = express();
        this.port = port;
        this.sessionManager = new SessionManager();
        this.transferManager = new TransferManager();

        this.setupMiddleware();
        this.setupRoutes();
    }

    private setupMiddleware(): void {
        // CORS
        this.app.use(cors());

        // JSON parsing
        this.app.use(express.json());

        // Authentication middleware
        this.app.use('/api', this.authenticateSession.bind(this));
    }

    private authenticateSession(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
        // Skip authentication for login endpoint
        if (req.path === '/login') {
            return next();
        }

        const sessionId = req.headers['x-session-id'] as string;
        if (!sessionId) {
            res.status(401).json({ error: 'Session ID required' });
            return;
        }

        const session = this.sessionManager.getSession(sessionId);
        if (!session) {
            res.status(401).json({ error: 'Invalid or expired session' });
            return;
        }

        req.session = session;
        next();
    }

    private setupRoutes(): void {
        // Health check
        this.app.get('/health', (req: Request, res: Response) => {
            res.json({ status: 'ok', timestamp: new Date().toISOString() });
        });

        // Authentication
        this.app.post('/api/login', this.login.bind(this));
        this.app.post('/api/logout', this.logout.bind(this));

        // Rec File System operations
        this.app.get('/api/rec/list', this.recListFiles.bind(this));
        this.app.post('/api/rec/copy', this.recCopyFile.bind(this));
        this.app.post('/api/rec/move', this.recMoveFile.bind(this));
        this.app.delete('/api/rec/delete', this.recDeleteFile.bind(this));
        this.app.post('/api/rec/mkdir', this.recCreateDirectory.bind(this));
        this.app.get('/api/rec/pwd', this.recGetPwd.bind(this));
        this.app.post('/api/rec/cd', this.recChangeDirectory.bind(this));
        this.app.post('/api/rec/rename', this.recRenameFile.bind(this));
        this.app.post('/api/rec/recycle', this.recRecycleFile.bind(this));
        this.app.post('/api/rec/restore', this.recRestoreFile.bind(this));
        this.app.post('/api/rec/unwrap', this.recUnwrapFolder.bind(this));
        this.app.post('/api/rec/save', this.recSaveToCloud.bind(this));
        this.app.get('/api/rec/whoami', this.recGetUserInfo.bind(this));
        this.app.get('/api/rec/groups', this.recGetGroups.bind(this));
        this.app.get('/api/rec/df', this.recGetStorageInfo.bind(this));
        this.app.get('/api/rec/du', this.recGetPathSize.bind(this));

        // PanDav File System operations
        this.app.get('/api/pandav/list', this.panDavListFiles.bind(this));
        this.app.post('/api/pandav/copy', this.panDavCopyFile.bind(this));
        this.app.post('/api/pandav/move', this.panDavMoveFile.bind(this));
        this.app.delete('/api/pandav/delete', this.panDavDeleteFile.bind(this));
        this.app.post('/api/pandav/mkdir', this.panDavCreateDirectory.bind(this));
        this.app.get('/api/pandav/stat', this.panDavGetStat.bind(this));
        this.app.get('/api/pandav/pwd', this.panDavGetPwd.bind(this));
        this.app.post('/api/pandav/cd', this.panDavChangeDirectory.bind(this));
        this.app.post('/api/pandav/rename', this.panDavRenameFile.bind(this));
        this.app.post('/api/pandav/unwrap', this.panDavUnwrapFolder.bind(this));
        this.app.get('/api/pandav/du', this.panDavGetPathSize.bind(this));
        this.app.get('/api/pandav/exists', this.panDavCheckExists.bind(this));

        // Local File System operations
        this.app.get('/api/local/list', this.localListDirectory.bind(this));
        this.app.post('/api/local/cd', this.localChangeDirectory.bind(this));
        this.app.get('/api/local/pwd', this.localGetCurrentPath.bind(this));
        this.app.get('/api/local/stat', this.localGetPathInfo.bind(this));

        // Transfer operations
        this.app.post('/api/transfer/create', this.createTransfer.bind(this));
        this.app.post('/api/transfer/:taskId/start', this.startTransfer.bind(this));
        this.app.post('/api/transfer/:taskId/pause', this.pauseTransfer.bind(this));
        this.app.post('/api/transfer/:taskId/resume', this.resumeTransfer.bind(this));
        this.app.post('/api/transfer/:taskId/cancel', this.cancelTransfer.bind(this));
        this.app.post('/api/transfer/:taskId/restart', this.restartTransfer.bind(this));
        this.app.get('/api/transfer/:taskId', this.getTransfer.bind(this));
        this.app.get('/api/transfer/:taskId/status', this.getTransferStatus.bind(this));
        this.app.get('/api/transfers', this.getTransfers.bind(this));
        this.app.delete('/api/transfer/:taskId', this.deleteTransfer.bind(this));
    }

    // Authentication endpoints
    private async login(req: Request, res: Response): Promise<void> {
        try {
            const loginData: LoginRequest = req.body;
            const { sessionId, session } = await this.sessionManager.createSession(loginData);

            res.json({
                sessionId,
                user: {
                    recAccount: session.recAccount,
                    createdAt: session.createdAt
                }
            });
        } catch (error) {
            res.status(400).json({ error: String(error) });
        }
    }

    private logout(req: AuthenticatedRequest, res: Response): void {
        const sessionId = req.headers['x-session-id'] as string;
        this.sessionManager.removeSession(sessionId);
        res.json({ message: 'Logged out successfully' });
    }

    // Rec File System endpoints
    private async recListFiles(req: AuthenticatedRequest, res: Response): Promise<void> {
        try {
            const path = req.query.path as string || '';
            const result = await req.session!.recFileSystem.ls(path);

            if (result.stat && result.data) {
                // Ensure Rec format is standardized
                const transformedData = result.data.map((item: RecFile) => ({
                    id: item.id || '0',
                    name: item.name || '',
                    size: item.size || 0,
                    type: item.type === 'folder' ? 'directory' : 'file',
                    creator: item.creator || '',
                    lastModified: item.lastModified || ''
                }));

                this.sendResult(res, {
                    stat: true,
                    data: transformedData
                });
            } else {
                this.sendResult(res, result);
            }
        } catch (error) {
            res.status(500).json({ error: String(error) });
        }
    }

    private async recCopyFile(req: AuthenticatedRequest, res: Response): Promise<void> {
        try {
            const { src, dest } = req.body;
            const result = await req.session!.recFileSystem.cp(src, dest);
            this.sendResult(res, result);
        } catch (error) {
            res.status(500).json({ error: String(error) });
        }
    }

    private async recMoveFile(req: AuthenticatedRequest, res: Response): Promise<void> {
        try {
            const { src, dest } = req.body;
            const result = await req.session!.recFileSystem.mv(src, dest);
            this.sendResult(res, result);
        } catch (error) {
            res.status(500).json({ error: String(error) });
        }
    }

    private async recDeleteFile(req: AuthenticatedRequest, res: Response): Promise<void> {
        try {
            const path = req.query.path as string;
            const result = await req.session!.recFileSystem.rm(path);
            this.sendResult(res, result);
        } catch (error) {
            res.status(500).json({ error: String(error) });
        }
    }

    private async recCreateDirectory(req: AuthenticatedRequest, res: Response): Promise<void> {
        try {
            const { path } = req.body;
            const result = await req.session!.recFileSystem.mkdir(path);
            this.sendResult(res, result);
        } catch (error) {
            res.status(500).json({ error: String(error) });
        }
    }

    private recGetPwd(req: AuthenticatedRequest, res: Response): void {
        try {
            const result = req.session!.recFileSystem.pwd();
            this.sendResult(res, result);
        } catch (error) {
            res.status(500).json({ error: String(error) });
        }
    }

    private async recChangeDirectory(req: AuthenticatedRequest, res: Response): Promise<void> {
        try {
            const { path } = req.body;
            const result = await req.session!.recFileSystem.cd(path);
            this.sendResult(res, result);
        } catch (error) {
            res.status(500).json({ error: String(error) });
        }
    }

    private async recRenameFile(req: AuthenticatedRequest, res: Response): Promise<void> {
        try {
            const { src, name } = req.body;
            const result = await req.session!.recFileSystem.rename(src, name);
            this.sendResult(res, result);
        } catch (error) {
            res.status(500).json({ error: String(error) });
        }
    }

    private async recRecycleFile(req: AuthenticatedRequest, res: Response): Promise<void> {
        try {
            const { src } = req.body;
            const result = await req.session!.recFileSystem.recycle(src);
            this.sendResult(res, result);
        } catch (error) {
            res.status(500).json({ error: String(error) });
        }
    }

    private async recRestoreFile(req: AuthenticatedRequest, res: Response): Promise<void> {
        try {
            const { src, dest } = req.body;
            const result = await req.session!.recFileSystem.restore(src, dest);
            this.sendResult(res, result);
        } catch (error) {
            res.status(500).json({ error: String(error) });
        }
    }

    private async recUnwrapFolder(req: AuthenticatedRequest, res: Response): Promise<void> {
        try {
            const { src } = req.body;
            const result = await req.session!.recFileSystem.unwrap(src);
            this.sendResult(res, result);
        } catch (error) {
            res.status(500).json({ error: String(error) });
        }
    }

    private async recSaveToCloud(req: AuthenticatedRequest, res: Response): Promise<void> {
        try {
            const { src, dest } = req.body;
            const result = await req.session!.recFileSystem.save(src, dest);
            this.sendResult(res, result);
        } catch (error) {
            res.status(500).json({ error: String(error) });
        }
    }

    private async recGetUserInfo(req: AuthenticatedRequest, res: Response): Promise<void> {
        try {
            const result = await req.session!.recFileSystem.whoami();
            this.sendResult(res, result);
        } catch (error) {
            res.status(500).json({ error: String(error) });
        }
    }

    private async recGetGroups(req: AuthenticatedRequest, res: Response): Promise<void> {
        try {
            const result = await req.session!.recFileSystem.groups();
            this.sendResult(res, result);
        } catch (error) {
            res.status(500).json({ error: String(error) });
        }
    }

    private async recGetStorageInfo(req: AuthenticatedRequest, res: Response): Promise<void> {
        try {
            const result = await req.session!.recFileSystem.df();
            this.sendResult(res, result);
        } catch (error) {
            res.status(500).json({ error: String(error) });
        }
    }

    private async recGetPathSize(req: AuthenticatedRequest, res: Response): Promise<void> {
        try {
            const path = req.query.path as string;
            const result = await req.session!.recFileSystem.du(path);
            this.sendResult(res, result);
        } catch (error) {
            res.status(500).json({ error: String(error) });
        }
    }

    // PanDav File System endpoints
    private async panDavListFiles(req: AuthenticatedRequest, res: Response): Promise<void> {
        if (!this.checkPanDavAvailable(req, res)) return;
        
        try {
            const path = req.query.path as string || '';
            const result = await req.session!.panDavFileSystem!.ls(path);

            if (result.stat && result.data) {
                // Transform PanDav format to match Rec format
                const transformedData = result.data.map((item: PanDavFile, index: number) => ({
                    id: String(index),
                    name: item.basename || item.filename?.split('/').pop() || '',
                    size: item.size || 0,
                    type: item.type === 'folder' ? 'directory' : 'file',
                    creator: '',
                    lastModified: item.lastmod || ''
                }));

                this.sendResult(res, {
                    stat: true,
                    data: transformedData
                });
            } else {
                this.sendResult(res, result);
            }
        } catch (error) {
            res.status(500).json({ error: String(error) });
        }
    }

    private async panDavCopyFile(req: AuthenticatedRequest, res: Response): Promise<void> {
        if (!this.checkPanDavAvailable(req, res)) return;
        
        try {
            const { src, dest } = req.body;
            const result = await req.session!.panDavFileSystem!.cp(src, dest);
            this.sendResult(res, result);
        } catch (error) {
            res.status(500).json({ error: String(error) });
        }
    }

    private async panDavMoveFile(req: AuthenticatedRequest, res: Response): Promise<void> {
        if (!this.checkPanDavAvailable(req, res)) return;
        
        try {
            const { src, dest } = req.body;
            const result = await req.session!.panDavFileSystem!.mv(src, dest);
            this.sendResult(res, result);
        } catch (error) {
            res.status(500).json({ error: String(error) });
        }
    }

    private async panDavDeleteFile(req: AuthenticatedRequest, res: Response): Promise<void> {
        if (!this.checkPanDavAvailable(req, res)) return;
        
        try {
            const path = req.query.path as string;
            const result = await req.session!.panDavFileSystem!.rm(path);
            this.sendResult(res, result);
        } catch (error) {
            res.status(500).json({ error: String(error) });
        }
    }

    private async panDavCreateDirectory(req: AuthenticatedRequest, res: Response): Promise<void> {
        if (!this.checkPanDavAvailable(req, res)) return;
        
        try {
            const { path } = req.body;
            const result = await req.session!.panDavFileSystem!.mkdir(path);
            this.sendResult(res, result);
        } catch (error) {
            res.status(500).json({ error: String(error) });
        }
    }

    private async panDavGetStat(req: AuthenticatedRequest, res: Response): Promise<void> {
        if (!this.checkPanDavAvailable(req, res)) return;
        
        try {
            const path = req.query.path as string;
            const result = await req.session!.panDavFileSystem!.stat(path);
            this.sendResult(res, result);
        } catch (error) {
            res.status(500).json({ error: String(error) });
        }
    }

    private panDavGetPwd(req: AuthenticatedRequest, res: Response): void {
        if (!this.checkPanDavAvailable(req, res)) return;
        
        try {
            const pwd = req.session!.panDavFileSystem!.pwd();
            res.json({ stat: true, data: pwd });
        } catch (error) {
            res.status(500).json({ error: String(error) });
        }
    }

    private async panDavChangeDirectory(req: AuthenticatedRequest, res: Response): Promise<void> {
        if (!this.checkPanDavAvailable(req, res)) return;
        
        try {
            const { path } = req.body;
            const result = await req.session!.panDavFileSystem!.cd(path);
            this.sendResult(res, result);
        } catch (error) {
            res.status(500).json({ error: String(error) });
        }
    }

    private async panDavRenameFile(req: AuthenticatedRequest, res: Response): Promise<void> {
        if (!this.checkPanDavAvailable(req, res)) return;
        
        try {
            const { src, name } = req.body;
            const result = await req.session!.panDavFileSystem!.rename(src, name);
            this.sendResult(res, result);
        } catch (error) {
            res.status(500).json({ error: String(error) });
        }
    }

    private async panDavUnwrapFolder(req: AuthenticatedRequest, res: Response): Promise<void> {
        if (!this.checkPanDavAvailable(req, res)) return;
        
        try {
            const { src } = req.body;
            const result = await req.session!.panDavFileSystem!.unwrap(src);
            this.sendResult(res, result);
        } catch (error) {
            res.status(500).json({ error: String(error) });
        }
    }

    private async panDavGetPathSize(req: AuthenticatedRequest, res: Response): Promise<void> {
        if (!this.checkPanDavAvailable(req, res)) return;
        
        try {
            const path = req.query.path as string;
            const result = await req.session!.panDavFileSystem!.du(path);
            this.sendResult(res, result);
        } catch (error) {
            res.status(500).json({ error: String(error) });
        }
    }

    private async panDavCheckExists(req: AuthenticatedRequest, res: Response): Promise<void> {
        if (!this.checkPanDavAvailable(req, res)) return;
        
        try {
            const path = req.query.path as string;
            const result = await req.session!.panDavFileSystem!.exists(path);
            this.sendResult(res, result);
        } catch (error) {
            res.status(500).json({ error: String(error) });
        }
    }

    // Transfer endpoints
    private createTransfer(req: AuthenticatedRequest, res: Response): void {
        try {
            const { srcPath, destPath, transferType } = req.body;
            
            // Validate transferType
            if (!transferType || !['webdav', 'disk'].includes(transferType)) {
                res.status(400).json({ error: 'transferType must be either "webdav" or "disk"' });
                return;
            }
            
            const taskId = this.transferManager.createTransferTask(
                req.session!.id,
                srcPath,
                destPath,
                transferType
            );
            res.json({ taskId });
        } catch (error) {
            res.status(500).json({ error: String(error) });
        }
    }

    private async startTransfer(req: AuthenticatedRequest, res: Response): Promise<void> {
        try {
            const { taskId } = req.params;

            // Start transfer in background without waiting for completion
            this.transferManager.startTransfer(
                taskId,
                req.session!.recFileSystem,
                req.session!.panDavFileSystem
            ).catch(error => {
                // Error handling is already done in TransferManager
                console.error(`Transfer ${taskId} failed:`, error);
            });

            // Return immediately
            res.json({ message: 'Transfer started', taskId });
        } catch (error) {
            console.error(`Failed to start transfer:`, error);
            res.status(400).json({ error: String(error) });
        }
    }

    private pauseTransfer(req: AuthenticatedRequest, res: Response): void {
        try {
            const { taskId } = req.params;
            this.transferManager.pauseTransfer(taskId);
            res.json({ message: 'Transfer paused' });
        } catch (error) {
            console.error(`Failed to pause transfer:`, error);
            res.status(400).json({ error: String(error) });
        }
    }

    private resumeTransfer(req: AuthenticatedRequest, res: Response): void {
        try {
            const { taskId } = req.params;

            // Resume transfer in background without waiting for completion
            this.transferManager.resumeTransfer(
                taskId,
                req.session!.recFileSystem,
                req.session!.panDavFileSystem
            );

            // Return immediately
            res.json({ message: 'Transfer resumed', taskId });
        } catch (error) {
            console.error(`Failed to resume transfer:`, error);
            res.status(400).json({ error: String(error) });
        }
    }

    private cancelTransfer(req: AuthenticatedRequest, res: Response): void {
        try {
            const { taskId } = req.params;
            this.transferManager.cancelTransfer(taskId);
            res.json({ message: 'Transfer cancelled' });
        } catch (error) {
            console.error(`Failed to cancel transfer:`, error);
            res.status(400).json({ error: String(error) });
        }
    }

    private restartTransfer(req: AuthenticatedRequest, res: Response): void {
        try {
            const { taskId } = req.params;

            // Restart transfer - this is a synchronous operation that sets up the restart
            this.transferManager.restartTransfer(
                taskId,
                req.session!.recFileSystem,
                req.session!.panDavFileSystem || undefined
            );

            // Return immediately
            res.json({ message: 'Transfer restarted', taskId });
        } catch (error) {
            console.error(`Failed to restart transfer:`, error);
            res.status(400).json({ error: String(error) });
        }
    }

    private getTransfer(req: AuthenticatedRequest, res: Response): void {
        try {
            const { taskId } = req.params;
            const task = this.transferManager.getTask(taskId);
            if (!task) {
                res.status(404).json({ error: 'Transfer task not found' });
                return;
            }
            res.json(task);
        } catch (error) {
            res.status(500).json({ error: String(error) });
        }
    }

    private getTransferStatus(req: AuthenticatedRequest, res: Response): void {
        try {
            const { taskId } = req.params;
            const task = this.transferManager.getTask(taskId);
            if (!task) {
                res.status(404).json({ error: 'Transfer task not found' });
                return;
            }

            // Return the task status
            res.json(task);

            // Auto-cleanup: Remove completed, failed, or cancelled tasks after status check
            if (task.status === 'completed' || task.status === 'failed' || task.status === 'cancelled') {
                // Use setTimeout to ensure response is sent first
                setTimeout(() => {
                    this.transferManager.removeTask(taskId);
                    console.log(`Auto-removed transfer task ${taskId} with status: ${task.status}`);
                }, 100);
            }
        } catch (error) {
            res.status(500).json({ error: String(error) });
        }
    }

    private getTransfers(req: AuthenticatedRequest, res: Response): void {
        try {
            const tasks = this.transferManager.getTasksBySession(req.session!.id);
            res.json(tasks);
        } catch (error) {
            res.status(500).json({ error: String(error) });
        }
    }

    private deleteTransfer(req: AuthenticatedRequest, res: Response): void {
        try {
            const { taskId } = req.params;
            const removed = this.transferManager.removeTask(taskId);
            if (!removed) {
                res.status(404).json({ error: 'Transfer task not found' });
                return;
            }
            res.json({ message: 'Transfer task deleted' });
        } catch (error) {
            res.status(500).json({ error: String(error) });
        }
    }

    private sendResult<T>(res: Response, result: RetType<T>): void {
        if (result.stat) {
            res.json(result);
        } else {
            res.status(400).json(result);
        }
    }

    private checkPanDavAvailable(req: AuthenticatedRequest, res: Response): boolean {
        if (!req.session!.panDavFileSystem) {
            res.status(403).json({ 
                error: 'PanDav functionality is not available. Please login with WebDAV credentials.' 
            });
            return false;
        }
        return true;
    }

    // Local File System endpoints
    private async localListDirectory(req: AuthenticatedRequest, res: Response): Promise<void> {
        try {
            const path = req.query.path as string;
            const result = await req.session!.localFileSystem.ls(path);
            this.sendResult(res, result);
        } catch (error) {
            res.status(500).json({ error: String(error) });
        }
    }

    private async localChangeDirectory(req: AuthenticatedRequest, res: Response): Promise<void> {
        try {
            const { path } = req.body;
            if (!path) {
                res.status(400).json({ stat: false, error: 'Path is required' });
                return;
            }

            const result = await req.session!.localFileSystem.cd(path);
            this.sendResult(res, result);
        } catch (error) {
            res.status(500).json({ error: String(error) });
        }
    }

    private localGetCurrentPath(req: AuthenticatedRequest, res: Response): void {
        try {
            const result = req.session!.localFileSystem.pwd();
            this.sendResult(res, result);
        } catch (error) {
            res.status(500).json({ error: String(error) });
        }
    }

    private async localGetPathInfo(req: AuthenticatedRequest, res: Response): Promise<void> {
        try {
            const path = req.query.path as string;
            if (!path) {
                res.status(400).json({ stat: false, error: 'Path is required' });
                return;
            }

            const result = await req.session!.localFileSystem.stat(path);
            this.sendResult(res, result);
        } catch (error) {
            res.status(500).json({ error: String(error) });
        }
    }

    public start(): Promise<void> {
        return new Promise((resolve) => {
            this.app.listen(this.port, '127.0.0.1', () => {
                console.log(`🚀 Rec server is running on port ${this.port}`);
                console.log(`📖 API documentation: http://localhost:${this.port}/health`);
                resolve();
            });
        });
    }

    public getApp(): express.Application {
        return this.app;
    }
}

export default RecServer;
