import React, { useState, useEffect } from 'react';
import { apiClient } from '@/services/api';
import { LocalFile } from '@/types/api';

interface LocalDirectoryPickerProps {
    isOpen: boolean;
    onClose: () => void;
    onSelect: (path: string) => void;
}

const LocalDirectoryPicker: React.FC<LocalDirectoryPickerProps> = ({
    isOpen,
    onClose,
    onSelect
}) => {
    const [currentPath, setCurrentPath] = useState<string>('');
    const [directories, setDirectories] = useState<LocalFile[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (isOpen) {
            loadInitialData();
        }
    }, [isOpen]);

    const handleError = (err: any, defaultMessage: string) => {
        const errorMessage = err.response?.data?.error || err.response?.data?.msg || err.message || defaultMessage;
        setError(errorMessage);
    };

    const updateCurrentPath = async () => {
        const response = await apiClient.localGetCurrentPath();
        setCurrentPath(response.currentPath || '');
    };

    const loadInitialData = async () => {
        setLoading(true);
        setError(null);
        
        try {
            await updateCurrentPath();
            await loadDirectory();
        } catch (err: any) {
            handleError(err, 'Failed to load directories');
        } finally {
            setLoading(false);
        }
    };

    const loadDirectory = async (path?: string) => {
        setLoading(true);
        setError(null);
        
        try {
            // Change directory if path is provided
            if (path) {
                await apiClient.localChangeDirectory(path);
                await updateCurrentPath();
            }

            // Load directory contents
            const files = await apiClient.localListDirectory();
            const directories = files.filter(file => file?.type === 'directory');
            setDirectories(directories);
        } catch (err: any) {
            handleError(err, 'Failed to load directory');
        } finally {
            setLoading(false);
        }
    };

    const handleDirectoryClick = async (directory: LocalFile) => {
        // Use the file name for relative path navigation
        await loadDirectory(directory.name);
    };

    const handleGoUp = async () => {
        await loadDirectory('..');
    };

    const handleSelectCurrent = () => {
        onSelect(currentPath);
        onClose();
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 w-[500px] max-w-[90vw] max-h-[80vh] flex flex-col">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-semibold">Select Download Directory</h3>
                    <button
                        onClick={onClose}
                        className="text-gray-500 hover:text-gray-700 text-xl font-bold"
                    >
                        ×
                    </button>
                </div>

                {error && (
                    <div className="bg-red-100 border border-red-400 text-red-700 px-3 py-2 rounded mb-4">
                        {error}
                    </div>
                )}

                <div className="mb-4">
                    <div className="text-sm text-gray-600 mb-2">Current Path:</div>
                    <div className="bg-gray-100 px-3 py-2 rounded text-sm font-mono break-all">
                        {currentPath || 'Loading...'}
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto border rounded p-2 mb-4 min-h-[250px]">
                    {loading ? (
                        <div className="text-center py-4 text-gray-500 text-sm">Loading...</div>
                    ) : (
                        <>
                            {currentPath && currentPath !== '/' && currentPath !== '\\' && (
                                <div
                                    onClick={handleGoUp}
                                    className="flex items-center py-1.5 px-2 hover:bg-gray-100 cursor-pointer rounded text-sm"
                                >
                                    <div className="text-blue-600 mr-2">📁</div>
                                    <div className="text-blue-600 font-medium">..</div>
                                </div>
                            )}
                            {directories.map((dir, index) => (
                                <div
                                    key={index}
                                    onClick={() => handleDirectoryClick(dir)}
                                    className="flex items-center py-1.5 px-2 hover:bg-gray-100 cursor-pointer rounded text-sm"
                                >
                                    <div className="text-blue-600 mr-2">📁</div>
                                    <div className="truncate">{dir.name}</div>
                                </div>
                            ))}
                            {directories.length === 0 && !loading && (
                                <div className="text-center py-4 text-gray-500 text-sm">No directories found</div>
                            )}
                        </>
                    )}
                </div>

                <div className="flex justify-end space-x-2">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-gray-600 border border-gray-300 rounded hover:bg-gray-50 text-sm"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSelectCurrent}
                        disabled={!currentPath || loading}
                        className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-gray-300 text-sm"
                    >
                        Select This Directory
                    </button>
                </div>
            </div>
        </div>
    );
};

export default LocalDirectoryPicker;
