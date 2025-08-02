import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { apiClient } from '@/services/api';
import { LoginRequest, UserInfo } from '@/types/api';

interface AuthContextType {
    isAuthenticated: boolean;
    user: UserInfo | null;
    panDavAvailable: boolean;
    loading: boolean;
    loginLoading: boolean;
    login: (credentials: LoginRequest) => Promise<void>;
    logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [user, setUser] = useState<UserInfo | null>(null);
    const [panDavAvailable, setPanDavAvailable] = useState(false);
    const [loading, setLoading] = useState(true); // Initial loading for app startup
    const [loginLoading, setLoginLoading] = useState(false); // Loading for login process

    useEffect(() => {
        const checkAuth = async () => {
            try {
                // Check if we have a session ID in localStorage
                const sessionId = localStorage.getItem('sessionId');
                if (!sessionId) {
                    // No session, user is not logged in
                    setIsAuthenticated(false);
                    setUser(null);
                    setPanDavAvailable(false);
                    return;
                }

                // We have a session, try to verify it
                const userInfo = await apiClient.recGetUserInfo();
                setUser(userInfo);
                setIsAuthenticated(true);
                
                // Check if PanDav is available by trying to list files
                try {
                    await apiClient.panDavListFiles('');
                    setPanDavAvailable(true);
                } catch (error: any) {
                    // If PanDav API fails, WebDAV is not available
                    setPanDavAvailable(false);
                }
            } catch (error: any) {
                console.error('Auth check failed:', error);
                // Clear invalid session
                localStorage.removeItem('sessionId');
                setIsAuthenticated(false);
                setUser(null);
                setPanDavAvailable(false);
            } finally {
                setLoading(false);
            }
        };

        checkAuth();
    }, []);

    const login = async (credentials: LoginRequest) => {
        try {
            setLoginLoading(true);
            await apiClient.login(credentials);
            const userInfo = await apiClient.recGetUserInfo();
            setUser(userInfo);
            setIsAuthenticated(true);
            
            // Check if PanDav is available by trying to list files
            try {
                await apiClient.panDavListFiles('');
                setPanDavAvailable(true);
            } catch (error: any) {
                // If PanDav API fails, WebDAV is not available
                setPanDavAvailable(false);
            }
        } catch (error) {
            setIsAuthenticated(false);
            setUser(null);
            setPanDavAvailable(false);
            throw error;
        } finally {
            setLoginLoading(false);
        }
    };

    const logout = async () => {
        try {
            await apiClient.logout();
        } catch (error) {
            console.error('Logout error:', error);
        } finally {
            setIsAuthenticated(false);
            setUser(null);
            setPanDavAvailable(false);
        }
    };

    const value = {
        isAuthenticated,
        user,
        panDavAvailable,
        loading,
        loginLoading,
        login,
        logout,
    };

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
