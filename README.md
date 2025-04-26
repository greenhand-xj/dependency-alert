# Dependency Alert - 依赖变更提醒

一个智能的 VS Code 扩展，用于检测依赖文件变更并提醒你安装依赖。

## 特性

- 自动检测 Git 操作（pull、merge、rebase）后的依赖文件变更
- 直接监控 package.json 文件的变化
- 基于 Git diff 智能识别依赖变化
- 支持检测 npm、yarn、pnpm 包管理器
- 提供安装依赖的快捷操作
- 可配置自动安装依赖

## 使用场景

适用于以下场景：

- 当你从远程拉取代码后，package.json 文件发生变更
- 当你切换分支，新分支的依赖与当前分支不同
- 当你合并其他分支时，依赖发生变化
- 当你直接修改 package.json 文件时

插件会检测这些变更，并提醒你安装新的依赖，避免因依赖不匹配导致的运行错误。

## 安装

在 VS Code 中搜索 "Dependency Alert" 或直接从 [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=your-publisher-name.dependency-alert) 安装。

## 使用方法

1. 插件会自动激活，并监控依赖文件变更
2. 当检测到依赖文件变更时，会显示通知
3. 可以选择立即安装依赖，或查看具体的变更内容
4. 也可以通过状态栏图标快速访问相关功能

## 配置选项

在 VS Code 设置中可以配置以下选项：

| 配置项                              | 描述                  | 默认值                        |
| ----------------------------------- | --------------------- | ----------------------------- |
| `dependencyAlert.enabled`           | 启用插件              | `true`                        |
| `dependencyAlert.autoInstall`       | 自动安装更新的依赖    | `false`                       |
| `dependencyAlert.gitOperationTypes` | 要监控的 Git 操作类型 | `["pull", "merge", "rebase"]` |
| `dependencyAlert.monitoredFiles`    | 要监控的依赖文件      | `["package.json"]`            |

## 支持的包管理器

- npm
- yarn
- pnpm

## 技术实现

- 使用 VS Code 内置的 Git 扩展 API 监控 Git 操作
- 支持多种包管理器的自动检测
- 结合文件系统监控和 Git 操作事件，全方位检测依赖变更

## 贡献

欢迎通过 GitHub 提交问题和贡献代码。

## 许可证

[MIT License](LICENSE)
