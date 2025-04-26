// src/test/utils.test.ts
import * as assert from 'assert';
import * as path from 'path';
import * as fs from 'fs/promises';
import { DependencyFieldType } from '../config';
import { parsePackageJson, detectDependencyFieldChanges } from '../utils';

// 测试文件路径
const testDir = path.join(__dirname, 'temp');
const packageJsonPath = path.join(testDir, 'package.json');

suite('Utils Tests', () => {
  // 测试前创建临时目录和文件
  suiteSetup(async () => {
    await fs.mkdir(testDir, { recursive: true });
  });

  // 测试后清理临时目录和文件
  suiteTeardown(async () => {
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch (error) {
      console.error('清理测试目录失败', error);
    }
  });

  suite('parsePackageJson', () => {
    test('should parse dependencies from package.json', async () => {
      const packageJson = {
        dependencies: {
          'react': '^17.0.2',
          'react-dom': '^17.0.2'
        },
        devDependencies: {
          'typescript': '^4.4.3',
          'webpack': '^5.52.1'
        }
      };

      await fs.writeFile(packageJsonPath, JSON.stringify(packageJson));

      const result = await parsePackageJson(packageJsonPath, [
        DependencyFieldType.Dependencies,
        DependencyFieldType.DevDependencies
      ]);

      assert.deepStrictEqual(result, {
        dependencies: {
          'react': '^17.0.2',
          'react-dom': '^17.0.2'
        },
        devDependencies: {
          'typescript': '^4.4.3',
          'webpack': '^5.52.1'
        }
      });
    });

    test('should only extract specified dependency types', async () => {
      const packageJson = {
        dependencies: {
          'react': '^17.0.2',
          'react-dom': '^17.0.2'
        },
        devDependencies: {
          'typescript': '^4.4.3',
          'webpack': '^5.52.1'
        }
      };

      await fs.writeFile(packageJsonPath, JSON.stringify(packageJson));

      const result = await parsePackageJson(packageJsonPath, [
        DependencyFieldType.Dependencies
      ]);

      assert.deepStrictEqual(result, {
        dependencies: {
          'react': '^17.0.2',
          'react-dom': '^17.0.2'
        }
      });
    });

    test('should return null when file does not exist', async () => {
      const nonExistentPath = path.join(testDir, 'non-existent.json');
      const result = await parsePackageJson(nonExistentPath, [
        DependencyFieldType.Dependencies
      ]);

      assert.strictEqual(result, null);
    });

    test('should return null when JSON parsing fails', async () => {
      await fs.writeFile(packageJsonPath, 'Invalid JSON');

      const result = await parsePackageJson(packageJsonPath, [
        DependencyFieldType.Dependencies
      ]);

      assert.strictEqual(result, null);
    });
  });

  suite('detectDependencyFieldChanges', () => {
    test('should detect no changes when both are undefined', () => {
      const changes = detectDependencyFieldChanges(undefined, undefined);

      assert.strictEqual(changes.hasChanges, false);
      assert.deepStrictEqual(changes.added, {});
      assert.deepStrictEqual(changes.removed, {});
      assert.deepStrictEqual(changes.updated, {});
    });

    test('should detect all as added when old deps is undefined', () => {
      const newDeps = {
        'react': '^17.0.2',
        'react-dom': '^17.0.2'
      };

      const changes = detectDependencyFieldChanges(undefined, newDeps);

      assert.strictEqual(changes.hasChanges, true);
      assert.deepStrictEqual(changes.added, newDeps);
      assert.deepStrictEqual(changes.removed, {});
      assert.deepStrictEqual(changes.updated, {});
    });

    test('should detect all as removed when new deps is undefined', () => {
      const oldDeps = {
        'react': '^17.0.2',
        'react-dom': '^17.0.2'
      };

      const changes = detectDependencyFieldChanges(oldDeps, undefined);

      assert.strictEqual(changes.hasChanges, true);
      assert.deepStrictEqual(changes.added, {});
      assert.deepStrictEqual(changes.removed, oldDeps);
      assert.deepStrictEqual(changes.updated, {});
    });

    test('should detect added, removed and updated deps', () => {
      const oldDeps = {
        'react': '^17.0.1',
        'react-dom': '^17.0.1',
        'lodash': '^4.17.20'
      };

      const newDeps = {
        'react': '^17.0.2',
        'react-dom': '^17.0.1',
        'axios': '^0.21.1'
      };

      const changes = detectDependencyFieldChanges(oldDeps, newDeps);

      assert.strictEqual(changes.hasChanges, true);
      assert.deepStrictEqual(changes.added, { 'axios': '^0.21.1' });
      assert.deepStrictEqual(changes.removed, { 'lodash': '^4.17.20' });
      assert.deepStrictEqual(changes.updated, {
        'react': { oldVersion: '^17.0.1', newVersion: '^17.0.2' }
      });
    });

    test('should detect no changes when deps are the same', () => {
      const oldDeps = {
        'react': '^17.0.2',
        'react-dom': '^17.0.2'
      };

      const newDeps = {
        'react': '^17.0.2',
        'react-dom': '^17.0.2'
      };

      const changes = detectDependencyFieldChanges(oldDeps, newDeps);

      assert.strictEqual(changes.hasChanges, false);
      assert.deepStrictEqual(changes.added, {});
      assert.deepStrictEqual(changes.removed, {});
      assert.deepStrictEqual(changes.updated, {});
    });
  });
});