// import * as assert from 'assert';
// import * as vscode from 'vscode';
// import * as sinon from 'sinon';
// import * as path from 'path';
// import { GitMonitor, GitOperationType, GitOperationEvent } from '../git-monitor';
// import { API, APIState, GitExtension, Repository, Status, Change } from '../git-types';

// // 用于测试的模拟类
// class MockRepository implements Repository {
//   rootUri: vscode.Uri;
//   inputBox = { value: '' };
//   state = {
//     HEAD: {
//       name: 'main',
//       commit: '123456789',
//       upstream: {
//         name: 'origin/main',
//         commit: '123456789'
//       },
//       ahead: 0,
//       behind: 0
//     },
//     remotes: [],
//     submodules: [],
//     rebaseCommit: null,
//     mergeChanges: [] as Change[],
//     indexChanges: [] as Change[],
//     workingTreeChanges: [] as Change[],
//     onDidChange: new vscode.EventEmitter<void>().event
//   };
//   ui = {
//     selected: false,
//     onDidChange: new vscode.EventEmitter<void>().event
//   };

//   constructor(rootPath: string) {
//     this.rootUri = vscode.Uri.file(rootPath);
//   }

//   // 模拟状态变化事件
//   private readonly _onDidChangeState = new vscode.EventEmitter<void>();
//   readonly onDidChangeState: vscode.Event<void> = this._onDidChangeState.event;

//   // 模拟Repository方法
//   add(_resources: vscode.Uri[]): Promise<void> { return Promise.resolve(); }
//   apply(_patch: string, _reverse?: boolean): Promise<void> { return Promise.resolve(); }
//   clean(_resources: vscode.Uri[]): Promise<void> { return Promise.resolve(); }
//   checkout(_treeish: string, _options?: { detached?: boolean; }): Promise<void> { return Promise.resolve(); }
//   commit(_message: string, _opts?: { all?: boolean, amend?: boolean, signoff?: boolean, signCommit?: boolean }): Promise<void> { return Promise.resolve(); }
//   createBranch(_name: string, _checkout: boolean, _ref?: string): Promise<void> { return Promise.resolve(); }
//   deleteBranch(_name: string, _force?: boolean): Promise<void> { return Promise.resolve(); }
//   getBranch(_name: string): Promise<any> { return Promise.resolve(undefined as any); }
//   getBranches(): Promise<any[]> { return Promise.resolve([]); }
//   getCommit(_ref: string): Promise<any> { return Promise.resolve(undefined as any); }
//   getDiff(_resource?: vscode.Uri): Promise<string[]> { return Promise.resolve([]); }
//   getObjectDetails(_ref: string, _path: string): Promise<{ mode: string, object: string, size: number }> {
//     return Promise.resolve({ mode: '', object: '', size: 0 });
//   }
//   getRemotes(): Promise<any[]> { return Promise.resolve([]); }
//   getStashes(): Promise<any[]> { return Promise.resolve([]); }
//   getSubmodules(): Promise<any[]> { return Promise.resolve([]); }
//   getTags(): Promise<any[]> { return Promise.resolve([]); }
//   push(_remoteName?: string, _branchName?: string, _setUpstream?: boolean, _force?: boolean): Promise<void> { return Promise.resolve(); }
//   rebase(_branch: string): Promise<void> { return Promise.resolve(); }
//   merge(_ref: string): Promise<void> { return Promise.resolve(); }
//   pull(_unshallow?: boolean): Promise<void> { return Promise.resolve(); }
//   fetch(_remote?: string, _ref?: string, _depth?: number): Promise<void> { return Promise.resolve(); }
//   show(_ref: string, _path: string): Promise<string> { return Promise.resolve(''); }
//   status(): Promise<void> { return Promise.resolve(); }
//   checkout(_treeish: string, _filePaths: string[]): Promise<void> { return Promise.resolve(); }

//   // 模拟状态变化，用于测试
//   simulateStateChange(changes: any = {}) {
//     Object.assign(this.state, changes);
//     this._onDidChangeState.fire();
//   }

//   // 模拟文件变化
//   simulateFileChange(filePath: string, status: number = Status.MODIFIED) {
//     const changes: Change[] = [{
//       uri: vscode.Uri.file(path.join(this.rootUri.fsPath, filePath)),
//       renameUri: undefined,
//       originalUri: undefined,
//       status
//     }];

//     this.state.workingTreeChanges = changes;
//     this._onDidChangeState.fire();
//   }

//   // 模拟HEAD变化
//   simulateHeadChange(commit: string) {
//     if (this.state.HEAD) {
//       this.state.HEAD.commit = commit;
//     }
//     this._onDidChangeState.fire();
//   }
// }

// class MockAPI implements API {
//   state: APIState = APIState.OK;
//   onDidChangeState: vscode.Event<APIState> = new vscode.EventEmitter<APIState>().event;
//   repositories: Repository[] = [];
//   onDidOpenRepository = new vscode.EventEmitter<Repository>().event;
//   onDidCloseRepository = new vscode.EventEmitter<Repository>().event;

//   getRepository(uri: vscode.Uri): Repository | null { return null; }
// }

// class MockGitExtension implements GitExtension {
//   enabled = true;
//   onDidChangeEnablement = new vscode.EventEmitter<boolean>().event;

//   getAPI(version: 1): API {
//     return new MockAPI();
//   }
// }

// suite('GitMonitor测试', () => {
//   let gitMonitor: GitMonitor;
//   let mockRepository: MockRepository;
//   let sandbox: sinon.SinonSandbox;

//   setup(() => {
//     sandbox = sinon.createSandbox();

//     // 创建模拟Git扩展
//     const mockGitExtension = new MockGitExtension();

//     // 创建模拟仓库
//     mockRepository = new MockRepository('/test/repo');

//     // 将仓库添加到API中
//     const mockAPI = mockGitExtension.getAPI(1) as MockAPI;
//     mockAPI.repositories.push(mockRepository);

//     // 模拟扩展API
//     sandbox.stub(vscode.extensions, 'getExtension').returns({
//       id: 'vscode.git',
//       packageJSON: {},
//       extensionKind: vscode.ExtensionKind.UI,
//       extensionPath: '',
//       extensionUri: vscode.Uri.file(''),
//       isActive: true,
//       exports: mockGitExtension,
//       activate: () => Promise.resolve(mockGitExtension)
//     } as any);

//     // 模拟工作区文件夹
//     sandbox.stub(vscode.workspace, 'getWorkspaceFolder').returns({
//       uri: mockRepository.rootUri,
//       name: 'test',
//       index: 0
//     });

//     // 创建Git监视器
//     gitMonitor = new GitMonitor();
//   });

//   teardown(() => {
//     gitMonitor.dispose();
//     sandbox.restore();
//   });

//   test('初始化时监听Git仓库', async () => {
//     // 模拟暂存区中的依赖文件变更
//     mockRepository.state.indexChanges = [{
//       uri: vscode.Uri.file(path.join(mockRepository.rootUri.fsPath, 'package.json')),
//       renameUri: undefined,
//       originalUri: undefined,
//       status: Status.MODIFIED
//     }];

//     // 监听Git操作事件
//     let gitOperationFired = false;
//     (gitMonitor as any).onGitOperation((event: GitOperationEvent) => {
//       gitOperationFired = true;
//       assert.ok(event.repository === mockRepository);
//       assert.ok(event.dependencyFiles.length > 0);
//       assert.ok(event.dependencyFiles[0].fsPath.endsWith('package.json'));
//     });

//     // 触发仓库状态变化
//     mockRepository.simulateStateChange();

//     // 等待事件处理完成
//     await new Promise(resolve => setTimeout(resolve, 100));

//     // 确认事件已触发
//     assert.ok(gitOperationFired);
//   });

//   test('非依赖文件变化不触发事件', async () => {
//     // 模拟非依赖文件变更
//     mockRepository.state.workingTreeChanges = [{
//       uri: vscode.Uri.file(path.join(mockRepository.rootUri.fsPath, 'README.md')),
//       renameUri: undefined,
//       originalUri: undefined,
//       status: Status.MODIFIED
//     }];

//     // 监听Git操作事件
//     let gitOperationFired = false;
//     (gitMonitor as any).onGitOperation((_event: GitOperationEvent) => {
//       gitOperationFired = true;
//     });

//     // 触发仓库状态变化
//     mockRepository.simulateStateChange();

//     // 等待事件处理完成
//     await new Promise(resolve => setTimeout(resolve, 100));

//     // 确认事件未触发
//     assert.ok(!gitOperationFired);
//   });

//   test('检测HEAD变化', async () => {
//     // 监听Git操作事件
//     let gitOperationType: GitOperationType | undefined;
//     (gitMonitor as any).onGitOperation((event: GitOperationEvent) => {
//       gitOperationType = event.type;
//     });

//     // 模拟package.json文件变化
//     mockRepository.simulateFileChange('package.json', Status.MODIFIED);

//     // 等待事件处理完成
//     await new Promise(resolve => setTimeout(resolve, 100));

//     // 模拟HEAD提交变化并触发状态变化
//     mockRepository.simulateHeadChange('newcommit123');

//     // 等待事件处理完成
//     await new Promise(resolve => setTimeout(resolve, 100));

//     // 确认Git操作类型为Pull
//     assert.strictEqual(gitOperationType, GitOperationType.Pull);
//   });
// }); 