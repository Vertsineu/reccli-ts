export function byteToSize(bytes: number): string {
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    if (bytes === 0) return '0 Byte';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    if (i === 0) return bytes + ' ' + sizes[i];
    return (bytes / Math.pow(1024, i)).toFixed(2) + ' ' + sizes[i];
}

export function byteToRate(bytesPerSecond: number): string {
    const sizes = ['B/s', 'KB/s', 'MB/s', 'GB/s', 'TB/s'];
    if (bytesPerSecond === 0) return '0 B/s';
    const i = Math.floor(Math.log(bytesPerSecond) / Math.log(1024));
    if (i === 0) return bytesPerSecond.toFixed(0) + ' ' + sizes[i];
    return (bytesPerSecond / Math.pow(1024, i)).toFixed(2) + ' ' + sizes[i];
}