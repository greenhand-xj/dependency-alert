// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { GitMonitor } from './git-monitor';
import { DependencyChecker } from './dependency-checker';

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
	try {
		// 创建Git监控器
		const gitMonitor = new GitMonitor();

		// 创建依赖检查器并连接Git监控器
		const dependencyChecker = new DependencyChecker();
		dependencyChecker.connectGitMonitor(gitMonitor);

		// 将实例添加到上下文中，以便在停用时处理
		context.subscriptions.push(gitMonitor, dependencyChecker);

		console.log('依赖提醒 (Dependency Alert) 扩展已激活');
	} catch (error) {
		console.error('激活依赖提醒扩展失败', error);
	}
}

// This method is called when your extension is deactivated
export function deactivate() {
	console.log('依赖提醒 (Dependency Alert) 扩展已停用');
}
