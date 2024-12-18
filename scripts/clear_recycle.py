#!/usr/bin/env python3

# =============================================================================
# WARNING: This script will permanently delete files in the recycle bin.
# Make sure you understand the risks before running this script.
# =============================================================================

import subprocess
import shlex

def escape_shell_path(path):
    """
    对路径进行 Shell 转义，处理空格等特殊字符
    """
    return shlex.quote(path)

def get_remote_recycle_files():
    """
    获取远程路径下的文件和子文件夹列表
    """
    try:
        result = subprocess.run(
            f"reccli-ts run -c \"lsp /recycle\"",
            shell=True,
            check=True,
            text=True,
            capture_output=True,
            encoding="utf-8"
        )
        # 返回按行分割的结果
        return result.stdout.splitlines()
    except subprocess.CalledProcessError as e:
        print(f"Error retrieving files in recycle: {e}")
        return []

def clear_recycle():
    # 获取远程回收站文件列表
    items = get_remote_recycle_files()
    
    for item in items:
        item_name = item.strip()
        if not item_name:
            continue # 跳过空行
        
        # 构建远程完整路径
        remote_file_path = f"/recycle/{item_name}"
        try:
            command = f"reccli-ts run -c \"rm {escape_shell_path(remote_file_path)}\""
            subprocess.run(command, shell=True, check=True, encoding="utf-8")
            print(f"Removed: {remote_file_path}")
        except subprocess.CalledProcessError as e:
            print(f"Error removing {remote_file_path}: {e}")
        
if __name__ == "__main__":
    clear_recycle()