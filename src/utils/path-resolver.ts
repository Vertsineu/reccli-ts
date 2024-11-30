import path from 'path';
import os from 'os';
import process from 'process';

// 使用正则表达式解析环境变量
function resolveEnvVariables(inputPath: string): string {
    return inputPath.replace(/\${([^}]+)}/g, (_, varName) => {
        return process.env[varName] || ''; // 替换为环境变量的值
    }).replace(/\$([a-zA-Z_][a-zA-Z0-9_]*)/g, (_, varName) => {
        return process.env[varName] || ''; // 替换为环境变量的值
    });
}

// 解析 ~ 为用户主目录
function resolveTilde(inputPath: string): string {
    if (inputPath.startsWith('~')) {
        return path.join(os.homedir(), inputPath.slice(1));
    }
    return inputPath;
}

// 综合解析路径，支持 ~、环境变量和相对路径
export function resolveFullPath(inputPath: string): string {
    // 先解析环境变量
    let pathWithEnv = resolveEnvVariables(inputPath);
    
    // 再解析 ~ 为用户主目录
    pathWithEnv = resolveTilde(pathWithEnv);
    
    // 最后解析为绝对路径（如果是相对路径）
    return path.resolve(pathWithEnv);
}
