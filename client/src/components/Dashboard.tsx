import React, { useState, useEffect } from 'react';
import { ArrowRight, LogOut, User, RefreshCw, Trash2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import FileExplorer from '@/components/FileExplorer';
import TransferMonitor from '@/components/TransferMonitor';
import { FileItem, TransferTask } from '@/types/api';
import { apiClient } from '@/services/api';

const Dashboard: React.FC = () => {
    const { user, logout } = useAuth();
    const [selectedRecFiles, setSelectedRecFiles] = useState<FileItem[]>([]);
    const [selectedRecPath, setSelectedRecPath] = useState<string>('');
    const [selectedPanDavFiles, setSelectedPanDavFiles] = useState<FileItem[]>([]);
    const [selectedPanDavPath, setSelectedPanDavPath] = useState<string>('');
    const [transfers, setTransfers] = useState<TransferTask[]>([]);
    const [transferring, setTransferring] = useState(false);
    const [deletingPanDav, setDeletingPanDav] = useState(false);
    const [maxConcurrent, setMaxConcurrent] = useState<number>(4); // Default to 4
    const [selectedRecFilesSize, setSelectedRecFilesSize] = useState<number>(0);
    const [calculatingRecSize, setCalculatingRecSize] = useState(false);
    const [clearRecSelection, setClearRecSelection] = useState(false);
    const [clearPanDavSelection, setClearPanDavSelection] = useState(false);

    // Auto-refresh transfers every 500ms for smoother progress updates
    useEffect(() => {
        let interval: NodeJS.Timeout;

        const fetchTransfers = async () => {
            try {
                const tasks = await apiClient.getAllTransfers();

                // Auto-delete completed tasks (after 3 seconds delay)
                await autoDeleteCompletedTasks(tasks);

                // Filter out completed tasks from display
                const activeTasks = tasks.filter(task => task.status !== 'completed');
                setTransfers(activeTasks);

                // Auto-start pending tasks if there are running tasks with capacity
                await autoStartPendingTasks(activeTasks);
            } catch (error) {
                console.error('Failed to fetch transfers:', error);
            }
        };

        fetchTransfers();
        interval = setInterval(fetchTransfers, 500);

        return () => {
            if (interval) clearInterval(interval);
        };
    }, []);

    // Auto-delete completed tasks after a short delay
    const autoDeleteCompletedTasks = async (tasks: TransferTask[]) => {
        const now = Date.now();
        const completedTasks = tasks.filter(task =>
            task.status === 'completed' &&
            task.completedAt &&
            (now - new Date(task.completedAt).getTime()) > 3000 // 3 seconds delay
        );

        for (const task of completedTasks) {
            try {
                console.log(`[AUTO-DELETE] Deleting completed task: ${task.id}`);
                await apiClient.deleteTransfer(task.id);
            } catch (error) {
                console.error(`[AUTO-DELETE] Failed to delete completed task ${task.id}:`, error);
            }
        }
    };

    // Auto-start pending tasks when there's available capacity
    const autoStartPendingTasks = async (tasks: TransferTask[]) => {
        const runningTasks = tasks.filter(task => task.status === 'running');
        const pendingTasks = tasks.filter(task => task.status === 'pending')
            .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

        const availableSlots = maxConcurrent - runningTasks.length;

        if (availableSlots > 0 && pendingTasks.length > 0) {
            const tasksToStart = pendingTasks.slice(0, availableSlots);

            for (const task of tasksToStart) {
                try {
                    console.log(`[AUTO-START] Starting pending task: ${task.id}`);
                    await apiClient.startTransfer(task.id);
                } catch (error) {
                    console.error(`[AUTO-START] Failed to start pending task ${task.id}:`, error);
                }
            }
        }
    };

    const handleRecFileSelect = (files: FileItem[], currentPath: string) => {
        setSelectedRecFiles(files);
        setSelectedRecPath(currentPath);
    };

    const handlePanDavFileSelect = (files: FileItem[], currentPath: string) => {
        setSelectedPanDavFiles(files);
        // Also update the path for deletion purposes
        setSelectedPanDavPath(currentPath);
    };

    const handleRecSizeCalculated = (size: number, calculating: boolean) => {
        setSelectedRecFilesSize(size);
        setCalculatingRecSize(calculating);
    }; const handlePanDavPathChange = (currentPath: string) => {
        setSelectedPanDavPath(currentPath);
    }; const handleStartTransfer = async () => {
        if (selectedRecFiles.length === 0) {
            alert('Please select files from Rec to transfer');
            return;
        }

        if (!selectedPanDavPath) {
            alert('Please navigate to a destination folder in PanDav');
            return;
        }

        setTransferring(true);

        try {
            // Create all transfer tasks first (without starting them)
            const createdTaskIds: string[] = [];
            for (const file of selectedRecFiles) {
                const srcPath = selectedRecPath ? `${selectedRecPath}/${file.name}` : file.name;
                const { taskId } = await apiClient.createTransfer(srcPath, selectedPanDavPath);
                createdTaskIds.push(taskId);
            }

            // Get current running tasks count
            const currentTasks = await apiClient.getAllTransfers();
            const runningTasksCount = currentTasks.filter(task => task.status === 'running').length;

            // Calculate how many new tasks we can start immediately
            const availableSlots = Math.max(0, maxConcurrent - runningTasksCount);
            const tasksToStart = createdTaskIds.slice(0, availableSlots);

            // Start only the allowed number of tasks
            for (const taskId of tasksToStart) {
                await apiClient.startTransfer(taskId);
            }

            // Clear selection after creating transfers
            setSelectedRecFiles([]);
            setSelectedRecFilesSize(0);
            setClearRecSelection(true);

            // Reset the clear flag after a short delay
            setTimeout(() => setClearRecSelection(false), 100);

            // Refresh transfers list
            const updatedTasks = await apiClient.getAllTransfers();
            const activeTasks = updatedTasks.filter(task => task.status !== 'completed');
            setTransfers(activeTasks);

            // Log info about created tasks (for debugging)
            const startedCount = tasksToStart.length;
            const pendingCount = createdTaskIds.length - startedCount;
            console.log(`Created ${createdTaskIds.length} transfer task(s), started ${startedCount}, ${pendingCount} pending (max concurrent: ${maxConcurrent})`);
        } catch (error: any) {
            console.error('Transfer failed:', error);
            alert(`Transfer failed: ${error.response?.data?.error || error.message}`);
        } finally {
            setTransferring(false);
        }
    };

    const handleTaskUpdate = async () => {
        try {
            const tasks = await apiClient.getAllTransfers();
            const activeTasks = tasks.filter(task => task.status !== 'completed');
            setTransfers(activeTasks);

            // Auto-start pending tasks after manual refresh
            await autoStartPendingTasks(activeTasks);
        } catch (error) {
            console.error('Failed to refresh transfers:', error);
        }
    };

    const handleDeletePanDavFiles = async () => {
        if (selectedPanDavFiles.length === 0) {
            alert('Please select files from PanDav to delete');
            return;
        }

        const confirmed = window.confirm(
            `Are you sure you want to delete ${selectedPanDavFiles.length} file(s)? This action cannot be undone.`
        );

        if (!confirmed) return;

        setDeletingPanDav(true);

        try {
            // Delete each selected file
            for (const file of selectedPanDavFiles) {
                const filePath = selectedPanDavPath ? `${selectedPanDavPath}/${file.name}` : file.name;
                await apiClient.panDavDeleteFile(filePath);
            }

            // Clear selection after deleting
            setSelectedPanDavFiles([]);
            setClearPanDavSelection(true);

            // Reset the clear flag after a short delay
            setTimeout(() => setClearPanDavSelection(false), 100);

            alert(`Successfully deleted ${selectedPanDavFiles.length} file(s)`);
        } catch (error: any) {
            console.error('Delete failed:', error);
            alert(`Delete failed: ${error.response?.data?.error || error.message}`);
        } finally {
            setDeletingPanDav(false);
        }
    };

    const formatFileSize = (bytes: number): string => {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    return (
        <div className="min-h-screen bg-gray-50">
            {/* Header */}
            <header className="bg-white shadow-sm border-b border-gray-200">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex justify-between items-center h-16">
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 bg-primary-600 rounded-lg flex items-center justify-center">
                                <ArrowRight className="w-5 h-5 text-white" />
                            </div>
                            <div>
                                <h1 className="text-xl font-semibold text-gray-900">Rec Transfer Client</h1>
                                <p className="text-sm text-gray-600">File transfer management</p>
                            </div>
                        </div>

                        <div className="flex items-center gap-4">
                            {user && (
                                <div className="flex items-center gap-3">
                                    <User className="w-5 h-5 text-gray-400" />
                                    <div className="text-sm">
                                        <p className="font-medium text-gray-900">{user.name}</p>
                                        <p className="text-gray-500">{user.email}</p>
                                    </div>
                                </div>
                            )}

                            <button
                                onClick={logout}
                                className="btn-secondary"
                            >
                                <LogOut className="w-4 h-4" />
                                Logout
                            </button>
                        </div>
                    </div>
                </div>
            </header>

            {/* Main Content */}
            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
                    {/* Rec File System */}
                    <FileExplorer
                        type="rec"
                        title="Rec Cloud Storage"
                        onFileSelect={handleRecFileSelect}
                        onSizeCalculated={handleRecSizeCalculated}
                        allowSelection={true}
                        clearSelection={clearRecSelection}
                        className="h-96"
                    />

                    {/* PanDav File System */}
                    <FileExplorer
                        type="pandav"
                        title="PanDav WebDAV Storage"
                        onFileSelect={handlePanDavFileSelect}
                        onPathChange={handlePanDavPathChange}
                        allowSelection={true}
                        clearSelection={clearPanDavSelection}
                        className="h-96"
                    />
                </div>

                {/* Transfer Controls */}
                <div className="card mb-8">
                    <div className="flex items-start justify-between">
                        <div className="flex-1">
                            <h3 className="text-lg font-semibold text-gray-900 mb-2">Transfer Control</h3>

                            {selectedRecFiles.length > 0 ? (
                                <div className="space-y-2">
                                    <p className="text-sm text-gray-600">
                                        Selected {selectedRecFiles.length} file(s) ({calculatingRecSize ? (
                                            <span className="text-blue-500">calculating...</span>
                                        ) : (
                                            <span className="font-medium">{formatFileSize(selectedRecFilesSize)}</span>
                                        )})
                                        {selectedRecFiles.length > 0 && (
                                            <span className="ml-2 text-blue-500 text-xs">• Size calculated with du</span>
                                        )}
                                    </p>
                                    <div className="flex flex-wrap gap-2">
                                        {selectedRecFiles.map((file) => (
                                            <span
                                                key={file.id}
                                                className="inline-flex items-center px-3 py-1 rounded-full text-xs bg-primary-100 text-primary-700"
                                            >
                                                {file.name}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            ) : (
                                <p className="text-sm text-gray-500">
                                    Select files from Rec Cloud to transfer
                                </p>
                            )}

                            {selectedPanDavPath && (
                                <p className="text-sm text-gray-600 mt-2">
                                    Destination: <span className="font-mono bg-gray-100 px-2 py-1 rounded">
                                        /{selectedPanDavPath}
                                    </span>
                                </p>
                            )}

                            {/* PanDav Delete Control */}
                            {selectedPanDavFiles.length > 0 && (
                                <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                                    <p className="text-sm text-red-800 mb-2">
                                        Selected {selectedPanDavFiles.length} file(s) from PanDav for deletion
                                    </p>
                                    <div className="flex flex-wrap gap-2 mb-2">
                                        {selectedPanDavFiles.map((file) => (
                                            <span
                                                key={file.id}
                                                className="inline-flex items-center px-3 py-1 rounded-full text-xs bg-red-100 text-red-700"
                                            >
                                                {file.name}
                                            </span>
                                        ))}
                                    </div>
                                    <p className="text-xs text-red-600">
                                        ⚠️ Deletion is permanent and cannot be undone
                                    </p>
                                </div>
                            )}

                            {/* Concurrent Transfer Setting */}
                            <div className="flex items-center gap-3 mt-4">
                                <label className="text-sm font-medium text-gray-700">
                                    Max Concurrent Transfers:
                                </label>
                                <select
                                    value={maxConcurrent}
                                    onChange={(e) => setMaxConcurrent(Number(e.target.value))}
                                    className="form-select text-sm border-gray-300 rounded-md focus:ring-primary-500 focus:border-primary-500"
                                >
                                    {[1, 2, 3, 4, 5, 6, 7, 8].map(num => (
                                        <option key={num} value={num}>{num}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        <div className="flex items-center gap-3">
                            <button
                                onClick={handleTaskUpdate}
                                className="btn-secondary"
                                title="Refresh transfers"
                            >
                                <RefreshCw className="w-4 h-4" />
                            </button>

                            {/* Delete PanDav Files Button */}
                            {selectedPanDavFiles.length > 0 && (
                                <button
                                    onClick={handleDeletePanDavFiles}
                                    disabled={deletingPanDav}
                                    className="btn-danger disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {deletingPanDav ? (
                                        <>
                                            <RefreshCw className="w-4 h-4 animate-spin" />
                                            Deleting...
                                        </>
                                    ) : (
                                        <>
                                            <Trash2 className="w-4 h-4" />
                                            Delete Selected ({selectedPanDavFiles.length})
                                        </>
                                    )}
                                </button>
                            )}

                            <button
                                onClick={handleStartTransfer}
                                disabled={selectedRecFiles.length === 0 || !selectedPanDavPath || transferring}
                                className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {transferring ? (
                                    <>
                                        <RefreshCw className="w-4 h-4 animate-spin" />
                                        Starting...
                                    </>
                                ) : (
                                    <>
                                        <ArrowRight className="w-4 h-4" />
                                        Start Transfer
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>

                {/* Transfer Monitor */}
                <TransferMonitor
                    tasks={transfers}
                    onTaskUpdate={handleTaskUpdate}
                    maxConcurrent={maxConcurrent}
                />
            </main>
        </div>
    );
};

export default Dashboard;
