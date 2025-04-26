// src/utils.ts
import * as fs from 'fs/promises';
import * as path from 'path';
import { DependencyFieldType } from './config';
import { exec } from 'child_process';
import { promisify } from 'util';

export const execAsync = promisify(exec);

/**
 * 依赖信息接口
 */
export interface DependencyFieldInfo {
  [DependencyFieldType.Dependencies]?: Record<string, string>;
  [DependencyFieldType.DevDependencies]?: Record<string, string>;
  [DependencyFieldType.PeerDependencies]?: Record<string, string>;
  [DependencyFieldType.OptionalDependencies]?: Record<string, string>;
}

/**
 * 依赖变更信息
 */
export interface DependencyFieldChanges {
  hasChanges: boolean;
  added: Record<string, string>;
  removed: Record<string, string>;
  updated: Record<string, { oldVersion: string; newVersion: string }>;
}

/**
 * 解析package.json文件，提取依赖信息
 * @param filePath package.json文件路径
 * @param dependencyFieldTypes 要提取的依赖类型
 * @returns 依赖信息对象，如果文件不存在或解析失败则返回null
 */
export async function parsePackageJson(filePath: string, dependencyFieldTypes: DependencyFieldType[]): Promise<DependencyFieldInfo | null> {
  try {
    await fs.access(filePath);

    const fileContent = await fs.readFile(filePath, 'utf-8');
    const packageJson = JSON.parse(fileContent);

    const result: DependencyFieldInfo = {};

    // 提取各类依赖
    for (const depFieldType of dependencyFieldTypes) {
      if (packageJson[depFieldType]) {
        result[depFieldType] = packageJson[depFieldType];
      }
    }

    return result;
  } catch (error) {
    console.error(`解析package.json文件失败: ${filePath}`, error);
    return null;
  }
}

/**
 * 检测依赖字段是否有变更
 * @param oldDeps 旧的依赖字段信息
 * @param newDeps 新的依赖字段信息
 * @param fieldType 依赖字段类型
 * @returns 依赖字段变更信息
 */
export function detectDependencyFieldChanges(
  oldDeps: Record<string, string> | undefined,
  newDeps: Record<string, string> | undefined
): DependencyFieldChanges {
  const changes: DependencyFieldChanges = {
    hasChanges: false,
    added: {},
    removed: {},
    updated: {}
  };

  // 如果两者都为空，则无变化
  if (!oldDeps && !newDeps) {
    return changes;
  }

  // 如果原来没有依赖字段，现在有了，则全部为新增
  if (!oldDeps && newDeps) {
    changes.hasChanges = Object.keys(newDeps).length > 0;
    changes.added = { ...newDeps };
    return changes;
  }

  // 如果原来有依赖字段，现在没有了，则全部为删除
  if (oldDeps && !newDeps) {
    changes.hasChanges = Object.keys(oldDeps).length > 0;
    changes.removed = { ...oldDeps };
    return changes;
  }

  // 确保oldDeps和newDeps不为undefined
  const oldDepsMap = oldDeps || {};
  const newDepsMap = newDeps || {};

  // 检查新增和更新的依赖字段
  for (const [pkg, version] of Object.entries(newDepsMap)) {
    if (!(pkg in oldDepsMap)) {
      changes.added[pkg] = version;
      changes.hasChanges = true;
    } else if (oldDepsMap[pkg] !== version) {
      changes.updated[pkg] = {
        oldVersion: oldDepsMap[pkg],
        newVersion: version
      };
      changes.hasChanges = true;
    }
  }

  // 检查删除的依赖
  for (const [pkg, version] of Object.entries(oldDepsMap)) {
    if (!(pkg in newDepsMap)) {
      changes.removed[pkg] = version;
      changes.hasChanges = true;
    }
  }

  return changes;
}