// src/config.ts
import * as vscode from 'vscode';
import { GitOperationType } from './git-monitor';

/**
 * 依赖类型枚举
 */
export enum DependencyFieldType {
  Dependencies = 'dependencies',
  DevDependencies = 'devDependencies',
  PeerDependencies = 'peerDependencies',
  OptionalDependencies = 'optionalDependencies'
}

/**
 * 扩展配置接口
 */
export interface DependencyAlertConfig {
  /** 是否启用扩展 */
  enabled: boolean;

  /** 是否自动安装依赖 */
  autoInstall: boolean;

  /** 要监控的git操作类型 */
  gitOperationTypes: GitOperationType[];

  /** 要监控的依赖类型 */
  // dependencyFieldTypes: DependencyFieldType[];

  /** 要监控的依赖文件 */
  monitoredFiles: string[];
}

/**
 * 依赖文件的glob匹配模式
 */
export const DependencyFilePatterns = [
  'package.json',
];

/**
 * 获取用户配置
 */
export function getConfiguration(): DependencyAlertConfig {
  const config = vscode.workspace.getConfiguration('dependencyAlert');

  return {
    enabled: config.get<boolean>('enabled', true),
    autoInstall: config.get<boolean>('autoInstall', false),
    gitOperationTypes: config.get<GitOperationType[]>('gitOperationTypes', [
      GitOperationType.Pull,
      GitOperationType.Merge,
      GitOperationType.Rebase,
    ]),
    // dependencyFieldTypes: config.get<DependencyFieldType[]>('dependencyFieldTypes', [
    //   DependencyFieldType.Dependencies,
    //   DependencyFieldType.DevDependencies
    // ]),
    monitoredFiles: config.get<string[]>('monitoredFiles', DependencyFilePatterns)
  };
}