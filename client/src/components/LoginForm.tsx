import React, { useState } from 'react';
import { LogIn, Eye, EyeOff, Loader2, XCircle, CheckSquare, Square } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { LoginRequest } from '@/types/api';

const LoginForm: React.FC = () => {
    const { login, loginLoading } = useAuth();
    const [formData, setFormData] = useState<LoginRequest>({
        recAccount: '',
        recPassword: '',
        panDavAccount: '',
        panDavPassword: '',
    });
    const [showRecPassword, setShowRecPassword] = useState(false);
    const [showPanDavPassword, setShowPanDavPassword] = useState(false);
    const [enableWebDAV, setEnableWebDAV] = useState(true);
    const [error, setError] = useState<string>('');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        try {
            const loginData: LoginRequest = {
                recAccount: formData.recAccount,
                recPassword: formData.recPassword,
                ...(enableWebDAV && {
                    panDavAccount: formData.panDavAccount,
                    panDavPassword: formData.panDavPassword,
                })
            };
            await login(loginData);
        } catch (err: any) {
            setError(err.response?.data?.error || 'Login failed. Please check your credentials.');
        }
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: value,
        }));
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-50 to-primary-100 p-4">
            <div className="max-w-md w-full">
                <div className="card">
                    <div className="text-center mb-8">
                        <div className="inline-flex items-center justify-center w-16 h-16 bg-primary-100 rounded-full mb-4">
                            <LogIn className="w-8 h-8 text-primary-600" />
                        </div>
                        <h1 className="text-2xl font-bold text-gray-900">Rec Transfer Client</h1>
                        <p className="text-gray-600 mt-2">Sign in to manage your file transfers</p>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-6">
                        {error && (
                            <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg flex items-center gap-2">
                                <XCircle className="w-5 h-5 flex-shrink-0" />
                                <div>
                                    <p className="font-medium">Login Failed</p>
                                    <p className="text-sm">{error}</p>
                                </div>
                            </div>
                        )}

                        <div className="space-y-4">
                            <div>
                                <label htmlFor="recAccount" className="block text-sm font-medium text-gray-700 mb-2">
                                    Rec Account (Student ID)
                                </label>
                                <input
                                    type="text"
                                    id="recAccount"
                                    name="recAccount"
                                    value={formData.recAccount}
                                    onChange={handleChange}
                                    required
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                                    placeholder="Enter your student ID"
                                />
                            </div>

                            <div>
                                <label htmlFor="recPassword" className="block text-sm font-medium text-gray-700 mb-2">
                                    Rec Password
                                </label>
                                <div className="relative">
                                    <input
                                        type={showRecPassword ? 'text' : 'password'}
                                        id="recPassword"
                                        name="recPassword"
                                        value={formData.recPassword}
                                        onChange={handleChange}
                                        required
                                        className="w-full px-3 py-2 pr-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                                        placeholder="Enter your Rec password"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowRecPassword(!showRecPassword)}
                                        className="absolute inset-y-0 right-0 px-3 flex items-center text-gray-400 hover:text-gray-600"
                                    >
                                        {showRecPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                                    </button>
                                </div>
                            </div>

                            <div className="border-t border-gray-200 pt-4">
                                <div className="flex items-center mb-4">
                                    <button
                                        type="button"
                                        onClick={() => setEnableWebDAV(!enableWebDAV)}
                                        className="flex items-center gap-2 text-sm font-medium text-gray-700 hover:text-gray-900"
                                    >
                                        {enableWebDAV ? <CheckSquare size={20} className="text-primary-600" /> : <Square size={20} />}
                                        Enable WebDAV Account (Optional)
                                    </button>
                                </div>
                            </div>

                            {enableWebDAV && (
                                <>
                                    <div>
                                        <label htmlFor="panDavAccount" className="block text-sm font-medium text-gray-700 mb-2">
                                            PanDAV Account
                                        </label>
                                <input
                                    type="text"
                                    id="panDavAccount"
                                    name="panDavAccount"
                                    value={formData.panDavAccount}
                                    onChange={handleChange}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                                    placeholder="Enter your PanDAV username"
                                />
                            </div>

                            <div>
                                <label htmlFor="panDavPassword" className="block text-sm font-medium text-gray-700 mb-2">
                                    PanDAV Password
                                </label>
                                <div className="relative">
                                    <input
                                        type={showPanDavPassword ? 'text' : 'password'}
                                        id="panDavPassword"
                                        name="panDavPassword"
                                        value={formData.panDavPassword}
                                        onChange={handleChange}
                                        className="w-full px-3 py-2 pr-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                                        placeholder="Enter your PanDAV password"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPanDavPassword(!showPanDavPassword)}
                                        className="absolute inset-y-0 right-0 px-3 flex items-center text-gray-400 hover:text-gray-600"
                                    >
                                        {showPanDavPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                                    </button>
                                </div>
                            </div>
                        </>
                    )}
                        </div>

                        <button
                            type="submit"
                            disabled={loginLoading}
                            className="btn-primary w-full justify-center disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {loginLoading ? (
                                <>
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    Signing in...
                                </>
                            ) : (
                                <>
                                    <LogIn className="w-4 h-4" />
                                    Sign In
                                </>
                            )}
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
};

export default LoginForm;
