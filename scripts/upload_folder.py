import os
import subprocess
import shlex

# 配置本地路径和远程路径
local_path = "./upload"
remote_path = "/cloud/upload"

def escape_shell_path(path):
    """
    对路径进行 Shell 转义，处理空格等特殊字符
    """
    return shlex.quote(path)

def remote_path_exists(remote_path):
    """
    检查远程路径是否存在
    """
    parent_path = os.path.dirname(remote_path.rstrip('/'))
    directory_name = os.path.basename(remote_path.rstrip('/'))
    
    try:
        # 获取父目录的内容
        result = subprocess.run(
            f"reccli-ts run -c \"lsp {escape_shell_path(parent_path)}\"",
            shell=True,
            check=True,
            text=True,
            capture_output=True,
            encoding="utf-8"
        )
        # 检查是否存在目标文件夹
        items = result.stdout.splitlines()
        return any(item.strip() == f"{directory_name}/" for item in items)
    except subprocess.CalledProcessError:
        # 如果父目录不存在或查询失败，返回 False
        return False

def ensure_remote_path(remote_path):
    """
    确保远程路径存在，不存在时创建
    """
    if not remote_path_exists(remote_path):
        try:
            subprocess.run(
                f"reccli-ts run -c \"mkdir {escape_shell_path(remote_path)}\"",
                shell=True,
                check=True,
                encoding="utf-8"
            )
            print(f"Created remote directory: {remote_path}")
        except subprocess.CalledProcessError as e:
            print(f"Error creating directory {remote_path}: {e}")

def upload_file(local_file_path, remote_file_path):
    """
    上传单个文件到指定路径，路径需经过 Shell 转义
    """
    # 确保父文件夹存在
    parent_folder = os.path.dirname(remote_file_path)
    ensure_remote_path(parent_folder)
    
    try:
        # 上传文件到指定路径
        command = f"reccli-ts run -c \"upload {escape_shell_path(local_file_path)} {escape_shell_path(parent_folder)}\""
        subprocess.run(command, shell=True, check=True, encoding="utf-8")
        print(f"Uploaded: {local_file_path} -> {remote_file_path}")
    except subprocess.CalledProcessError as e:
        print(f"Error uploading {local_file_path}: {e}")

def process_local_path(local_path, remote_path):
    """
    递归处理本地路径，将文件上传到远程路径
    """
    # 确保远程根目录存在
    ensure_remote_path(remote_path)

    # 遍历本地路径下的所有文件和子目录
    for item in os.listdir(local_path):
        local_item_path = os.path.join(local_path, item)
        remote_item_path = f"{remote_path}/{item}"

        if os.path.isdir(local_item_path):
            # 如果是目录，递归处理子目录
            ensure_remote_path(remote_item_path)
            process_local_path(local_item_path, remote_item_path)
        else:
            # 上传文件到远程路径
            upload_file(local_item_path, remote_item_path)

if __name__ == "__main__":
    # 开始处理本地目录
    process_local_path(local_path, remote_path)
