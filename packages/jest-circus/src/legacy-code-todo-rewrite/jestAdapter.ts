/**
 * Copyright (c) Facebook, Inc. and its affiliates. All Rights Reserved.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import path from 'path';
import {Config, TestResult} from '@jest/types';
import Runtime from 'jest-runtime';
import {Environment} from 'types/Environment';
import jestSnapshot from 'jest-snapshot';

const {} = jestSnapshot;
const FRAMEWORK_INITIALIZER = require.resolve('./jestAdapterInit');

const jestAdapter = async (
  globalConfig: Config.GlobalConfig,
  config: Config.ProjectConfig,
  environment: Environment,
  runtime: Runtime,
  testPath: string,
): Promise<TestResult.TestResult> => {
  const {
    initialize,
    runAndTransformResultsToJestFormat,
  } = runtime.requireInternalModule(FRAMEWORK_INITIALIZER);

  runtime
    .requireInternalModule(path.resolve(__dirname, './jestExpect.js'))
    .default({
      expand: globalConfig.expand,
    });

  const getPrettier = () =>
    config.prettierPath ? require(config.prettierPath) : null;
  const getBabelTraverse = () => require('@babel/traverse').default;

  const {globals, snapshotState} = initialize({
    config,
    getBabelTraverse,
    getPrettier,
    globalConfig,
    localRequire: runtime.requireModule.bind(runtime),
    parentProcess: process,
    testPath,
  });

  if (config.timers === 'fake') {
    environment.fakeTimers.useFakeTimers();
  }

  globals.beforeEach(() => {
    if (config.resetModules) {
      runtime.resetModules();
    }

    if (config.clearMocks) {
      runtime.clearAllMocks();
    }

    if (config.resetMocks) {
      runtime.resetAllMocks();

      if (config.timers === 'fake') {
        environment.fakeTimers.useFakeTimers();
      }
    }

    if (config.restoreMocks) {
      runtime.restoreAllMocks();
    }
  });

  config.setupFilesAfterEnv.forEach(path => runtime.requireModule(path));

  runtime.requireModule(testPath);
  const results = await runAndTransformResultsToJestFormat({
    config,
    globalConfig,
    testPath,
  });
  return _addSnapshotData(results, snapshotState);
};

const _addSnapshotData = (results: TestResult.TestResult, snapshotState) => {
  results.testResults.forEach(({fullName, status}) => {
    if (status === 'pending' || status === 'failed') {
      // if test is skipped or failed, we don't want to mark
      // its snapshots as obsolete.
      snapshotState.markSnapshotsAsCheckedForTest(fullName);
    }
  });

  const uncheckedCount = snapshotState.getUncheckedCount();
  const uncheckedKeys = snapshotState.getUncheckedKeys();
  if (uncheckedCount) {
    snapshotState.removeUncheckedKeys();
  }

  const status = snapshotState.save();
  results.snapshot.fileDeleted = status.deleted;
  results.snapshot.added = snapshotState.added;
  results.snapshot.matched = snapshotState.matched;
  results.snapshot.unmatched = snapshotState.unmatched;
  results.snapshot.updated = snapshotState.updated;
  results.snapshot.unchecked = !status.deleted ? uncheckedCount : 0;
  // Copy the array to prevent memory leaks
  results.snapshot.uncheckedKeys = Array.from(uncheckedKeys);
  return results;
};

module.exports = jestAdapter;
