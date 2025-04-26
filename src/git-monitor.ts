import * as vscode from 'vscode';
import * as path from 'path';
import { DependencyFilePatterns, getConfiguration } from './config';
import { API, APIState, GitExtension, Repository, Status, Change } from './git-types';
import { execAsync } from './utils';

/**
 * Git操作类型枚举
 */
export enum GitOperationType {
  Pull = 'pull',
  Checkout = 'checkout',
  Merge = 'merge',
  Rebase = 'rebase',
  Reset = 'reset',
  Commit = 'commit',
  Unknown = 'unknown'
}

/**
 * Git操作事件数据接口
 */
export interface GitOperationEvent {
  /** Git操作类型 */
  type: GitOperationType;

  /** 前一个HEAD提交 */
  prevHeadCommit: string;

  /** 当前HEAD提交 */
  currentHeadCommit: string;

  /** 仓库 */
  repository: Repository;

  /** 工作区文件夹 */
  workspaceFolder: vscode.WorkspaceFolder;

  /** 变更的依赖文件 */
  dependencyChanges: { file: string, changed: boolean, content: string }[];

  /** 事件发生时间戳 */
  timestamp: number;
}

/**
 * Git操作监控类
 * 通过VSCode的Git扩展API监听Git操作，并在操作完成后发出事件通知
 */
export class GitMonitor implements vscode.Disposable {
  private disposables: vscode.Disposable[] = [];
  private onGitOperationEmitter = new vscode.EventEmitter<GitOperationEvent>();
  private api: API | undefined;
  private lastHeadCommits = new Map<Repository, string>();
  private isInitialized = false;
  private userConfig = getConfiguration();

  /**
   * Git操作发生时触发的事件
   */
  public readonly onGitOperation: vscode.Event<GitOperationEvent> = this.onGitOperationEmitter.event;

  /**
   * 构造函数
   */
  constructor() {
    this.initialize();

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
   * 初始化Git监控器
   */
  public initialize(): void {
    if (this.isInitialized) {
      return;
    }

    try {
      // 获取VSCode的Git扩展
      const gitExtension = vscode.extensions.getExtension<GitExtension>('vscode.git');

      if (!gitExtension) {
        console.warn('VSCode Git扩展未安装或未激活');
        return;
      }

      // 如果扩展未激活，先激活它
      if (!gitExtension.isActive) {
        gitExtension.activate().then(() => {
          this.initGitAPI(gitExtension);
        });
      } else {
        this.initGitAPI(gitExtension);
      }

      this.isInitialized = true;
    } catch (error) {
      console.error('初始化Git监控器失败', error);
    }
  }

  public getGitAPI(): API | undefined {
    return this.api;
  }

  /**
   * 初始化Git API
   */
  private initGitAPI(gitExtension: vscode.Extension<GitExtension>): void {
    try {
      const extension = gitExtension.exports;

      // 检查Git扩展是否启用
      if (!extension.enabled) {
        this.disposables.push(
          extension.onDidChangeEnablement(enabled => {
            if (enabled) {
              this.initGitAPI(gitExtension);
            } else {
              this.api = undefined;
            }
          })
        );
        return;
      }

      // 获取Git API
      this.api = extension.getAPI(1);

      // 监听api初始化完成事件
      this.disposables.push(
        this.api.onDidChangeState(this.onGitAPIChanged.bind(this))
      );

    } catch (error) {
      console.error('初始化Git API失败', error);
    }
  }

  /** 
   * 处理Git API状态变化事件
   */
  private onGitAPIChanged(e: APIState): void {
    if (e === 'initialized') {
      this.api?.repositories.forEach((repository) => {
        this.updateHeadCommit(repository);
        this.onRepositoryOpened(repository)
      })
    }
  }
  /**
   * 处理仓库打开事件
   */
  private onRepositoryOpened(repository: Repository): void {
    try {
      // 监听仓库状态变化
      this.disposables.push(
        repository.state.onDidChange(() => {
          this.onRepositoryStateChanged(repository);
          // repository.state._repository.onDidChangeOperations((...rs) => {
          //   console.log("rs", rs)
          // })
          // repository.state._repository.onDidRunOperation((...rs) => {
          //   console.log("rs", rs)
          // })
        })
      );
    } catch (error) {
      console.error('处理仓库打开事件失败', error);
    }
  }

  /**
   * 更新HEAD提交哈希
   */
  private updateHeadCommit(repository: Repository): void {
    const headCommit = repository.state.HEAD?.commit;
    if (headCommit) {
      this.lastHeadCommits.set(repository, headCommit);
    }
  }

  /**
   * 处理仓库状态变化事件
   */
  private async onRepositoryStateChanged(repository: Repository): Promise<void> {
    try {
      // 检查HEAD是否变化，这通常表示拉取、合并或检出等操作完成
      const prevHeadCommit = this.lastHeadCommits.get(repository);
      if (!prevHeadCommit) {
        return;
      }
      const currentHeadCommit = repository.state.HEAD?.commit;
      if (!currentHeadCommit || currentHeadCommit === prevHeadCommit) {
        return;
      }

      // 更新HEAD提交
      if (currentHeadCommit) {
        this.lastHeadCommits.set(repository, currentHeadCommit);
      }
      const operationType = await this.inferGitOperationTypeByReflog(repository)
      if (this.userConfig.gitOperationTypes.includes(operationType)) {
        //判断最新提交哪些文件发生变化
        // const commit = await repository.getCommitFilesStats(currentHeadCommit)
        const changed = await this.getChangedFiles(repository, prevHeadCommit, currentHeadCommit)
        if (!changed) {
          return;
        }
        this.onGitOperationEmitter.fire({
          type: operationType,
          prevHeadCommit,
          currentHeadCommit,
          repository,
          workspaceFolder: vscode.workspace.getWorkspaceFolder(repository.rootUri)!,
          dependencyChanges: changed,
          timestamp: Date.now()
        })
      }
    } catch (error) {
      console.error('处理仓库状态变化事件失败', error);
    }
  }

  private async getChangedFiles(repository: Repository, prevHeadCommit: string, currentHeadCommit: string): Promise<GitOperationEvent['dependencyChanges'] | null> {
    const monitoredFiles = this.userConfig.monitoredFiles
    const changed = await Promise.all(monitoredFiles.map(file => repository.diffBetween(prevHeadCommit, currentHeadCommit, file)))
    if (!changed) {
      return null;
    }
    return monitoredFiles.map((file, index) => ({ file, changed: !!changed[index], content: changed[index] }))
  }

  /**
   * 通过Git仓库状态推断最近的Git操作类型
   */
  private async inferGitOperationTypeByReflog(repository: Repository): Promise<GitOperationType> {
    try {
      const { stdout } = await execAsync(`git reflog -n 1`, { cwd: repository.rootUri.fsPath });

      // 解析reflog输出
      if (stdout.includes('pull:') || stdout.includes('pull ')) {
        return GitOperationType.Pull;
      } else if (stdout.includes('merge:') || stdout.includes('merge ')) {
        return GitOperationType.Merge;
      } else if (stdout.includes('checkout:') || stdout.includes('checkout ')) {
        return GitOperationType.Checkout;
      } else if (stdout.includes('commit:') || stdout.includes('commit ')) {
        return GitOperationType.Commit;
      } else if (stdout.includes('rebase:') || stdout.includes('rebase ')) {
        return GitOperationType.Rebase;
      }

      console.log('Git操作reflog:', stdout);
      return GitOperationType.Unknown;
    } catch (error) {
      console.error('推断Git操作类型失败', error);
      return GitOperationType.Unknown;
    }
  }


  // private async inferGitOperationType(repository: Repository): Promise<GitOperationType> {
  //   try {
  //     // 检查是否有合并冲突，表明可能是合并操作
  //     if (repository.state.mergeChanges && repository.state.mergeChanges.length > 0) {
  //       return GitOperationType.Merge;
  //     }

  //     // 检查分支的ahead/behind状态，可能表明是拉取或推送操作
  //     const head = repository.state.HEAD;
  //     if (head && head.ahead !== undefined && head.behind !== undefined) {
  //       if (head.behind === 0 && head.ahead > 0) {
  //         // 本地比远程超前，但没有落后，可能是推送后的状态
  //         return GitOperationType.Commit;
  //       } else if (head.behind > 0 && head.ahead === 0) {
  //         // 本地比远程落后，可能是拉取前的状态
  //         return GitOperationType.Pull;
  //       } else if (head.behind > 0 && head.ahead > 0) {
  //         // 既有落后又有超前，可能是不同步的状态
  //         return GitOperationType.Unknown;
  //       }
  //     }

  //     // 默认返回未知类型
  //     return GitOperationType.Unknown;
  //   } catch (error) {
  //     console.error('推断Git操作类型失败', error);
  //     return GitOperationType.Unknown;
  //   }
  // }

  /**
   * 检查给定路径是否包含依赖文件
   */
  public async hasDependencyFiles(folderPath: string): Promise<boolean> {
    try {
      for (const pattern of DependencyFilePatterns) {
        const files = await vscode.workspace.findFiles(
          new vscode.RelativePattern(folderPath, pattern),
          null,
          1
        );
        if (files.length > 0) {
          return true;
        }
      }
      return false;
    } catch (error) {
      console.error('检查依赖文件失败', error);
      return false;
    }
  }

  /**
   * 销毁并释放资源
   */
  public dispose(): void {
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    this.disposables = [];

    this.onGitOperationEmitter.dispose();
    this.lastHeadCommits.clear();
    this.isInitialized = false;
    this.api = undefined;
  }
} 