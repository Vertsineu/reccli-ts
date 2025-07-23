import React, { useState, useEffect } from 'react';
import { ArrowRight, LogOut, User, RefreshCw, Trash2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import FileExplorer from '@/components/FileExplorer';
import TransferMonitor from '@/components/TransferMonitor';
import { FileItem, TransferTask } from '@/types/api';
import { apiClient } from '@/services/api';

const Dashboard: React.FC = () => {
    const { user, logout } = useAuth();
    // 跨目录文件选择的数据结构 - 直接存储所有选中的文件
    const [selectedRecFilesTotal, setSelectedRecFilesTotal] = useState<FileItem[]>([]);
    const [selectedPanDavPath, setSelectedPanDavPath] = useState<string>('');
    const [transfers, setTransfers] = useState<TransferTask[]>([]);
    const [transferring, setTransferring] = useState(false);
    const [deletingPanDav, setDeletingPanDav] = useState(false);
    const [maxConcurrent, setMaxConcurrent] = useState<number>(4); // Default to 4
    const [selectedRecFilesSize, setSelectedRecFilesSize] = useState<number>(0);
    const [calculatingRecSize, setCalculatingRecSize] = useState(false);
    const [clearRecSelection, setClearRecSelection] = useState(false);
    const [clearPanDavSelection, setClearPanDavSelection] = useState(false);
    const [refreshPanDav, setRefreshPanDav] = useState(false);

    // 用 Map 来跟踪各个路径的文件选择，但不作为状态存储
    const selectedRecFilesByPathRef = React.useRef<Map<string, FileItem[]>>(new Map());
    const selectedRecSizesByPathRef = React.useRef<Map<string, number>>(new Map());

    // PanDav 也需要跨文件夹选择支持
    const selectedPanDavFilesByPathRef = React.useRef<Map<string, FileItem[]>>(new Map());
    const [selectedPanDavFilesTotal, setSelectedPanDavFilesTotal] = useState<FileItem[]>([]);

    // Smart polling: faster when active tasks, slower when idle (1s/3s intervals)
    useEffect(() => {
        let interval: NodeJS.Timeout;

        const fetchTransfers = async () => {
            try {
                const tasks = await apiClient.getAllTransfers();

                // Auto-delete completed tasks (after 5 seconds delay to allow animation)
                await autoDeleteCompletedTasks(tasks);

                // Show all tasks including completed ones (TransferMonitor will handle fade animation)
                setTransfers(tasks);

                // 移除这里的自动启动逻辑，完全交给 TransferMonitor 组件处理
                // 避免重复启动同一个任务

                // Clear existing interval
                if (interval) clearInterval(interval);

                // Determine polling frequency based on task activity
                const hasActiveTasks = tasks.some(task =>
                    task.status === 'running' || task.status === 'pending'
                );
                const pollingInterval = hasActiveTasks ? 1000 : 3000; // 1s for active, 3s for idle

                // Set new interval with updated frequency
                interval = setInterval(fetchTransfers, pollingInterval);
            } catch (error) {
                console.error('Failed to fetch transfers:', error);
                // Continue with default interval on error
                if (interval) clearInterval(interval);
                interval = setInterval(fetchTransfers, 3000); // Use 3s for error recovery
            }
        };

        fetchTransfers();

        return () => {
            if (interval) clearInterval(interval);
        };
    }, []);

    // Auto-delete completed tasks after a delay to allow for animation
    const autoDeleteCompletedTasks = async (tasks: TransferTask[]) => {
        const now = Date.now();
        const completedTasks = tasks.filter(task =>
            task.status === 'completed' &&
            task.completedAt &&
            (now - new Date(task.completedAt).getTime()) > 3000 // 3 seconds delay for fade animation
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

    // 已移除 autoStartPendingTasks 函数，任务自动启动逻辑完全由 TransferMonitor 组件处理

    const handleRecFileSelect = (files: FileItem[], currentPath: string) => {
        // 更新当前路径的选中文件并计算总文件列表
        const filesByPath = selectedRecFilesByPathRef.current;

        if (files.length > 0) {
            filesByPath.set(currentPath, files);
        } else {
            filesByPath.delete(currentPath);
        }

        // 计算所有路径下的文件总数
        const totalFiles: FileItem[] = [];
        for (const [path, pathFiles] of filesByPath.entries()) {
            // 为每个文件添加路径信息
            const filesWithPath = pathFiles.map(file => ({
                ...file,
                // 添加完整路径信息用于传输
                fullPath: path ? `${path}/${file.name}` : file.name,
                sourcePath: path
            }));
            totalFiles.push(...filesWithPath);
        }

        setSelectedRecFilesTotal(totalFiles);
    };

    // 清除 Rec 所有路径的选择
    const handleClearRecSelection = () => {
        selectedRecFilesByPathRef.current.clear();
        selectedRecSizesByPathRef.current.clear();
        setSelectedRecFilesTotal([]);
        setSelectedRecFilesSize(0);
        setClearRecSelection(true);
        setTimeout(() => setClearRecSelection(false), 100);
    };

    const handlePanDavFileSelect = (files: FileItem[], currentPath: string) => {
        // 更新当前路径的选中文件并计算总文件列表（类似 Rec 的逻辑）
        const filesByPath = selectedPanDavFilesByPathRef.current;

        if (files.length > 0) {
            filesByPath.set(currentPath, files);
        } else {
            filesByPath.delete(currentPath);
        }

        // 计算所有路径下的文件总数
        const totalFiles: FileItem[] = [];
        for (const [path, pathFiles] of filesByPath.entries()) {
            // 为每个文件添加路径信息
            const filesWithPath = pathFiles.map(file => ({
                ...file,
                // 添加完整路径信息用于删除
                fullPath: path ? `${path}/${file.name}` : file.name,
                sourcePath: path
            }));
            totalFiles.push(...filesWithPath);
        }

        // 更新总的选中文件列表
        setSelectedPanDavFilesTotal(totalFiles);
        // 保持向后兼容，同时更新原来的状态
        setSelectedPanDavFilesTotal(totalFiles);
        // 更新路径为最后操作的路径
        setSelectedPanDavPath(currentPath);
    };

    // 清除 PanDav 所有路径的选择
    const handleClearPanDavSelection = () => {
        selectedPanDavFilesByPathRef.current.clear();
        setSelectedPanDavFilesTotal([]);
        setClearPanDavSelection(true);
        setTimeout(() => setClearPanDavSelection(false), 100);
    };

    const handleRecSizeCalculated = (size: number, calculating: boolean, path?: string) => {
        console.log(`[SIZE CALC] Path: ${path}, Size: ${size}, Calculating: ${calculating}`);

        if (path !== undefined) {
            // 更新特定路径的大小
            const sizesByPath = selectedRecSizesByPathRef.current;
            if (size > 0) {
                sizesByPath.set(path, size);
            } else {
                sizesByPath.delete(path);
            }

            // 计算总大小
            const totalSize = Array.from(sizesByPath.values()).reduce((sum, pathSize) => sum + pathSize, 0);
            console.log(`[SIZE CALC] Total size updated to: ${totalSize}, from paths:`, Array.from(sizesByPath.entries()));
            setSelectedRecFilesSize(totalSize);
        } else {
            // 兼容原来的调用方式
            console.log(`[SIZE CALC] Legacy mode: ${size}`);
            setSelectedRecFilesSize(size);
        }
        setCalculatingRecSize(calculating);
    }; const handlePanDavPathChange = (currentPath: string) => {
        setSelectedPanDavPath(currentPath);
    }; const handleStartTransfer = async () => {
        if (selectedRecFilesTotal.length === 0) {
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

            for (const file of selectedRecFilesTotal) {
                const srcPath = (file as any).fullPath || file.name;
                const { taskId } = await apiClient.createTransfer(srcPath, selectedPanDavPath);
                createdTaskIds.push(taskId);
            }

            // Get current running tasks count
            const currentTasks = await apiClient.getAllTransfers();
            const queuedTasksCount = currentTasks.filter(task => task.status !== 'pending').length;

            // Calculate how many new tasks we can start immediately
            const availableSlots = Math.max(0, maxConcurrent - queuedTasksCount);
            const tasksToStart = createdTaskIds.slice(0, availableSlots);

            // Start only the allowed number of tasks
            for (const taskId of tasksToStart) {
                await apiClient.startTransfer(taskId);
            }

            // Clear selection after creating transfers
            setSelectedRecFilesTotal([]);
            selectedRecFilesByPathRef.current.clear(); // 清除 ref 中的数据
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
        // No need to fetch immediately since we already have smart polling
        // The polling interval will pick up changes automatically within 2-5 seconds
        console.log('Task update requested - handled by smart polling');
    };

    const handleDeletePanDavFiles = async () => {
        if (selectedPanDavFilesTotal.length === 0) {
            alert('Please select files from PanDav to delete');
            return;
        }

        const confirmed = window.confirm(
            `Are you sure you want to delete ${selectedPanDavFilesTotal.length} file(s)? This action cannot be undone.`
        );

        if (!confirmed) return;

        setDeletingPanDav(true);

        try {
            // Delete each selected file using their full path
            for (const file of selectedPanDavFilesTotal) {
                const filePath = (file as any).fullPath || file.name;
                await apiClient.panDavDeleteFile(filePath);
            }

            // Clear all selections after deleting
            setSelectedPanDavFilesTotal([]);
            selectedPanDavFilesByPathRef.current.clear();
            setClearPanDavSelection(true);

            // Trigger PanDav refresh to reload the current directory
            setRefreshPanDav(true);

            // Reset the flags after a short delay
            setTimeout(() => {
                setClearPanDavSelection(false);
                setRefreshPanDav(false);
            }, 100);

            alert(`Successfully deleted ${selectedPanDavFilesTotal.length} file(s)`);
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
                        onClearAllSelection={handleClearRecSelection}
                        allowSelection={true}
                        clearSelection={clearRecSelection}
                        className="h-96"
                        globalSelectedCount={selectedRecFilesTotal.length}
                        globalSelectedSize={selectedRecFilesSize}
                        globalCalculatingSize={calculatingRecSize}
                    />

                    {/* PanDav File System */}
                    <FileExplorer
                        type="pandav"
                        title="PanDav WebDAV Storage"
                        onFileSelect={handlePanDavFileSelect}
                        onPathChange={handlePanDavPathChange}
                        onClearAllSelection={handleClearPanDavSelection}
                        allowSelection={true}
                        clearSelection={clearPanDavSelection}
                        refreshTrigger={refreshPanDav}
                        className="h-96"
                        globalSelectedCount={selectedPanDavFilesTotal.length}
                    />
                </div>

                {/* Transfer Controls */}
                <div className="card mb-8">
                    <div className="flex items-start justify-between">
                        <div className="flex-1">
                            <h3 className="text-lg font-semibold text-gray-900 mb-2">Transfer Control</h3>

                            {selectedRecFilesTotal.length > 0 ? (
                                <div className="space-y-2">
                                    <p className="text-sm text-gray-600">
                                        Selected {selectedRecFilesTotal.length} file(s) ({calculatingRecSize ? (
                                            <span className="text-blue-500">calculating...</span>
                                        ) : (
                                            <span className="font-medium">{formatFileSize(selectedRecFilesSize)}</span>
                                        )})
                                        {selectedRecFilesTotal.length > 0 && (
                                            <span className="ml-2 text-blue-500 text-xs">• Size calculated with du</span>
                                        )}
                                    </p>
                                    <div className="flex flex-wrap gap-2">
                                        {selectedRecFilesTotal.map((file, index) => (
                                            <span
                                                key={`${(file as any).fullPath || file.name}-${index}`}
                                                className="inline-flex items-center px-3 py-1 rounded-full text-xs bg-primary-100 text-primary-700"
                                            >
                                                {(file as any).fullPath || file.name}
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
                            {selectedPanDavFilesTotal.length > 0 && (
                                <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                                    <p className="text-sm text-red-800 mb-2">
                                        Selected {selectedPanDavFilesTotal.length} file(s) from PanDav for deletion
                                    </p>
                                    <div className="flex flex-wrap gap-2 mb-2">
                                        {selectedPanDavFilesTotal.map((file, index) => (
                                            <span
                                                key={`${(file as any).fullPath || file.name}-${index}`}
                                                className="inline-flex items-center px-3 py-1 rounded-full text-xs bg-red-100 text-red-700"
                                            >
                                                {(file as any).fullPath || file.name}
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
                            {selectedPanDavFilesTotal.length > 0 && (
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
                                            Delete Selected ({selectedPanDavFilesTotal.length})
                                        </>
                                    )}
                                </button>
                            )}

                            <button
                                onClick={handleStartTransfer}
                                disabled={selectedRecFilesTotal.length === 0 || !selectedPanDavPath || transferring}
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
