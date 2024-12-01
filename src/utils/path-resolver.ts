import path from 'path';
import os from 'os';
import process from 'process';
import RecFileSystem from '@services/rec-file-system';

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

// resolve relative path to absolute path in rec file system
export function resolveRecFullPath(rfs: RecFileSystem, inputPath: string): string {
    const cwd = rfs.pwd();
    const path = inputPath.startsWith("/") ? inputPath : cwd.stat ? cwd.data + "/" + inputPath : inputPath;
    // deal with ".." and "." in the path
    const paths = path.split("/");
    const resolvedPaths: string[] = [];
    for (const p of paths) {
        if (!p || p === ".") continue;
        if (p === "..") {
            if (resolvedPaths.length === 0) continue;
            resolvedPaths.pop();
            continue;
        }
        resolvedPaths.push(p);
    }
    return resolvedPaths.join("/");
}

const escapeMap: {[key: string]: string} = {
    '\\': '\\\\',  // 反斜杠转义
    "'": "\\'",    // 单引号转义
    '"': '\\"',    // 双引号转义
    '$': '\\$',    // 美元符号转义
    '`': '\\`',    // 反引号转义
    '#': '\\#',    // 井号转义
    '(': '\\(',    // 左括号转义
    ')': '\\)',    // 右括号转义
    '<': '\\<',    // 小于号转义
    '>': '\\>',    // 大于号转义
    '&': '\\&',    // 和号转义
    ';': '\\;',    // 分号转义
    '|': '\\|',    // 管道符转义
    '*': '\\*',    // 星号转义
    '?': '\\?',    // 问号转义
    '[': '\\[',    // 左方括号转义
    ']': '\\]',    // 右方括号转义
    '{': '\\{',    // 左花括号转义
    '}': '\\}',    // 右花括号转义
    ' ': '\\ ',    // 空格转义
    '\n': '\\n'    // 换行符转义
};

const unescapeMap: {[key: string]: string} = {
    '\\\\': '\\',  // 反斜杠还原
    "\\'": "'",    // 单引号还原
    '\\"': '"',    // 双引号还原
    '\\$': '$',    // 美元符号还原
    '\\`': '`',    // 反引号还原
    '\\#': '#',    // 井号还原
    '\\(': '(',    // 左括号还原
    '\\)': ')',    // 右括号还原
    '\\<': '<',    // 小于号还原
    '\\>': '>',    // 大于号还原
    '\\&': '&',    // 和号还原
    '\\;': ';',    // 分号还原
    '\\|': '|',    // 管道符还原
    '\\*': '*',    // 星号还原
    '\\?': '?',    // 问号还原
    '\\[': '[',    // 左方括号还原
    '\\]': ']',    // 右方括号还原
    '\\{': '{',    // 左花括号还原
    '\\}': '}',    // 右花括号还原
    '\\ ': ' ',    // 空格还原
    '\\n': '\n'    // 换行符还原
};

export function unescapeFromShell(path: string): string {
    return path.replace(/\\[\\'"\$\`#()<>;&|*?[\]{}\s\n]/g, (match) => {
        return unescapeMap[match] || match;
    });
}

export function escapeToShell(path: string): string {
    return path.replace(/[\\'"\$\`#()<>;&|*?[\]{}\s\n]/g, (match) => {
        return escapeMap[match] || match;
    });
}
