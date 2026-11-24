import { realpath } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';

export function inside(base: string, target: string): boolean {
  return target === base || target.startsWith(base + sep);
}

/**
 * 把相对路径解析到 root 内：先做词法校验，再用 realpath 防住软链接逃逸。
 * 目标不存在时（写新文件）校验最近的已存在父目录。
 */
export async function resolveWithin(base: string, rel: string): Promise<string> {
  const target = resolve(base, rel);
  if (!inside(base, target)) throw new Error('路径不在工作目录内');

  try {
    const real = await realpath(target);
    if (!inside(base, real)) throw new Error('路径不在工作目录内');
    return real;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    const parent = await realpath(dirname(target));
    if (!inside(base, parent)) throw new Error('路径不在工作目录内');
    return target;
  }
}

export async function rootPath(root: string): Promise<string> {
  return realpath(resolve(root));
}
