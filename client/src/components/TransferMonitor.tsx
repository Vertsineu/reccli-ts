import React, { useState, useEffect } from 'react';
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
    // 跟踪正在淡出的任务
    const [fadingTasks, setFadingTasks] = useState<Set<string>>(new Set());
    // 跟踪需要隐藏的任务（淡出动画完成后从DOM移除）
    const [hiddenTasks, setHiddenTasks] = useState<Set<string>>(new Set());
    // 跟踪组件初始化时已完成的任务（避免页面刷新后重新动画）
    const [initiallyCompletedTasks, setInitiallyCompletedTasks] = useState<Set<string>>(new Set());

    // 初始化时记录已完成的任务
    useEffect(() => {
        const completedTasks = tasks.filter(task => task.status === 'completed');
        const initialCompleted = new Set(completedTasks.map(t => t.id));
        setInitiallyCompletedTasks(initialCompleted);
        // 立即隐藏初始就已完成的任务
        setHiddenTasks(initialCompleted);
    }, []); // 只在组件挂载时运行一次

    // 将 ref 声明移到组件顶层，符合 React Hooks 规则
    const prevRunningTasksCountRef = React.useRef<number>(0);
    const prevMaxConcurrentRef = React.useRef<number>(maxConcurrent);

    // 当任务完成时自动启动等待中的任务，保持同时运行的任务数量为maxConcurrent
    useEffect(() => {
        (async () => {
            // 获取当前运行中的任务数量
            const runningTasks = tasks.filter(task => task.status === 'running');
            const runningTasksCount = runningTasks.length;

            // 获取等待中的任务
            const pendingTasks = tasks.filter(task => task.status === 'pending')
                .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

            // 检查是否有空闲槽位可以启动等待中的任务
            const availableSlots = maxConcurrent - runningTasksCount;

            // 检测是否 maxConcurrent 发生了变化
            const maxConcurrentChanged = maxConcurrent !== prevMaxConcurrentRef.current;

            console.log(`Available slots: ${availableSlots}, Pending tasks: ${pendingTasks.length}, Running: ${runningTasksCount}, Max Changed: ${maxConcurrentChanged}`);

            // 满足以下任一条件时启动新任务:
            // 1. 有可用槽位、有待处理任务，并且运行中任务数量减少
            // 2. 最大并发数增加，导致有新的可用槽位
            if (availableSlots > 0 && pendingTasks.length > 0 && (
                runningTasksCount < prevRunningTasksCountRef.current ||
                prevRunningTasksCountRef.current === 0 ||
                (maxConcurrentChanged && maxConcurrent > prevMaxConcurrentRef.current)
            )) {
                const reason = maxConcurrentChanged && maxConcurrent > prevMaxConcurrentRef.current
                    ? 'Max Concurrent setting increased'
                    : 'Running tasks count changed';

                console.log(`Auto-starting pending tasks because: ${reason}`);

                // 选择最早创建的待处理任务启动
                const tasksToStart = pendingTasks.slice(0, availableSlots);

                // 确保我们要启动的任务都是 pending 状态
                const validTasksToStart = tasksToStart.filter(task => task.status === 'pending');

                if (validTasksToStart.length > 0) {
                    // 并行启动多个任务
                    const startPromises = validTasksToStart.map(task => {
                        console.log(`Auto-starting task: ${task.id}`);
                        return apiClient.startTransfer(task.id);
                    });

                    try {
                        await Promise.all(startPromises);
                        onTaskUpdate(); // 刷新任务列表
                    } catch (error) {
                        console.error('Failed to auto-start pending transfers:', error);
                    }
                }
            }

            // 更新上次运行的任务数量和最大并发数
            prevRunningTasksCountRef.current = runningTasksCount;
            prevMaxConcurrentRef.current = maxConcurrent;
        })();
    }, [tasks, maxConcurrent, onTaskUpdate]); // 当任务列表或最大并发数改变时重新运行

    // 检测新完成的任务并触发淡出动画
    useEffect(() => {
        const completedTasks = tasks.filter(task => task.status === 'completed');

        completedTasks.forEach(task => {
            if (!fadingTasks.has(task.id) && !hiddenTasks.has(task.id)) {
                // 如果这是初始就完成的任务，直接隐藏，不播放动画
                if (initiallyCompletedTasks.has(task.id)) {
                    setHiddenTasks(prev => new Set(prev).add(task.id));
                } else {
                    // 这是新完成的任务，播放淡出动画
                    setTimeout(() => {
                        setFadingTasks(prev => new Set(prev).add(task.id));

                        // 淡出动画完成后隐藏任务，然后删除
                        setTimeout(() => {
                            setHiddenTasks(prev => new Set(prev).add(task.id));

                            // 再延迟一点时间确保动画完全结束，然后删除任务
                            setTimeout(async () => {
                                try {
                                    await apiClient.deleteTransfer(task.id);
                                    onTaskUpdate(); // 刷新任务列表
                                } catch (error) {
                                    console.error('Failed to delete completed transfer:', error);
                                }
                            }, 100); // 等待100ms确保DOM操作完成
                        }, 800); // 淡出动画持续0.8秒
                    }, 500);
                }
            }
        });

        // 清理不再存在的任务的状态
        const existingTaskIds = new Set(tasks.map(t => t.id));
        setFadingTasks(prev => {
            const newSet = new Set<string>();
            for (const taskId of prev) {
                if (existingTaskIds.has(taskId)) {
                    newSet.add(taskId);
                }
            }
            return newSet;
        });

        setHiddenTasks(prev => {
            const newSet = new Set<string>();
            for (const taskId of prev) {
                if (existingTaskIds.has(taskId)) {
                    newSet.add(taskId);
                }
            }
            return newSet;
        });

        setInitiallyCompletedTasks(prev => {
            const newSet = new Set<string>();
            for (const taskId of prev) {
                if (existingTaskIds.has(taskId)) {
                    newSet.add(taskId);
                }
            }
            return newSet;
        });
    }, [tasks]);

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
                case 'start': {
                    // Start pending tasks, respecting max concurrent limit
                    const queuedTasks = tasks.filter(task => task.status !== 'pending');
                    const pendingTasks = tasks.filter(task => task.status === 'pending')
                        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

                    // 明确使用传入的maxConcurrent参数，而不是内部固定值
                    const availableSlots = maxConcurrent - queuedTasks.length;
                    targetTasks = pendingTasks.slice(0, Math.max(0, availableSlots));
                    break;
                }
                case 'pause': {
                    targetTasks = tasks.filter(task => task.status === 'running');
                    break;
                }
                case 'resume': {
                    // Resume paused tasks, respecting max concurrent limit
                    targetTasks = tasks.filter(task => task.status === 'paused');
                    break;
                }
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
            .filter(task => task.status === 'running' && !hiddenTasks.has(task.id))
            .reduce((sum, task) => sum + task.speed, 0);
    };

    const getActiveTasksCount = (): { running: number; pending: number; paused: number; total: number } => {
        // 只计算可见的任务
        const visibleTasks = tasks.filter(task => !hiddenTasks.has(task.id));
        const running = visibleTasks.filter(task => task.status === 'running').length;
        const pending = visibleTasks.filter(task => task.status === 'pending').length;
        const paused = visibleTasks.filter(task => task.status === 'paused').length;
        const total = visibleTasks.length;
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
                {getActiveTasksCount().total > 0 && (
                    <div className="flex items-center gap-2">
                        {/* Start All Button */}
                        {tasks.some(task => task.status === 'pending' && !hiddenTasks.has(task.id)) && (
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
                        {tasks.some(task => task.status === 'paused' && !hiddenTasks.has(task.id)) && (
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
                        {tasks.some(task => task.status === 'running' && !hiddenTasks.has(task.id)) && (
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
                        {tasks.some(task => ['running', 'paused', 'pending'].includes(task.status) && !hiddenTasks.has(task.id)) && (
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
                        {tasks.filter(task => !hiddenTasks.has(task.id)).length > 0 && (
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
                    {tasks.filter(task => !hiddenTasks.has(task.id)).map((task) => {
                        const isFading = fadingTasks.has(task.id);
                        const isCompleted = task.status === 'completed';

                        return (
                            <div
                                key={task.id}
                                className={`border border-gray-200 rounded-lg p-4 transition-all duration-700 transform ${isFading
                                    ? 'opacity-0 scale-95 -translate-y-2'
                                    : 'opacity-100 scale-100 translate-y-0'
                                    } ${isCompleted
                                        ? 'bg-green-50 border-green-200'
                                        : 'bg-white'
                                    }`}
                            >
                                {/* Task Header */}
                                <div className="flex items-center justify-between mb-3">
                                    <div className="flex items-center gap-3">
                                        <div className={`${isCompleted && !isFading ? 'animate-pulse' : ''}`}>
                                            {getStatusIcon(task.status)}
                                        </div>
                                        <div>
                                            <h3 className={`text-sm font-medium ${isCompleted ? 'text-green-800' : 'text-gray-900'}`}>
                                                {task.srcPath} → {task.destPath}
                                            </h3>
                                            <div className="flex items-center gap-2 mt-1">
                                                <span className={`text-xs px-2 py-1 rounded-full ${getStatusColor(task.status)}`}>
                                                    {task.status.charAt(0).toUpperCase() + task.status.slice(1)}
                                                    {isCompleted && <span className="ml-1">✨</span>}
                                                </span>
                                                <span className="text-xs text-gray-500">
                                                    {formatBytes(task.transferredSize)} / {formatBytes(task.totalSize)}
                                                </span>
                                                {isCompleted && task.startedAt && task.completedAt && (
                                                    <span className="text-xs text-green-600">
                                                        • {formatDuration((new Date(task.completedAt).getTime() - new Date(task.startedAt).getTime()) / 1000)}
                                                    </span>
                                                )}
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
