#!/bin/bash

# 设置字符编码
export LANG=zh_CN.UTF-8
export LC_ALL=zh_CN.UTF-8

# 设置项目根目录
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "[信息] 项目根目录: $PROJECT_ROOT"

# 设置 node 和 npm 路径
NODE_DIR="$PROJECT_ROOT/node-v22.17.1-linux-x64"
NODE_PATH="$NODE_DIR/bin/node"
NPM_PATH="$NODE_DIR/bin/npm"

# 检查 node 和 npm 是否存在
if [ ! -f "$NODE_PATH" ]; then
    echo "[错误] 找不到 node 在 $NODE_PATH"
    read -p "按回车键退出..."
    exit 1
fi

if [ ! -f "$NPM_PATH" ]; then
    echo "[错误] 找不到 npm 在 $NPM_PATH"
    read -p "按回车键退出..."
    exit 1
fi

echo "[信息] 使用 Node.js: $NODE_PATH"
echo "[信息] 使用 npm: $NPM_PATH"

# 临时设置 PATH，确保使用项目自带的 node
export PATH="$NODE_DIR/bin:$PATH"

# 配置 npm 镜像源
echo
echo "[配置] 正在配置 npm 镜像源..."
"$NPM_PATH" config set registry https://registry.npmmirror.com

# 设置各种二进制包的镜像源（通过环境变量）
export DISTURL="https://npmmirror.com/dist"
export ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"
export ELECTRON_BUILDER_BINARIES_MIRROR="https://npmmirror.com/mirrors/electron-builder-binaries/"
export PHANTOMJS_CDNURL="https://npmmirror.com/mirrors/phantomjs/"
export CHROMEDRIVER_CDNURL="https://npmmirror.com/mirrors/chromedriver/"
export OPERADRIVER_CDNURL="https://npmmirror.com/mirrors/operadriver/"
export SASS_BINARY_SITE="https://npmmirror.com/mirrors/node-sass/"
export PYTHON_MIRROR="https://npmmirror.com/mirrors/python/"

echo "[成功] npm 镜像源配置完成！"
echo "[信息] 主镜像源: https://registry.npmmirror.com"
echo "[信息] 二进制包镜像源已通过环境变量设置"

# 1. 在项目根目录执行 npm install
echo
echo "[步骤1] 正在安装根目录依赖..."
cd "$PROJECT_ROOT"
"$NPM_PATH" install

if [ $? -ne 0 ]; then
    echo "[错误] 根目录 npm install 失败!"
    read -p "按回车键退出..."
    exit 1
fi

echo "[成功] 根目录依赖安装完成!"

# 2. 安装客户端依赖
echo
echo "[步骤2] 正在安装客户端依赖..."
"$NPM_PATH" run client:install

if [ $? -ne 0 ]; then
    echo "[错误] 客户端依赖安装失败!"
    read -p "按回车键退出..."
    exit 1
fi

echo "[成功] 客户端依赖安装完成!"

# 3. 并发运行 server 和 client
echo
echo "[步骤3] 正在启动服务器和客户端..."

# 创建日志目录（如果不存在）
mkdir -p "$PROJECT_ROOT/logs"
SERVER_LOG="$PROJECT_ROOT/logs/reccli-ts-server.log"
echo "[信息] 服务器日志将保存至: $SERVER_LOG"

# 启动服务器（在新的终端窗口中，后台运行）
if command -v gnome-terminal &> /dev/null; then
    # GNOME Terminal
    gnome-terminal --title="RecCLI Server" --working-directory="$PROJECT_ROOT" -- bash -c "\"$NPM_PATH\" run server 2>&1 | tee \"$SERVER_LOG\"; exec bash" &
    SERVER_PID=$!
elif command -v konsole &> /dev/null; then
    # KDE Konsole
    konsole --title="RecCLI Server" --workdir="$PROJECT_ROOT" -e bash -c "\"$NPM_PATH\" run server 2>&1 | tee \"$SERVER_LOG\"; exec bash" &
    SERVER_PID=$!
elif command -v xterm &> /dev/null; then
    # xterm
    xterm -title "RecCLI Server" -e bash -c "cd \"$PROJECT_ROOT\" && \"$NPM_PATH\" run server 2>&1 | tee \"$SERVER_LOG\"; exec bash" &
    SERVER_PID=$!
else
    # 回退到后台运行
    echo "[警告] 未找到支持的终端模拟器，服务器将在后台运行"
    nohup "$NPM_PATH" run server 2>&1 | tee "$SERVER_LOG" &
    SERVER_PID=$!
    echo "[信息] 服务器 PID: $SERVER_PID"
fi

echo "[成功] 服务器已启动"

# 设置客户端日志文件
CLIENT_LOG="$PROJECT_ROOT/logs/reccli-ts-client.log"
echo "[信息] 客户端日志将保存至: $CLIENT_LOG"

# 启动客户端（在新的终端窗口中，后台运行）
if command -v gnome-terminal &> /dev/null; then
    # GNOME Terminal
    gnome-terminal --title="RecCLI Client" --working-directory="$PROJECT_ROOT" -- bash -c "\"$NPM_PATH\" run client 2>&1 | tee \"$CLIENT_LOG\"; exec bash" &
    CLIENT_PID=$!
elif command -v konsole &> /dev/null; then
    # KDE Konsole
    konsole --title="RecCLI Client" --workdir="$PROJECT_ROOT" -e bash -c "\"$NPM_PATH\" run client 2>&1 | tee \"$CLIENT_LOG\"; exec bash" &
    CLIENT_PID=$!
elif command -v xterm &> /dev/null; then
    # xterm
    xterm -title "RecCLI Client" -e bash -c "cd \"$PROJECT_ROOT\" && \"$NPM_PATH\" run client 2>&1 | tee \"$CLIENT_LOG\"; exec bash" &
    CLIENT_PID=$!
else
    # 回退到后台运行
    echo "[警告] 未找到支持的终端模拟器，客户端将在后台运行"
    nohup "$NPM_PATH" run client 2>&1 | tee "$CLIENT_LOG" &
    CLIENT_PID=$!
    echo "[信息] 客户端 PID: $CLIENT_PID"
fi

echo "[成功] 客户端已启动"

# 等待一下确保服务都启动
sleep 2

echo
echo "[完成] 所有任务已启动完成!"
echo "[提示] 服务器窗口标题: RecCLI Server"
echo "[提示] 客户端窗口标题: RecCLI Client"
echo "[提示] 关闭相应窗口可停止服务"
echo
echo "[镜像源] 当前使用 npmmirror.com 镜像源"
echo "[镜像源] 如需恢复官方源，请运行: npm config set registry https://registry.npmjs.org/"
echo
echo "按回车键退出..."
read
