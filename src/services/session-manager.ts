import { v4 as uuidv4 } from 'uuid';
import RecFileSystem from '@services/rec-file-system.js';
import PanDavFileSystem from '@services/pan-dav-file-system.js';
import LocalFileSystem from '@services/local-file-system.js';
import RecAPI from '@services/rec-api.js';
import { createPanDavClient, PanDavAuth } from '@services/pan-dav-api.js';

export interface SessionData {
    id: string;
    recAccount: string;
    recApi: RecAPI;
    recFileSystem: RecFileSystem;
    panDavAuth: PanDavAuth;
    panDavFileSystem: PanDavFileSystem;
    localFileSystem: LocalFileSystem;
    createdAt: Date;
    lastAccessedAt: Date;
}

export interface LoginRequest {
    recAccount: string;
    recPassword: string;
    panDavAccount: string;
    panDavPassword: string;
}

class SessionManager {
    private sessions: Map<string, SessionData> = new Map();
    private readonly SESSION_TIMEOUT = 12 * 60 * 60 * 1000; // 12 hours

    public async createSession(loginData: LoginRequest): Promise<{ sessionId: string; session: SessionData }> {
        try {
            // Prepare authentication objects
            const recAuth = {
                username: loginData.recAccount,
                password: loginData.recPassword
            };
            const panDavAuth: PanDavAuth = {
                username: loginData.panDavAccount,
                password: loginData.panDavPassword
            };

            // Initialize clients
            const recApi = new RecAPI(undefined, undefined, recAuth);
            const panDavClient = createPanDavClient(panDavAuth);

            // Perform parallel login attempts with fail-fast behavior
            await Promise.all([
                // Rec API login
                this.loginRec(recApi, loginData.recAccount, loginData.recPassword),
                // WebDAV login validation
                this.loginPanDav(panDavClient)
            ]);

            // Both logins successful, create file systems
            const recFileSystem = new RecFileSystem(recApi);
            const panDavFileSystem = new PanDavFileSystem(panDavClient);
            const localFileSystem = new LocalFileSystem();

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
                localFileSystem,
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

    private async loginRec(recApi: RecAPI, username: string, password: string): Promise<void> {
        try {
            await recApi.login(username, password);
            
            // Check if login was successful by checking if userAuth is set
            const userAuth = recApi.getUserAuth();
            if (!userAuth) {
                throw new Error('Rec login failed: Invalid credentials or login response');
            }
        } catch (error) {
            throw new Error(`Rec login failed: ${String(error)}`);
        }
    }

    private async loginPanDav(panDavClient: any): Promise<void> {
        try {
            await panDavClient.exists("/");
        } catch (error) {
            throw new Error(`PanDav login failed: ${String(error)}`);
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
