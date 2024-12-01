#!/bin/bash

# 配置远程路径和本地路径
remotePath="/cloud"
localPath="./download"

# 确保本地路径存在
mkdir -p "$localPath"

# 数组，用于存储下载命令
download_commands=()

# 获取远程路径下的所有文件列表
file_list=$(reccli-ts run -c "lsp $remotePath")

# 遍历文件列表
while IFS= read -r name; do
    # 如果文件名不为空且不以 "/" 结尾，则为文件
    if [[ -n "$name" && ! "$name" =~ /$ ]]; then
        # 构建远程文件路径
        remoteFilePath="$remotePath/$name"

        # 将下载命令添加到数组中
        download_commands+=("\"download $remoteFilePath $localPath\"")
    fi
done <<< "$file_list"

# 执行最终的命令，使用数组展开
eval reccli-ts run -c "${download_commands[@]}"

