import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { apiClient } from '@/services/api';
import { LoginRequest, UserInfo } from '@/types/api';

interface AuthContextType {
    isAuthenticated: boolean;
    user: UserInfo | null;
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
    const [loading, setLoading] = useState(true); // Initial loading for app startup
    const [loginLoading, setLoginLoading] = useState(false); // Loading for login process

    useEffect(() => {
        const checkAuth = async () => {
            try {
                const userInfo = await apiClient.recGetUserInfo();
                setUser(userInfo);
                setIsAuthenticated(true);
            } catch (error) {
                console.error('Auth check failed:', error);
                setIsAuthenticated(false);
                setUser(null);
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
        } catch (error) {
            setIsAuthenticated(false);
            setUser(null);
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
        }
    };

    const value = {
        isAuthenticated,
        user,
        loading,
        loginLoading,
        login,
        logout,
    };

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
