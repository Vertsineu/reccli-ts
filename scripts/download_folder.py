#!/usr/bin/env python3

import os
import subprocess
import shlex

# 配置远程路径和本地路径
remote_path = "/cloud/download"
local_path = "./download"

# 确保本地路径存在
os.makedirs(local_path, exist_ok=True)

def escape_shell_path(path):
    """
    对路径进行 Shell 转义，处理空格等特殊字符
    """
    return shlex.quote(path)

def get_remote_files(remote_path):
    """
    获取远程路径下的文件和子文件夹列表
    """
    try:
        result = subprocess.run(
            f"reccli-ts run -c \"lsp {escape_shell_path(remote_path)}\"",
            shell=True,
            check=True,
            text=True,
            capture_output=True,
            encoding="utf-8"
        )
        # 返回按行分割的结果
        return result.stdout.splitlines()
    except subprocess.CalledProcessError as e:
        print(f"Error retrieving files in {remote_path}: {e}")
        return []

def download_file(remote_file_path, local_file_path):
    """
    下载单个文件，路径需经过 Shell 转义
    """
    try:
        command = f"reccli-ts run -c \"download {escape_shell_path(remote_file_path)} {escape_shell_path(local_file_path)}\""
        subprocess.run(command, shell=True, check=True, encoding="utf-8")
        print(f"Downloaded: {remote_file_path} -> {local_file_path}")
    except subprocess.CalledProcessError as e:
        print(f"Error downloading {remote_file_path}: {e}")

def process_remote_path(remote_path, local_path):
    """
    递归处理远程路径，下载文件并进入子目录
    """
    # 获取当前路径下的文件和目录列表
    items = get_remote_files(remote_path)

    for item in items:
        item_name = item.strip()
        if not item_name:
            continue  # 跳过空行

        # 构建远程完整路径
        remote_item_path = f"{remote_path}/{item_name}"

        # 如果是目录（以 '/' 结尾）
        if item_name.endswith('/'):
            # 创建对应的本地目录
            local_dir_path = os.path.join(local_path, item_name.rstrip('/'))
            os.makedirs(local_dir_path, exist_ok=True)

            # 递归处理子目录
            process_remote_path(remote_item_path.rstrip('/'), local_dir_path)
        else:
            # 下载文件
            local_file_path = os.path.join(local_path, item_name)
            download_file(remote_item_path, local_file_path)

if __name__ == "__main__":
    # 开始处理根目录
    process_remote_path(remote_path, local_path)
