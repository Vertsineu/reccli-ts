import React, { useState, useEffect } from 'react';
import {
    Folder,
    File,
    ChevronRight,
    Home,
    RefreshCw,
    CheckSquare,
    Square,
    MousePointer
} from 'lucide-react';
import { FileItem } from '@/types/api';
import { apiClient } from '@/services/api';

interface FileExplorerProps {
    type: 'rec' | 'pandav';
    title: string;
    onFileSelect?: (files: FileItem[], currentPath: string) => void;
    onPathChange?: (path: string) => void;
    onSizeCalculated?: (size: number, calculating: boolean) => void;
    className?: string;
    allowSelection?: boolean;
    clearSelection?: boolean;
}

const FileExplorer: React.FC<FileExplorerProps> = ({
    type,
    title,
    onFileSelect,
    onPathChange,
    onSizeCalculated,
    className = '',
    allowSelection = true,
    clearSelection = false,
}) => {
    const [files, setFiles] = useState<FileItem[]>([]);
    const [currentPath, setCurrentPath] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string>('');
    const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
    const [selectedItemsSize, setSelectedItemsSize] = useState<number>(0);
    const [calculatingSize, setCalculatingSize] = useState(false); const loadFiles = async (path: string = '') => {
        setLoading(true);
        setError('');
        try {
            let fileList: FileItem[];
            if (type === 'rec') {
                fileList = await apiClient.recListFiles(path);
            } else {
                fileList = await apiClient.panDavListFiles(path);
            }
            setFiles(fileList);
            setCurrentPath(path);
            onPathChange?.(path);
        } catch (err: any) {
            setError(err.response?.data?.error || 'Failed to load files');
            setFiles([]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadFiles();
    }, [type]);

    // Clear selection when clearSelection prop changes
    useEffect(() => {
        if (clearSelection) {
            setSelectedItems(new Set());
            setSelectedItemsSize(0);
            onFileSelect?.([], currentPath);
        }
    }, [clearSelection, currentPath, onFileSelect]);

    // Check if item can be selected based on current path and file type
    const canItemBeSelected = (file: FileItem): boolean => {
        if (type === 'rec') {
            // Root level folders cannot be selected
            if (currentPath === '' && file.type === 'directory') {
                return false;
            }

            // Folders under /group cannot be selected
            if (currentPath === 'group' && file.type === 'directory') {
                return false;
            }

            return true;
        } else if (type === 'pandav') {
            // Root level folders cannot be selected for PanDav
            if (currentPath === '' && file.type === 'directory') {
                return false;
            }

            return true;
        }

        return true;
    };

    const handleItemClick = (file: FileItem, event: React.MouseEvent) => {
        if (file.type === 'directory') {
            if (event.ctrlKey || event.metaKey) {
                // Ctrl+Click to select/deselect folder for transfer
                if (allowSelection && onFileSelect && canItemBeSelected(file)) {
                    handleItemSelection(file);
                }
            } else {
                // Regular click to navigate into folder
                const newPath = currentPath ? `${currentPath}/${file.name}` : file.name;
                loadFiles(newPath);
            }
        } else {
            // File selection
            if (allowSelection && onFileSelect && canItemBeSelected(file)) {
                handleItemSelection(file);
            }
        }
    };

    // Calculate the actual disk usage of selected items using du
    const calculateSelectedItemsSize = async (selectedFileObjects: FileItem[]) => {
        if (type !== 'rec' || selectedFileObjects.length === 0) {
            setSelectedItemsSize(0);
            onSizeCalculated?.(0, false);
            return;
        }

        setCalculatingSize(true);
        onSizeCalculated?.(selectedItemsSize, true);

        try {
            let totalSize = 0;
            for (const file of selectedFileObjects) {
                const filePath = currentPath ? `${currentPath}/${file.name}` : file.name;
                try {
                    const duSize = await apiClient.recGetPathSize(filePath);
                    totalSize += duSize;
                } catch (error) {
                    console.error(`Failed to get size for ${filePath}:`, error);
                    // Fallback to ls size if du fails
                    totalSize += file.size;
                }
            }
            setSelectedItemsSize(totalSize);
            onSizeCalculated?.(totalSize, false);
        } catch (error) {
            console.error('Failed to calculate selected items size:', error);
            // Fallback to summing ls sizes
            const fallbackSize = selectedFileObjects.reduce((sum, file) => sum + file.size, 0);
            setSelectedItemsSize(fallbackSize);
            onSizeCalculated?.(fallbackSize, false);
        } finally {
            setCalculatingSize(false);
        }
    };

    const handleItemSelection = (file: FileItem) => {
        const fileId = `${currentPath}/${file.name}`.replace(/^\//, '');
        const newSelectedItems = new Set(selectedItems);

        if (newSelectedItems.has(fileId)) {
            newSelectedItems.delete(fileId);
        } else {
            newSelectedItems.add(fileId);
        }

        setSelectedItems(newSelectedItems);

        // Create FileItem objects for selected items
        const selectedFileObjects = files.filter(f => {
            const id = `${currentPath}/${f.name}`.replace(/^\//, '');
            return newSelectedItems.has(id);
        });

        onFileSelect?.(selectedFileObjects, currentPath);

        // Calculate actual disk usage
        calculateSelectedItemsSize(selectedFileObjects);
    };

    const handleSelectAll = () => {
        const selectableFiles = files.filter(file => canItemBeSelected(file));
        const selectableFileIds = selectableFiles.map(f => `${currentPath}/${f.name}`.replace(/^\//, ''));
        const selectedSelectableItems = Array.from(selectedItems).filter(id =>
            selectableFileIds.includes(id)
        );

        if (selectedSelectableItems.length === selectableFiles.length && selectableFiles.length > 0) {
            // Deselect all selectable items
            const newSelectedItems = new Set(selectedItems);
            selectableFileIds.forEach(id => newSelectedItems.delete(id));
            setSelectedItems(newSelectedItems);

            // Update with remaining selected items
            const remainingSelectedFiles = files.filter(f => {
                const id = `${currentPath}/${f.name}`.replace(/^\//, '');
                return newSelectedItems.has(id);
            });
            onFileSelect?.(remainingSelectedFiles, currentPath);
            calculateSelectedItemsSize(remainingSelectedFiles);
        } else {
            // Select all selectable items
            const newSelectedItems = new Set(selectedItems);
            selectableFileIds.forEach(id => newSelectedItems.add(id));
            setSelectedItems(newSelectedItems);

            // Update with all selected items
            const allSelectedFiles = files.filter(f => {
                const id = `${currentPath}/${f.name}`.replace(/^\//, '');
                return newSelectedItems.has(id);
            });
            onFileSelect?.(allSelectedFiles, currentPath);
            calculateSelectedItemsSize(allSelectedFiles);
        }
    };

    const handleCheckboxClick = (file: FileItem, event: React.MouseEvent) => {
        event.stopPropagation(); // Prevent navigation
        if (canItemBeSelected(file)) {
            handleItemSelection(file);
        }
    }; const navigateUp = () => {
        const pathParts = currentPath.split('/').filter(Boolean);
        if (pathParts.length > 0) {
            pathParts.pop();
            const newPath = pathParts.join('/');
            loadFiles(newPath);
        }
    };

    const navigateToRoot = () => {
        loadFiles('');
    };

    const formatFileSize = (bytes: number): string => {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    const formatDate = (dateString?: string): string => {
        if (!dateString) return '';
        return new Date(dateString).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
    };

    return (
        <div className={`card h-full flex flex-col ${className}`}>
            {/* Header */}
            <div className="flex items-center justify-between mb-4 pb-4 border-b border-gray-200">
                <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
                <div className="flex items-center gap-2">
                    {allowSelection && (() => {
                        const selectableFiles = files.filter(file => canItemBeSelected(file));
                        const selectableFileIds = selectableFiles.map(f => `${currentPath}/${f.name}`.replace(/^\//, ''));
                        const selectedSelectableItems = Array.from(selectedItems).filter(id =>
                            selectableFileIds.includes(id)
                        );
                        const hasSelectableItems = selectableFiles.length > 0;

                        return hasSelectableItems ? (
                            <button
                                onClick={handleSelectAll}
                                className="flex items-center gap-2 px-3 py-1 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
                                title={selectedSelectableItems.length === selectableFiles.length && selectableFiles.length > 0 ? "Deselect All" : "Select All"}
                            >
                                {selectedSelectableItems.length === selectableFiles.length && selectableFiles.length > 0 ? (
                                    <CheckSquare className="w-4 h-4" />
                                ) : (
                                    <Square className="w-4 h-4" />
                                )}
                                {selectedSelectableItems.length === selectableFiles.length && selectableFiles.length > 0 ? "Deselect All" : "Select All"}
                            </button>
                        ) : null;
                    })()}
                    <button
                        onClick={() => loadFiles(currentPath)}
                        disabled={loading}
                        className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                        title="Refresh"
                    >
                        <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                    </button>
                </div>
            </div>

            {/* Navigation */}
            <div className="flex items-center gap-2 mb-4 text-sm">
                <button
                    onClick={navigateToRoot}
                    className="flex items-center gap-1 px-2 py-1 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded transition-colors"
                >
                    <Home className="w-4 h-4" />
                    Root
                </button>

                {currentPath && (
                    <>
                        <ChevronRight className="w-4 h-4 text-gray-400" />
                        <div className="flex items-center gap-1">
                            {currentPath.split('/').map((part, index, array) => (
                                <React.Fragment key={`breadcrumb-${index}-${part}`}>
                                    {index > 0 && <ChevronRight className="w-4 h-4 text-gray-400" />}
                                    <span
                                        className={`px-2 py-1 rounded ${index === array.length - 1
                                            ? 'bg-primary-100 text-primary-700'
                                            : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100 cursor-pointer'
                                            }`}
                                        onClick={() => {
                                            if (index < array.length - 1) {
                                                const newPath = array.slice(0, index + 1).join('/');
                                                loadFiles(newPath);
                                            }
                                        }}
                                    >
                                        {part}
                                    </span>
                                </React.Fragment>
                            ))}
                        </div>
                    </>
                )}

                {currentPath && (
                    <>
                        <div className="flex-1" />
                        <button
                            onClick={navigateUp}
                            className="flex items-center gap-1 px-2 py-1 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded transition-colors"
                        >
                            ← Back
                        </button>
                    </>
                )}
            </div>

            {/* Error Display */}
            {error && (
                <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg mb-4">
                    {error}
                </div>
            )}

            {/* File List */}
            <div className="flex-1 overflow-y-auto">
                {loading ? (
                    <div className="flex items-center justify-center py-12">
                        <RefreshCw className="w-6 h-6 animate-spin text-gray-400" />
                    </div>
                ) : files.length === 0 ? (
                    <div className="flex items-center justify-center py-12 text-gray-500">
                        <div className="text-center">
                            <Folder className="w-12 h-12 mx-auto mb-2 text-gray-300" />
                            <p>No files found</p>
                        </div>
                    </div>
                ) : (
                    <div className="space-y-1">
                        {files.map((file) => {
                            const fileId = `${currentPath}/${file.name}`.replace(/^\//, '');
                            const isSelected = selectedItems.has(fileId);
                            const canBeSelected = canItemBeSelected(file);

                            return (
                                <div
                                    key={file.id || file.name}
                                    className={`file-item ${isSelected ? 'selected' : ''} ${file.type === 'directory' ? 'cursor-pointer' : ''}`}
                                    onClick={(e) => handleItemClick(file, e)}
                                    title={file.type === 'directory' ? 'Click to navigate, Ctrl+Click to select' : 'Click to select'}
                                >
                                    {/* Selection checkbox */}
                                    {allowSelection && canBeSelected && (
                                        <div className="flex-shrink-0 pr-2">
                                            <button
                                                onClick={(e) => handleCheckboxClick(file, e)}
                                                className="p-1 hover:bg-gray-100 rounded"
                                                title="Select/Deselect"
                                            >
                                                {isSelected ? (
                                                    <CheckSquare className="w-4 h-4 text-primary-600" />
                                                ) : (
                                                    <Square className="w-4 h-4 text-gray-400" />
                                                )}
                                            </button>
                                        </div>
                                    )}

                                    <div className="flex-shrink-0">
                                        {file.type === 'directory' ? (
                                            <Folder className="w-5 h-5 text-blue-500" />
                                        ) : (
                                            <File className="w-5 h-5 text-gray-500" />
                                        )}
                                    </div>

                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center justify-between">
                                            <p className="text-sm font-medium text-gray-900 truncate">
                                                {file.name}
                                            </p>
                                            {file.type === 'file' && (
                                                <span className="text-xs text-gray-500 ml-2">
                                                    {formatFileSize(file.size)}
                                                </span>
                                            )}
                                        </div>

                                        {(file.creator || file.lastModified) && (
                                            <div className="flex items-center gap-4 text-xs text-gray-500 mt-1">
                                                {file.creator && <span>By {file.creator}</span>}
                                                {file.lastModified && <span>{formatDate(file.lastModified)}</span>}
                                            </div>
                                        )}
                                    </div>

                                    {/* Navigation indicator for directories */}
                                    {file.type === 'directory' && (
                                        <div className="flex-shrink-0">
                                            <ChevronRight className="w-4 h-4 text-gray-400" />
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Selection Status */}
            {allowSelection && (
                <div className="border-t border-gray-200 pt-3 mt-3">
                    <div className="flex items-center justify-between">
                        <div className="text-sm text-gray-600">
                            Selected: {selectedItems.size} item{selectedItems.size > 1 ? 's' : ''}
                            {selectedItems.size > 0 && type === 'rec' && (
                                <span className="ml-2">
                                    ({calculatingSize ? (
                                        <span className="text-blue-500">calculating...</span>
                                    ) : (
                                        <span className="font-medium">{formatFileSize(selectedItemsSize)}</span>
                                    )})
                                </span>
                            )}
                        </div>
                        {selectedItems.size > 0 && (
                            <button
                                onClick={() => {
                                    setSelectedItems(new Set());
                                    setSelectedItemsSize(0);
                                    onFileSelect?.([], currentPath);
                                }}
                                className="text-xs text-gray-500 hover:text-gray-700 underline"
                            >
                                Clear selection
                            </button>
                        )}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                        {type === 'rec' ? (
                            <>
                                <MousePointer className="w-3 h-3 inline mr-1" />
                                Click folders to enter • Use checkboxes to select •
                                <CheckSquare className="w-3 h-3 inline mx-1" />
                                Select All button
                                {selectedItems.size > 0 && (
                                    <span className="ml-2 text-blue-500">• Size calculated with du</span>
                                )}
                            </>
                        ) : (
                            'Navigate to destination folder'
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default FileExplorer;
