import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';
import { GitMonitor, GitOperationEvent } from './git-monitor';
import { getConfiguration } from './config';


/**
 * 包管理器类型
 */
export enum PackageManagerType {
  NPM = 'npm',
  Yarn = 'yarn',
  PNPM = 'pnpm'
}

/**
 * 依赖检查器类
 */
export class DependencyChecker implements vscode.Disposable {
  private disposables: vscode.Disposable[] = [];
  private gitMonitor?: GitMonitor;
  private userConfig = getConfiguration();

  constructor() {
    // 注册命令
    this.disposables.push(
      vscode.commands.registerCommand('dependency-alert.installDependencies',
        (folderPath: string) => {
          this.handleInstallDependencies(folderPath)
        }
      ),
      vscode.commands.registerCommand('dependency-alert.showDiff',
        (packageJsonPath: string) => {
          this.showPackageJsonDiff(packageJsonPath)
        }
      )
    );

    // 监听配置变更
    this.disposables.push(
      vscode.workspace.onDidChangeConfiguration(e => {
        if (e.affectsConfiguration('dependencyAlert')) {
          this.userConfig = getConfiguration();
        }
      })
    );
  }

  /**
   * 连接Git监控器
   */
  public connectGitMonitor(gitMonitor: GitMonitor): void {
    if (!gitMonitor) {
      return;
    }
    this.gitMonitor = gitMonitor;

    // 监听Git操作事件
    this.disposables.push(
      this.gitMonitor.onGitOperation(this.onGitOperation.bind(this))
    );
  }

  /**
   * 处理Git操作事件
   */
  private onGitOperation(event: GitOperationEvent): void {
    try {
      // 检查每个依赖文件变更
      for (const depChange of event.dependencyChanges) {
        if (depChange.changed && depChange.file.endsWith('package.json')) {
          this.showAction(path.join(event.workspaceFolder.uri.fsPath, depChange.file))
        }
      }
    } catch (error) {
      console.error('处理Git操作事件失败:', error);
    }
  }

  /**
   * 显示操作
   */
  private showAction(packageJsonPath: string): void {
    try {
      // 构建通知消息
      const message = '检测到 package.json 文件变更';

      // 创建状态栏通知
      const notification = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
      notification.text = message;
      notification.tooltip = '点击查看package.json变更详情';
      notification.command = {
        title: '查看变更',
        command: 'dependency-alert.showDiff',
        arguments: [packageJsonPath]
      };
      notification.show();

      // 5秒后自动隐藏
      setTimeout(() => {
        notification.hide();
        notification.dispose();
      }, 5000);

      // 如果设置了自动安装依赖，则自动执行安装
      if (this.userConfig.autoInstall) {
        const workspaceFolder = path.dirname(packageJsonPath);
        this.handleInstallDependencies(workspaceFolder);

        // 只显示通知，不显示安装按钮
        vscode.window.showInformationMessage(
          `${message}，正在自动安装依赖...`,
          { title: '查看变更' }
        ).then(selection => {
          if (selection) {
            this.showPackageJsonDiff(packageJsonPath);
          }
        });
      } else {
        // 显示通知框，提供"安装依赖"和"查看变更"按钮
        const installItem = { title: '安装依赖' };
        const viewChangesItem = { title: '查看变更' };

        vscode.window.showInformationMessage(
          message,
          installItem,
          viewChangesItem
        ).then(selection => {
          if (selection === installItem) {
            // 安装依赖
            const workspaceFolder = path.dirname(packageJsonPath);
            this.handleInstallDependencies(workspaceFolder);
          } else if (selection === viewChangesItem) {
            // 查看变更
            this.showPackageJsonDiff(packageJsonPath);
          }
        });
      }
    } catch (error) {
      console.error('显示package.json变更通知失败:', error);
    }
  }

  /**
   * 处理安装依赖命令
   */
  private async handleInstallDependencies(folderPath: string): Promise<void> {
    const workspaceFolder = folderPath || this.getCurrentWorkspaceFolder()?.uri.fsPath;
    if (!workspaceFolder) {
      vscode.window.showErrorMessage('未找到有效的工作区文件夹');
      return;
    }

    try {
      // 检测包管理器类型
      const packageManager = await this.detectPackageManager(workspaceFolder);

      // 根据包管理器类型选择安装命令
      let command: string;
      switch (packageManager) {
        case PackageManagerType.Yarn:
          command = 'yarn';
          break;
        case PackageManagerType.PNPM:
          command = 'pnpm install';
          break;
        case PackageManagerType.NPM:
        default:
          command = 'npm install';
          break;
      }

      // 创建一个新的终端
      const terminal = vscode.window.createTerminal(`依赖安装 - ${path.basename(workspaceFolder)}`);

      // 切换到项目目录并执行安装命令
      terminal.sendText(`cd "${workspaceFolder}"`);
      terminal.sendText(command);

      // 显示终端
      terminal.show();

      // 通知用户
      vscode.window.showInformationMessage(`正在终端中执行 ${command} 命令安装依赖`);
    } catch (error) {
      console.error('启动依赖安装失败:', error);
      vscode.window.showErrorMessage('启动依赖安装失败: ' + (error instanceof Error ? error.message : String(error)));
    }
  }

  /**
   * 显示package.json文件的差异
   */
  private async showPackageJsonDiff(packageJsonPath: string): Promise<void> {
    try {
      // 获取当前文件的URI
      const currentUri = vscode.Uri.file(packageJsonPath);

      // 使用Git扩展API获取Git仓库
      const git = this.gitMonitor?.getGitAPI();
      if (!git) {
        vscode.window.showErrorMessage('无法显示package.json文件差异: 未找到Git仓库');
        return;
      }

      // 获取文件对应的Git URI
      const headUri = git.toGitUri(currentUri, 'HEAD~1');

      // 使用VS Code内置的差异查看器显示文件
      await vscode.commands.executeCommand(
        'vscode.diff',
        headUri,           // 原始文件 (HEAD版本)
        currentUri,        // 当前文件
        'package.json 依赖变更（HEAD~1 ↔ 当前）'  // 标题
      );
    } catch (error) {
      console.error('显示package.json差异失败:', error);
      vscode.window.showErrorMessage('无法显示package.json文件差异: ' + (error instanceof Error ? error.message : String(error)));
    }
  }

  /**
   * 获取当前工作区文件夹
   */
  private getCurrentWorkspaceFolder(): vscode.WorkspaceFolder | undefined {
    if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
      return vscode.workspace.workspaceFolders[0];
    }
    return undefined;
  }

  /**
   * 检测项目使用的包管理器类型
   * @param workspaceFolder 工作区文件夹路径
   * @returns 包管理器类型
   */
  public async detectPackageManager(workspaceFolder: string): Promise<PackageManagerType> {
    try {
      // 检查是否有锁文件
      const hasYarnLock = await this.fileExists(path.join(workspaceFolder, 'yarn.lock'));
      if (hasYarnLock) {
        return PackageManagerType.Yarn;
      }

      const hasPnpmLock = await this.fileExists(path.join(workspaceFolder, 'pnpm-lock.yaml'));
      if (hasPnpmLock) {
        return PackageManagerType.PNPM;
      }

      const hasNpmLock = await this.fileExists(path.join(workspaceFolder, 'package-lock.json'));
      if (hasNpmLock) {
        return PackageManagerType.NPM;
      }

      // 默认使用npm
      return PackageManagerType.NPM;
    } catch (error) {
      console.error('检测包管理器类型失败:', error);
      return PackageManagerType.NPM; // 默认返回npm
    }
  }

  /**
   * 检查文件是否存在
   * @param filePath 文件路径
   * @returns 是否存在
   */
  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 释放资源
   */
  public dispose(): void {
    this.disposables.forEach(d => d.dispose());
    this.disposables = [];
  }
} 