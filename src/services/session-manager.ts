import { v4 as uuidv4 } from 'uuid';
import RecFileSystem from '@services/rec-file-system.js';
import PanDavFileSystem from '@services/pan-dav-file-system.js';
import RecAPI from '@services/rec-api.js';
import { createPanDavClient, PanDavAuth } from '@services/pan-dav-api.js';

export interface SessionData {
    id: string;
    recAccount: string;
    recApi: RecAPI;
    recFileSystem: RecFileSystem;
    panDavAuth: PanDavAuth;
    panDavFileSystem: PanDavFileSystem;
    createdAt: Date;
    lastAccessedAt: Date;
}

export interface LoginRequest {
    recAccount: string;
    recPassword: string;
    webdavAccount: string;
    webdavPassword: string;
}

class SessionManager {
    private sessions: Map<string, SessionData> = new Map();
    private readonly SESSION_TIMEOUT = 12 * 60 * 60 * 1000; // 12 hours

    public async createSession(loginData: LoginRequest): Promise<{ sessionId: string; session: SessionData }> {
        try {
            // Login to Rec API
            const recAuth = {
                username: loginData.recAccount,
                password: loginData.recPassword
            };
            const recApi = new RecAPI(undefined, undefined, recAuth);
            await recApi.login(loginData.recAccount, loginData.recPassword);

            // Check if login was successful by checking if userAuth is set
            const userAuth = recApi.getUserAuth();
            if (!userAuth) {
                throw new Error('Rec login failed: Invalid credentials');
            }

            // Create Rec File System
            const recFileSystem = new RecFileSystem(recApi);

            // Create PanDav client and file system
            const panDavAuth: PanDavAuth = {
                username: loginData.webdavAccount,
                password: loginData.webdavPassword
            };

            const panDavClient = createPanDavClient(panDavAuth);
            const panDavFileSystem = new PanDavFileSystem(panDavClient);

            // Check if WebDav credentials are valid
            try {
                await panDavClient.exists("/");
            } catch (error) {
                throw new Error(`WebDav login failed: ${String(error)}`);
            }

            // Generate session ID
            const sessionId = uuidv4();
            const now = new Date();

            const session: SessionData = {
                id: sessionId,
                recAccount: loginData.recAccount,
                recApi,
                recFileSystem,
                panDavAuth,
                panDavFileSystem,
                createdAt: now,
                lastAccessedAt: now
            };

            this.sessions.set(sessionId, session);

            // Clean up old sessions
            this.cleanupExpiredSessions();

            return { sessionId, session };
        } catch (error) {
            throw new Error(`Failed to create session: ${String(error)}`);
        }
    }

    public getSession(sessionId: string): SessionData | null {
        const session = this.sessions.get(sessionId);
        if (!session) {
            return null;
        }

        // Check if session is expired
        const now = new Date();
        if (now.getTime() - session.lastAccessedAt.getTime() > this.SESSION_TIMEOUT) {
            this.sessions.delete(sessionId);
            return null;
        }

        // Update last accessed time
        session.lastAccessedAt = now;
        return session;
    }

    public removeSession(sessionId: string): boolean {
        return this.sessions.delete(sessionId);
    }

    private cleanupExpiredSessions(): void {
        const now = new Date();
        for (const [sessionId, session] of this.sessions.entries()) {
            if (now.getTime() - session.lastAccessedAt.getTime() > this.SESSION_TIMEOUT) {
                this.sessions.delete(sessionId);
            }
        }
    }

    public getSessions(): SessionData[] {
        return Array.from(this.sessions.values());
    }
}

export default SessionManager;
