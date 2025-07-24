@echo off
chcp 65001 > nul
setlocal enabledelayedexpansion

:: 设置项目根目录
set "PROJECT_ROOT=%~dp0"
set "PROJECT_ROOT=%PROJECT_ROOT:~0,-1%"

echo [信息] 项目根目录: %PROJECT_ROOT%

:: 设置 node 和 npm 路径
set "NODE_DIR=%PROJECT_ROOT%\node-v22.17.1-win-x64"
set "NODE_PATH=%NODE_DIR%\node.exe"
set "NPM_PATH=%NODE_DIR%\npm.cmd"

:: 检查 node 和 npm 是否存在
if not exist "%NODE_PATH%" (
    echo [错误] 找不到 node.exe 在 %NODE_PATH%
    pause
    exit /b 1
)

if not exist "%NPM_PATH%" (
    echo [错误] 找不到 npm.cmd 在 %NPM_PATH%
    pause
    exit /b 1
)

echo [信息] 使用 Node.js: %NODE_PATH%
echo [信息] 使用 npm: %NPM_PATH%

:: 临时设置 PATH，确保使用项目自带的 node
set "PATH=%NODE_DIR%;%PATH%"

:: 配置 npm 镜像源
echo.
echo [配置] 正在配置 npm 镜像源...
call "%NPM_PATH%" config set registry https://registry.npmmirror.com

:: 设置各种二进制包的镜像源（通过环境变量）
set "DISTURL=https://npmmirror.com/dist"
set "ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/"
set "ELECTRON_BUILDER_BINARIES_MIRROR=https://npmmirror.com/mirrors/electron-builder-binaries/"
set "PHANTOMJS_CDNURL=https://npmmirror.com/mirrors/phantomjs/"
set "CHROMEDRIVER_CDNURL=https://npmmirror.com/mirrors/chromedriver/"
set "OPERADRIVER_CDNURL=https://npmmirror.com/mirrors/operadriver/"
set "SASS_BINARY_SITE=https://npmmirror.com/mirrors/node-sass/"
set "PYTHON_MIRROR=https://npmmirror.com/mirrors/python/"

echo [成功] npm 镜像源配置完成！
echo [信息] 主镜像源: https://registry.npmmirror.com
echo [信息] 二进制包镜像源已通过环境变量设置

:: 1. 在项目根目录执行 npm install
echo.
echo [步骤1] 正在安装根目录依赖...
cd /d "%PROJECT_ROOT%"
call "%NPM_PATH%" install

if !errorlevel! neq 0 (
    echo [错误] 根目录 npm install 失败!
    pause
    exit /b 1
)

echo [成功] 根目录依赖安装完成!

:: 2. 安装客户端依赖
echo.
echo [步骤2] 正在安装客户端依赖...
call "%NPM_PATH%" run client:install

if !errorlevel! neq 0 (
    echo [错误] 客户端依赖安装失败!
    pause
    exit /b 1
)

echo [成功] 客户端依赖安装完成!

:: 3. 并发运行 server 和 client
echo.
echo [步骤3] 正在启动服务器和客户端...

:: 创建日志目录
if not exist "%PROJECT_ROOT%\logs" mkdir "%PROJECT_ROOT%\logs"
set "SERVER_LOG=%PROJECT_ROOT%\logs\reccli-ts-server.log"
set "CLIENT_LOG=%PROJECT_ROOT%\logs\reccli-ts-client.log"

echo [信息] 服务器日志将保存至: %SERVER_LOG%
echo [信息] 客户端日志将保存至: %CLIENT_LOG%

:: 直接启动服务器并重定向输出
cd /d "%PROJECT_ROOT%"
echo %date% %time% 服务器启动 > "%SERVER_LOG%"

:: 启动服务器（在新的命令提示符窗口中）
start "RecCLI Server" /min cmd /c "cd /d "%PROJECT_ROOT%" && "%NPM_PATH%" run server >> "%SERVER_LOG%" 2>&1"
echo [成功] 服务器已启动

:: 等待一下确保服务器启动
timeout /t 2 /nobreak > nul

:: 直接启动客户端并重定向输出
echo %date% %time% 客户端启动 > "%CLIENT_LOG%"

:: 启动客户端（在新的命令提示符窗口中）
start "RecCLI Client" /min cmd /c "cd /d "%PROJECT_ROOT%" && "%NPM_PATH%" run client >> "%CLIENT_LOG%" 2>&1"
echo [成功] 客户端已启动

echo.
echo [完成] 所有任务已启动完成!
echo [提示] 服务器窗口标题: RecCLI Server
echo [提示] 客户端窗口标题: RecCLI Client
echo [提示] 关闭相应窗口可停止服务
echo.
echo [镜像源] 当前使用 npmmirror.com 镜像源
echo [镜像源] 如需恢复官方源，请运行: npm config set registry https://registry.npmjs.org/
echo.
echo 按任意键退出...
pause > nul
