import * as assert from 'assert';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import * as sinon from 'sinon';  // 如果需要使用sinon来模拟函数
import { DependencyChecker, PackageManagerType, InstallResult } from '../dependency-checker';
import * as child_process from 'child_process';
import { promisify } from 'util';
import { GitOperationType, GitOperationEvent } from '../git-monitor';
import { StatusBarItem, StatusBarAlignment } from 'vscode';

// 保存原始的vscode模块，方便后续恢复
// 注意：这里我们不真正替换vscode模块，而是在测试中模拟其方法
import * as vscode from 'vscode';

// 模拟GitMonitor
class MockGitMonitor {
  private onGitOperationEmitter = new vscode.EventEmitter<GitOperationEvent>();
  public readonly onGitOperation = this.onGitOperationEmitter.event;

  getGitAPI() {
    return {
      toGitUri: (uri: vscode.Uri, ref: string) => {
        return uri.with({ scheme: 'git', query: ref });
      }
    };
  }

  triggerGitOperation(event: GitOperationEvent): void {
    this.onGitOperationEmitter.fire(event);
  }

  dispose(): void {
    this.onGitOperationEmitter.dispose();
  }
}

// 模拟exec函数
const originalExec = child_process.exec;
let mockExecResult: { stdout: string; stderr: string } | Error = { stdout: '', stderr: '' };

// 替换exec函数进行测试
function mockExec(command: string, options: any, callback: any) {
  if (mockExecResult instanceof Error) {
    callback(mockExecResult, '', '');
  } else {
    callback(null, mockExecResult.stdout, mockExecResult.stderr);
  }
  return {} as child_process.ChildProcess;
}

suite('DependencyChecker Tests', () => {
  let testDir: string;
  let dependencyChecker: DependencyChecker;
  let packageJsonPath: string;
  let mockGitMonitor: MockGitMonitor;

  // 存储原始的vscode函数以便恢复
  let originalShowInformationMessage: any;
  let originalCreateStatusBarItem: any;
  let originalExecuteCommand: any;

  // sinon沙箱用于存根
  let sandbox: sinon.SinonSandbox;

  // 测试前创建临时目录并设置模拟
  setup(async () => {
    // 创建sinon沙箱
    sandbox = sinon.createSandbox();

    testDir = path.join(os.tmpdir(), `dep-alert-test-${Date.now()}`);
    await fs.mkdir(testDir, { recursive: true });
    packageJsonPath = path.join(testDir, 'package.json');
    mockGitMonitor = new MockGitMonitor();
    dependencyChecker = new DependencyChecker();
    dependencyChecker.connectGitMonitor(mockGitMonitor as any);
    mockExecResult = { stdout: '依赖安装成功', stderr: '' };

    // 保存原始方法
    originalShowInformationMessage = vscode.window.showInformationMessage;
    originalCreateStatusBarItem = vscode.window.createStatusBarItem;
    originalExecuteCommand = vscode.commands.executeCommand;

    // 创建基本的package.json文件
    await fs.writeFile(packageJsonPath, JSON.stringify({
      name: 'test-package',
      version: '1.0.0',
      dependencies: {
        'react': '^17.0.1',
        'react-dom': '^17.0.1'
      },
      devDependencies: {
        'typescript': '^4.2.3'
      }
    }));
  });

  // 测试后清理临时目录并恢复模拟
  teardown(async () => {
    try {
      await fs.rm(testDir, { recursive: true, force: true });
      // 恢复原始exec函数
      (child_process.exec as any) = originalExec;

      // 恢复原始vscode方法
      vscode.window.showInformationMessage = originalShowInformationMessage;
      vscode.window.createStatusBarItem = originalCreateStatusBarItem;
      vscode.commands.executeCommand = originalExecuteCommand;

      // 恢复所有的sinon存根
      sandbox.restore();

      // 释放模拟对象
      mockGitMonitor.dispose();
    } catch (error) {
      console.error(`清理测试目录失败: ${error}`);
    }
  });

  suite('detectPackageManager', () => {
    test('should detect npm from package-lock.json', async () => {
      // 创建package-lock.json文件
      await fs.writeFile(path.join(testDir, 'package-lock.json'), '{}');

      const result = await dependencyChecker.detectPackageManager(testDir);
      assert.strictEqual(result, PackageManagerType.NPM);
    });

    test('should detect yarn from yarn.lock', async () => {
      // 创建yarn.lock文件
      await fs.writeFile(path.join(testDir, 'yarn.lock'), '');

      const result = await dependencyChecker.detectPackageManager(testDir);
      assert.strictEqual(result, PackageManagerType.Yarn);
    });

    test('should detect pnpm from pnpm-lock.yaml', async () => {
      // 创建pnpm-lock.yaml文件
      await fs.writeFile(path.join(testDir, 'pnpm-lock.yaml'), '');

      const result = await dependencyChecker.detectPackageManager(testDir);
      assert.strictEqual(result, PackageManagerType.PNPM);
    });

    test('should prefer yarn over npm when both lock files exist', async () => {
      // 创建两个锁文件
      await fs.writeFile(path.join(testDir, 'package-lock.json'), '{}');
      await fs.writeFile(path.join(testDir, 'yarn.lock'), '');

      const result = await dependencyChecker.detectPackageManager(testDir);
      assert.strictEqual(result, PackageManagerType.Yarn);
    });

    test('should prefer pnpm over others when all lock files exist', async () => {
      // 创建所有锁文件
      await fs.writeFile(path.join(testDir, 'package-lock.json'), '{}');
      await fs.writeFile(path.join(testDir, 'yarn.lock'), '');
      await fs.writeFile(path.join(testDir, 'pnpm-lock.yaml'), '');

      // 由于检测顺序，应该返回Yarn（第一个检测到的）
      const result = await dependencyChecker.detectPackageManager(testDir);
      assert.strictEqual(result, PackageManagerType.Yarn);
    });

    test('should default to npm when no lock files', async () => {
      const result = await dependencyChecker.detectPackageManager(testDir);
      assert.strictEqual(result, PackageManagerType.NPM);
    });
  });

  suite('installDependencies', () => {
    test('should use npm command when npm is detected', async function () {
      // 模拟执行命令
      (child_process.exec as any) = mockExec;

      // 创建package-lock.json文件
      await fs.writeFile(path.join(testDir, 'package-lock.json'), '{}');

      // 模拟执行结果
      let capturedCommand = '';
      (child_process.exec as any) = (cmd: string, options: any, callback: any) => {
        capturedCommand = cmd;
        callback(null, { stdout: '安装成功' }, '');
        return {} as child_process.ChildProcess;
      };

      await dependencyChecker.installDependencies(testDir);
      assert.strictEqual(capturedCommand, 'npm install');
    });

    test('should use yarn command when yarn is detected', async function () {
      // 创建yarn.lock文件
      await fs.writeFile(path.join(testDir, 'yarn.lock'), '');

      // 模拟执行结果
      let capturedCommand = '';
      (child_process.exec as any) = (cmd: string, options: any, callback: any) => {
        capturedCommand = cmd;
        callback(null, { stdout: '安装成功' }, '');
        return {} as child_process.ChildProcess;
      };

      await dependencyChecker.installDependencies(testDir);
      assert.strictEqual(capturedCommand, 'yarn');
    });

    test('should use pnpm command when pnpm is detected', async function () {
      // 创建pnpm-lock.yaml文件
      await fs.writeFile(path.join(testDir, 'pnpm-lock.yaml'), '');

      // 模拟执行结果
      let capturedCommand = '';
      (child_process.exec as any) = (cmd: string, options: any, callback: any) => {
        capturedCommand = cmd;
        callback(null, { stdout: '安装成功' }, '');
        return {} as child_process.ChildProcess;
      };

      await dependencyChecker.installDependencies(testDir);
      assert.strictEqual(capturedCommand, 'pnpm install');
    });

    test('should override detected package manager with provided one', async function () {
      // 创建npm-lock.json文件但指定使用yarn
      await fs.writeFile(path.join(testDir, 'package-lock.json'), '{}');

      // 模拟执行结果
      let capturedCommand = '';
      (child_process.exec as any) = (cmd: string, options: any, callback: any) => {
        capturedCommand = cmd;
        callback(null, { stdout: '安装成功' }, '');
        return {} as child_process.ChildProcess;
      };

      await dependencyChecker.installDependencies(testDir, PackageManagerType.Yarn);
      assert.strictEqual(capturedCommand, 'yarn');
    });

    test('should return error when command fails', async function () {
      // 模拟执行失败
      (child_process.exec as any) = (cmd: string, options: any, callback: any) => {
        callback(new Error('安装失败'), '', '');
        return {} as child_process.ChildProcess;
      };

      const result = await dependencyChecker.installDependencies(testDir);
      assert.strictEqual(result.success, false);
      assert.strictEqual(result.error, '安装失败');
    });
  });

  suite('handleInstallDependencies', () => {
    test('should create terminal and execute npm install command', async () => {
      // 存根vscode.window.createTerminal方法
      const terminalMock = {
        sendText: sandbox.stub(),
        show: sandbox.stub(),
        dispose: sandbox.stub()
      };
      sandbox.stub(vscode.window, 'createTerminal').returns(terminalMock as any);

      // 存根showInformationMessage方法
      const showInfoStub = sandbox.stub(vscode.window, 'showInformationMessage').resolves();

      // 存根detectPackageManager方法，返回npm
      sandbox.stub(dependencyChecker, 'detectPackageManager').resolves(PackageManagerType.NPM);

      // 调用测试方法
      await (dependencyChecker as any).handleInstallDependencies(testDir);

      // 验证结果
      sinon.assert.calledOnce(vscode.window.createTerminal as any);
      sinon.assert.calledWith(vscode.window.createTerminal as any, `依赖安装 - ${path.basename(testDir)}`);

      sinon.assert.calledTwice(terminalMock.sendText);
      sinon.assert.calledWith(terminalMock.sendText.firstCall, `cd "${testDir}"`);
      sinon.assert.calledWith(terminalMock.sendText.secondCall, 'npm install');

      sinon.assert.calledOnce(terminalMock.show);

      sinon.assert.calledOnce(showInfoStub);
      sinon.assert.calledWith(showInfoStub, '正在终端中执行 npm install 命令安装依赖');
    });

    test('should create terminal and execute yarn command', async () => {
      // 存根vscode.window.createTerminal方法
      const terminalMock = {
        sendText: sandbox.stub(),
        show: sandbox.stub(),
        dispose: sandbox.stub()
      };
      sandbox.stub(vscode.window, 'createTerminal').returns(terminalMock as any);

      // 存根showInformationMessage方法
      const showInfoStub = sandbox.stub(vscode.window, 'showInformationMessage').resolves();

      // 存根detectPackageManager方法，返回yarn
      sandbox.stub(dependencyChecker, 'detectPackageManager').resolves(PackageManagerType.Yarn);

      // 调用测试方法
      await (dependencyChecker as any).handleInstallDependencies(testDir);

      // 验证结果
      sinon.assert.calledOnce(vscode.window.createTerminal as any);

      sinon.assert.calledTwice(terminalMock.sendText);
      sinon.assert.calledWith(terminalMock.sendText.firstCall, `cd "${testDir}"`);
      sinon.assert.calledWith(terminalMock.sendText.secondCall, 'yarn');

      sinon.assert.calledOnce(terminalMock.show);

      sinon.assert.calledOnce(showInfoStub);
      sinon.assert.calledWith(showInfoStub, '正在终端中执行 yarn 命令安装依赖');
    });

    test('should create terminal and execute pnpm install command', async () => {
      // 存根vscode.window.createTerminal方法
      const terminalMock = {
        sendText: sandbox.stub(),
        show: sandbox.stub(),
        dispose: sandbox.stub()
      };
      sandbox.stub(vscode.window, 'createTerminal').returns(terminalMock as any);

      // 存根showInformationMessage方法
      const showInfoStub = sandbox.stub(vscode.window, 'showInformationMessage').resolves();

      // 存根detectPackageManager方法，返回pnpm
      sandbox.stub(dependencyChecker, 'detectPackageManager').resolves(PackageManagerType.PNPM);

      // 调用测试方法
      await (dependencyChecker as any).handleInstallDependencies(testDir);

      // 验证结果
      sinon.assert.calledOnce(vscode.window.createTerminal as any);

      sinon.assert.calledTwice(terminalMock.sendText);
      sinon.assert.calledWith(terminalMock.sendText.firstCall, `cd "${testDir}"`);
      sinon.assert.calledWith(terminalMock.sendText.secondCall, 'pnpm install');

      sinon.assert.calledOnce(terminalMock.show);

      sinon.assert.calledOnce(showInfoStub);
      sinon.assert.calledWith(showInfoStub, '正在终端中执行 pnpm install 命令安装依赖');
    });

    test('should show error when workspace folder not found', async () => {
      // 存根showErrorMessage方法
      const showErrorStub = sandbox.stub(vscode.window, 'showErrorMessage').resolves();

      // 存根getCurrentWorkspaceFolder方法，返回undefined
      sandbox.stub(dependencyChecker as any, 'getCurrentWorkspaceFolder').returns(undefined);

      // 调用测试方法，不传递folderPath
      await (dependencyChecker as any).handleInstallDependencies(undefined);

      // 验证结果
      sinon.assert.calledOnce(showErrorStub);
      sinon.assert.calledWith(showErrorStub, '未找到有效的工作区文件夹');
    });

    test('should handle error during terminal creation', async () => {
      // 存根vscode.window.createTerminal方法，抛出错误
      sandbox.stub(vscode.window, 'createTerminal').throws(new Error('终端创建失败'));

      // 存根showErrorMessage方法
      const showErrorStub = sandbox.stub(vscode.window, 'showErrorMessage').resolves();

      // 存根console.error方法
      const consoleErrorStub = sandbox.stub(console, 'error');

      // 存根detectPackageManager方法
      sandbox.stub(dependencyChecker, 'detectPackageManager').resolves(PackageManagerType.NPM);

      // 调用测试方法
      await (dependencyChecker as any).handleInstallDependencies(testDir);

      // 验证结果
      sinon.assert.calledOnce(showErrorStub);
      sinon.assert.match(showErrorStub.firstCall.args[0], /启动依赖安装失败/);

      sinon.assert.calledOnce(consoleErrorStub);
    });
  });

  suite('showPackageJsonDiff', () => {
    test('should use Git API to show diff', async () => {
      // 存根vscode.commands.executeCommand方法
      const executeCommandStub = sandbox.stub(vscode.commands, 'executeCommand').resolves();

      // 存根gitMonitor.getGitAPI方法
      const gitApiMock = {
        toGitUri: sandbox.stub().returns(vscode.Uri.file('git-uri-mock'))
      };
      sandbox.stub(mockGitMonitor, 'getGitAPI').returns(gitApiMock as any);

      // 调用测试方法
      await (dependencyChecker as any).showPackageJsonDiff(packageJsonPath);

      // 验证结果
      sinon.assert.calledOnce(gitApiMock.toGitUri);
      sinon.assert.calledOnce(executeCommandStub);
      sinon.assert.calledWith(executeCommandStub, 'vscode.diff');
    });

    test('should show error when Git API not available', async () => {
      // 存根gitMonitor.getGitAPI方法返回null
      const getGitAPIStub = sandbox.stub(mockGitMonitor, 'getGitAPI');
      // @ts-ignore - 故意返回null以测试错误处理
      getGitAPIStub.returns(null);

      // 存根showErrorMessage方法
      const showErrorStub = sandbox.stub(vscode.window, 'showErrorMessage').resolves();

      // 调用测试方法
      await (dependencyChecker as any).showPackageJsonDiff(packageJsonPath);

      // 验证结果
      sinon.assert.calledOnce(showErrorStub);
      sinon.assert.calledWith(showErrorStub, sinon.match(/无法显示.*未找到Git仓库/));
    });

    test('should handle error during diff command execution', async () => {
      // 存根vscode.commands.executeCommand方法抛出错误
      sandbox.stub(vscode.commands, 'executeCommand').rejects(new Error('执行命令失败'));

      // 存根console.error方法
      const consoleErrorStub = sandbox.stub(console, 'error');

      // 存根showErrorMessage方法
      const showErrorStub = sandbox.stub(vscode.window, 'showErrorMessage').resolves();

      // 调用测试方法
      await (dependencyChecker as any).showPackageJsonDiff(packageJsonPath);

      // 验证结果
      sinon.assert.calledOnce(consoleErrorStub);
      sinon.assert.calledOnce(showErrorStub);
      sinon.assert.calledWith(showErrorStub, sinon.match(/无法显示.*执行命令失败/));
    });
  });

  suite('showAction', () => {
    test('should create status bar item and show notification', async () => {
      // 创建一个完整的StatusBarItem模拟对象
      const statusBarMock = {
        text: '',
        tooltip: '',
        command: null,
        show: sandbox.stub() as sinon.SinonStub,
        hide: sandbox.stub() as sinon.SinonStub,
        dispose: sandbox.stub() as sinon.SinonStub
      };

      // 使用正确的参数和返回类型存根createStatusBarItem
      sandbox.stub(vscode.window, 'createStatusBarItem')
        .withArgs(vscode.StatusBarAlignment.Right, 100)
        .returns(statusBarMock as any);

      // 存根showInformationMessage方法
      const showInfoStub = sandbox.stub(vscode.window, 'showInformationMessage').resolves();

      // 存根setTimeout
      const originalSetTimeout = global.setTimeout;
      // @ts-ignore - 使用简化版的setTimeout进行测试
      global.setTimeout = (callback, ms) => {
        // 立即执行回调，而不是等待
        callback();
        return 1;
      };

      // 调用测试方法
      (dependencyChecker as any).showAction(packageJsonPath);

      // 验证结果
      sinon.assert.calledOnce(vscode.window.createStatusBarItem as any);
      assert.strictEqual(statusBarMock.text, '检测到 package.json 文件变更');
      assert.strictEqual(statusBarMock.tooltip, '点击查看package.json变更详情');

      sinon.assert.calledOnce(statusBarMock.show);
      sinon.assert.calledOnce(statusBarMock.hide);
      sinon.assert.calledOnce(statusBarMock.dispose);

      sinon.assert.calledOnce(showInfoStub);

      // 恢复setTimeout
      global.setTimeout = originalSetTimeout;
    });

    test('should auto install dependencies when configured', async () => {
      // 修改userConfig
      (dependencyChecker as any).userConfig = { autoInstall: true };

      // 存根vscode.window.createStatusBarItem方法
      const statusBarMock = {
        text: '',
        tooltip: '',
        command: null,
        show: sandbox.stub() as sinon.SinonStub,
        hide: sandbox.stub() as sinon.SinonStub,
        dispose: sandbox.stub() as sinon.SinonStub
      };
      sandbox.stub(vscode.window, 'createStatusBarItem').returns(statusBarMock as any);

      // 存根showInformationMessage方法
      const showInfoStub = sandbox.stub(vscode.window, 'showInformationMessage').resolves({ title: '查看变更' });

      // 存根handleInstallDependencies方法
      const handleInstallStub = sandbox.stub(dependencyChecker as any, 'handleInstallDependencies').resolves();

      // 存根showPackageJsonDiff方法
      const showDiffStub = sandbox.stub(dependencyChecker as any, 'showPackageJsonDiff').resolves();

      // 调用测试方法
      (dependencyChecker as any).showAction(packageJsonPath);

      // 验证结果
      sinon.assert.calledOnce(handleInstallStub);
      sinon.assert.calledWith(handleInstallStub, path.dirname(packageJsonPath));

      sinon.assert.calledOnce(showInfoStub);
      sinon.assert.calledWith(showInfoStub, '检测到 package.json 文件变更，正在自动安装依赖...');

      // 模拟用户点击"查看变更"
      sinon.assert.calledOnce(showDiffStub);
      sinon.assert.calledWith(showDiffStub, packageJsonPath);

      // 恢复userConfig
      (dependencyChecker as any).userConfig = { autoInstall: false };
    });
  });
}); 