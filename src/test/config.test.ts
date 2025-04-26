import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { getConfiguration, DependencyFieldType, DependencyFilePatterns } from '../config';

suite('Config Tests', () => {
  let getConfigurationStub: sinon.SinonStub;
  let configStub: any;

  setup(() => {
    // 创建配置对象的存根
    configStub = {
      get: sinon.stub()
    };

    // 默认返回值
    configStub.get.withArgs('enabled', sinon.match.any).returns(true);
    configStub.get.withArgs('autoInstall', sinon.match.any).returns(false);
    configStub.get.withArgs('monitoredFiles', sinon.match.any).returns(DependencyFilePatterns);

    // 创建getConfiguration的存根
    getConfigurationStub = sinon.stub(vscode.workspace, 'getConfiguration');
    getConfigurationStub.returns(configStub);
  });

  teardown(() => {
    // 恢复所有存根
    sinon.restore();
  });

  test('getConfiguration should return default values', () => {
    const config = getConfiguration();

    assert.strictEqual(config.enabled, true);
    assert.strictEqual(config.autoInstall, false);
    assert.deepStrictEqual(config.monitoredFiles, DependencyFilePatterns);
  });

  test('getConfiguration should respect user settings', () => {
    // 修改模拟的返回值
    configStub.get.withArgs('autoInstall', sinon.match.any).returns(true);
    configStub.get.withArgs('monitoredFiles', sinon.match.any).returns(['custom-package.json']);

    const config = getConfiguration();

    assert.strictEqual(config.autoInstall, true);
    assert.deepStrictEqual(config.monitoredFiles, ['custom-package.json']);
  });
});