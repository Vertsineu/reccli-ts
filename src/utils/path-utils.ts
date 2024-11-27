import path from 'path';
import os from 'os';
import process from 'process';

/**
 * 解析 Shell 风格的路径，支持 ~ 和环境变量。
 * @param shellPath Shell 风格的路径
 * @returns 解析后的绝对路径
 */
export function resolveShellPath(shellPath: string): string {
  let resolvedPath = shellPath;

  // 1. 解析 ~ 为主目录
  if (resolvedPath.startsWith('~')) {
    resolvedPath = path.join(os.homedir(), resolvedPath.slice(1));
  }

  // 2. 替换环境变量 ($VAR 或 ${VAR})
  resolvedPath = resolvedPath.replace(/\$(\w+)|\${(\w+)}/g, (_, varName1, varName2) => {
    const varName = varName1 || varName2;
    return process.env[varName] || '';
  });

  // 3. 返回绝对路径
  return path.resolve(resolvedPath);
}
