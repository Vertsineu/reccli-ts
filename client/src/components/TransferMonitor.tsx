import React from 'react';
import {
    Play,
    Pause,
    Square,
    RotateCcw,
    Trash2,
    Clock,
    CheckCircle,
    XCircle,
    AlertCircle,
    Download
} from 'lucide-react';
import { TransferTask } from '@/types/api';
import { apiClient } from '@/services/api';

interface TransferMonitorProps {
    tasks: TransferTask[];
    onTaskUpdate: () => void;
    maxConcurrent?: number;
}

const TransferMonitor: React.FC<TransferMonitorProps> = ({ tasks, onTaskUpdate, maxConcurrent = 4 }) => {
    const formatBytes = (bytes: number): string => {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    const formatSpeed = (bytesPerSecond: number): string => {
        return `${formatBytes(bytesPerSecond)}/s`;
    };

    const formatDuration = (seconds: number): string => {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = Math.floor(seconds % 60);

        if (hours > 0) {
            return `${hours}h ${minutes}m ${secs}s`;
        } else if (minutes > 0) {
            return `${minutes}m ${secs}s`;
        } else {
            return `${secs}s`;
        }
    };

    const getStatusIcon = (status: TransferTask['status']) => {
        switch (status) {
            case 'pending':
                return <Clock className="w-4 h-4 text-gray-500" />;
            case 'running':
                return <Play className="w-4 h-4 text-blue-500" />;
            case 'paused':
                return <Pause className="w-4 h-4 text-yellow-500" />;
            case 'completed':
                return <CheckCircle className="w-4 h-4 text-green-500" />;
            case 'failed':
                return <XCircle className="w-4 h-4 text-red-500" />;
            case 'cancelled':
                return <AlertCircle className="w-4 h-4 text-gray-500" />;
            default:
                return <Clock className="w-4 h-4 text-gray-500" />;
        }
    };

    const getStatusColor = (status: TransferTask['status']) => {
        switch (status) {
            case 'pending':
                return 'bg-gray-100 text-gray-700';
            case 'running':
                return 'bg-blue-100 text-blue-700';
            case 'paused':
                return 'bg-yellow-100 text-yellow-700';
            case 'completed':
                return 'bg-green-100 text-green-700';
            case 'failed':
                return 'bg-red-100 text-red-700';
            case 'cancelled':
                return 'bg-gray-100 text-gray-700';
            default:
                return 'bg-gray-100 text-gray-700';
        }
    };

    const handleAction = async (taskId: string, action: 'start' | 'pause' | 'resume' | 'cancel' | 'restart' | 'delete') => {
        try {
            switch (action) {
                case 'start':
                    await apiClient.startTransfer(taskId);
                    break;
                case 'pause':
                    await apiClient.pauseTransfer(taskId);
                    break;
                case 'resume':
                    await apiClient.resumeTransfer(taskId);
                    break;
                case 'cancel':
                    await apiClient.cancelTransfer(taskId);
                    break;
                case 'restart':
                    await apiClient.restartTransfer(taskId);
                    break;
                case 'delete':
                    await apiClient.deleteTransfer(taskId);
                    break;
            }
            onTaskUpdate();
        } catch (error) {
            console.error(`Failed to ${action} transfer:`, error);
        }
    };

    const handleBulkAction = async (action: 'start' | 'pause' | 'resume' | 'cancel' | 'delete') => {
        try {
            let targetTasks: TransferTask[] = [];

            switch (action) {
                case 'start':
                    // Start pending tasks, respecting max concurrent limit
                    const runningTasks = tasks.filter(task => task.status === 'running');
                    const pendingTasks = tasks.filter(task => task.status === 'pending')
                        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

                    const availableSlots = maxConcurrent - runningTasks.length;
                    targetTasks = pendingTasks.slice(0, Math.max(0, availableSlots));
                    break;

                case 'pause':
                    targetTasks = tasks.filter(task => task.status === 'running');
                    break;

                case 'resume':
                    // Resume paused tasks, respecting max concurrent limit
                    const currentRunningTasks = tasks.filter(task => task.status === 'running');
                    const pausedTasks = tasks.filter(task => task.status === 'paused')
                        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

                    const availableSlotsForResume = maxConcurrent - currentRunningTasks.length;
                    targetTasks = pausedTasks.slice(0, Math.max(0, availableSlotsForResume));
                    break;

                case 'cancel':
                    targetTasks = tasks.filter(task =>
                        task.status === 'running' ||
                        task.status === 'paused' ||
                        task.status === 'pending'
                    );
                    break;

                case 'delete':
                    // Delete all tasks
                    targetTasks = [...tasks];
                    break;
            }

            // Execute actions in parallel
            const promises = targetTasks.map(task => {
                switch (action) {
                    case 'start':
                        return apiClient.startTransfer(task.id);
                    case 'pause':
                        return apiClient.pauseTransfer(task.id);
                    case 'resume':
                        return apiClient.resumeTransfer(task.id);
                    case 'cancel':
                        return apiClient.cancelTransfer(task.id);
                    case 'delete':
                        return apiClient.deleteTransfer(task.id);
                    default:
                        return Promise.resolve();
                }
            });

            await Promise.all(promises);
            onTaskUpdate();
        } catch (error) {
            console.error(`Failed to ${action} transfers:`, error);
        }
    };

    const handleDeleteAll = async () => {
        if (tasks.length === 0) return;

        const confirmed = window.confirm(
            `Are you sure you want to delete all ${tasks.length} transfer task(s)? This action cannot be undone.`
        );

        if (!confirmed) return;

        try {
            await handleBulkAction('delete');
        } catch (error) {
            console.error('Failed to delete all transfers:', error);
        }
    };

    const getTotalSpeed = (): number => {
        return tasks
            .filter(task => task.status === 'running')
            .reduce((sum, task) => sum + task.speed, 0);
    };

    const getActiveTasksCount = (): { running: number; pending: number; paused: number; total: number } => {
        const running = tasks.filter(task => task.status === 'running').length;
        const pending = tasks.filter(task => task.status === 'pending').length;
        const paused = tasks.filter(task => task.status === 'paused').length;
        const total = tasks.length;
        return { running, pending, paused, total };
    };



    const getTimeRemaining = (task: TransferTask): string => {
        if (task.status !== 'running' || task.speed === 0) return 'Unknown';

        const remainingBytes = task.totalSize - task.transferredSize;
        const remainingSeconds = remainingBytes / task.speed;

        return formatDuration(remainingSeconds);
    };

    const getElapsedTime = (task: TransferTask): string => {
        if (!task.startedAt) return 'Not started';

        const startTime = new Date(task.startedAt).getTime();
        const endTime = task.completedAt ? new Date(task.completedAt).getTime() : Date.now();
        const elapsedSeconds = Math.max(0, (endTime - startTime) / 1000);

        // For very small elapsed times (< 1 second), show "0s" instead of potentially confusing values
        if (elapsedSeconds < 1) {
            return '0s';
        }

        return formatDuration(elapsedSeconds);
    };

    return (
        <div className="card">
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h2 className="text-lg font-semibold text-gray-900">Transfer Monitor</h2>
                    <div className="flex items-center gap-4 mt-1">
                        <span className="text-sm text-gray-500">
                            {getActiveTasksCount().total} {getActiveTasksCount().total === 1 ? 'task' : 'tasks'}
                            ({getActiveTasksCount().running} running, {getActiveTasksCount().pending} pending{getActiveTasksCount().paused > 0 ? `, ${getActiveTasksCount().paused} paused` : ''})
                        </span>
                        {getTotalSpeed() > 0 && (
                            <span className="text-sm font-medium text-blue-600">
                                Total: {formatSpeed(getTotalSpeed())}
                            </span>
                        )}
                    </div>
                </div>

                {/* Bulk Action Buttons */}
                {tasks.length > 0 && (
                    <div className="flex items-center gap-2">
                        {/* Start All Button */}
                        {tasks.some(task => task.status === 'pending') && (
                            <button
                                onClick={() => handleBulkAction('start')}
                                className="flex items-center gap-1 px-3 py-1 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                                title="Start all pending transfers (respects max concurrent limit)"
                            >
                                <Play className="w-3 h-3" />
                                Start All
                            </button>
                        )}

                        {/* Resume All Button */}
                        {tasks.some(task => task.status === 'paused') && (
                            <button
                                onClick={() => handleBulkAction('resume')}
                                className="flex items-center gap-1 px-3 py-1 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                                title="Resume all paused transfers (respects max concurrent limit)"
                            >
                                <Play className="w-3 h-3" />
                                Resume All
                            </button>
                        )}

                        {/* Pause All Button */}
                        {tasks.some(task => task.status === 'running') && (
                            <button
                                onClick={() => handleBulkAction('pause')}
                                className="flex items-center gap-1 px-3 py-1 text-sm bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition-colors"
                                title="Pause all running transfers"
                            >
                                <Pause className="w-3 h-3" />
                                Pause All
                            </button>
                        )}

                        {/* Cancel All Button */}
                        {tasks.some(task => ['running', 'paused', 'pending'].includes(task.status)) && (
                            <button
                                onClick={() => handleBulkAction('cancel')}
                                className="flex items-center gap-1 px-3 py-1 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                                title="Cancel all active transfers"
                            >
                                <Square className="w-3 h-3" />
                                Cancel All
                            </button>
                        )}

                        {/* Delete All Button */}
                        {tasks.length > 0 && (
                            <button
                                onClick={handleDeleteAll}
                                className="flex items-center gap-1 px-3 py-1 text-sm bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
                                title="Delete all transfer tasks"
                            >
                                <Trash2 className="w-3 h-3" />
                                Delete All
                            </button>
                        )}
                    </div>
                )}
            </div>

            {tasks.length === 0 ? (
                <div className="text-center py-12">
                    <Download className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                    <h3 className="text-lg font-medium text-gray-900 mb-2">No transfers</h3>
                    <p className="text-gray-500">Start a transfer to see progress here</p>
                </div>
            ) : (
                <div className="space-y-4">
                    {tasks.map((task) => {
                        return (
                            <div
                                key={task.id}
                                className="border border-gray-200 rounded-lg p-4 transition-all duration-300"
                            >
                                {/* Task Header */}
                                <div className="flex items-center justify-between mb-3">
                                    <div className="flex items-center gap-3">
                                        {getStatusIcon(task.status)}
                                        <div>
                                            <h3 className="text-sm font-medium text-gray-900">
                                                {task.srcPath} → {task.destPath}
                                            </h3>
                                            <div className="flex items-center gap-2 mt-1">
                                                <span className={`text-xs px-2 py-1 rounded-full ${getStatusColor(task.status)}`}>
                                                    {task.status.charAt(0).toUpperCase() + task.status.slice(1)}
                                                </span>
                                                <span className="text-xs text-gray-500">
                                                    {formatBytes(task.transferredSize)} / {formatBytes(task.totalSize)}
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Action Buttons */}
                                    <div className="flex items-center gap-2">
                                        {task.status === 'pending' && (
                                            <button
                                                onClick={() => handleAction(task.id, 'start')}
                                                className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                                title="Start Transfer"
                                            >
                                                <Play className="w-4 h-4" />
                                            </button>
                                        )}

                                        {task.status === 'running' && (
                                            <button
                                                onClick={() => handleAction(task.id, 'pause')}
                                                className="p-2 text-yellow-600 hover:bg-yellow-50 rounded-lg transition-colors"
                                                title="Pause Transfer"
                                            >
                                                <Pause className="w-4 h-4" />
                                            </button>
                                        )}

                                        {task.status === 'paused' && (
                                            <button
                                                onClick={() => handleAction(task.id, 'resume')}
                                                className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                                title="Resume Transfer"
                                            >
                                                <Play className="w-4 h-4" />
                                            </button>
                                        )}

                                        {(task.status === 'running' || task.status === 'paused') && (
                                            <button
                                                onClick={() => handleAction(task.id, 'cancel')}
                                                className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                                title="Cancel Transfer"
                                            >
                                                <Square className="w-4 h-4" />
                                            </button>
                                        )}

                                        {(task.status === 'failed' || task.status === 'cancelled') && (
                                            <button
                                                onClick={() => handleAction(task.id, 'restart')}
                                                className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                                title="Restart Transfer"
                                            >
                                                <RotateCcw className="w-4 h-4" />
                                            </button>
                                        )}

                                        <button
                                            onClick={() => handleAction(task.id, 'delete')}
                                            className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                            title="Delete Task"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>

                                {/* Progress Bar */}
                                <div className="mb-3">
                                    <div className="progress-bar">
                                        <div
                                            className="progress-fill"
                                            style={{ width: `${(task.progress / 10)}%` }}
                                        />
                                    </div>
                                    <div className="flex justify-between text-xs text-gray-500 mt-1">
                                        <span>{(task.progress / 10).toFixed(1)}%</span>
                                        {task.status === 'running' && (
                                            <span>{formatSpeed(task.speed)}</span>
                                        )}
                                    </div>
                                </div>

                                {/* Task Details */}
                                <div className="flex justify-between text-xs text-gray-500">
                                    <div className="flex gap-4">
                                        <span>Elapsed: {getElapsedTime(task)}</span>
                                        {task.status === 'running' && (
                                            <span>Remaining: {getTimeRemaining(task)}</span>
                                        )}
                                    </div>
                                    <span>Created: {new Date(task.createdAt).toLocaleString()}</span>
                                </div>

                                {/* Error Message */}
                                {task.status === 'failed' && task.error && (
                                    <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg">
                                        <p className="text-sm text-red-800">{task.error}</p>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

export default TransferMonitor;
