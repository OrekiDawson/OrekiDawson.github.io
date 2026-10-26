/**
 * Async is used for making a big pile of computation into a manageable
 * set of batches that don't lock up the UI.
 * run() is the nominal entry point.
 */
window.Async = {
  _enabled: true,
  get enabled() {
    return this._enabled;
  },
  set enabled(val) {
    this._enabled = val;
  },
  runForTime(fun, maxIter, config) {
    const batchSize = config.batchSize || 1;
    const maxTime = config.maxTime;
    const t0 = Date.now();
    for (let remaining = maxIter; remaining > 0;) {
      for (let j = 0; j < Math.min(remaining, batchSize); ++j) {
        fun(remaining);
        --remaining;
      }
      if (Date.now() - t0 >= maxTime) return remaining;
    }
    return 0;
  },
  sleepPromise: ms => new Promise(resolve => setTimeout(resolve, ms)),
  /**
   * Asynchronously run the specified function maxIter times, letting the event
   * loop run periodically. The function is run in chunks of config.batchSize;
   * when the elapsed time reaches a specified amount, execution will pause for
   * config.sleepTime
   * @param {function} fun Function to run (e.g. do some computation)
   * @param {number} maxIter Total number of times to run the function
   * @param {Object} config Options for how to do the calculation
   * @param {Number} config.maxTime Max time, ms, over which to run continuously
   * @param {Number} [config.batchSize] Number of times to run fun between time checks. Since Date.now() takes
   *    non-zero time to execute, you don't necessarily want to check every iteration
   * @param {Number} [config.sleepTime] Amount of time to suspend between computing
   * @param {function(Number)} [config.asyncEntry] IF CALCULATION ISN'T DONE IN ONE BATCH, then this
   *    gets called before the first sleep. Use this to set up a progress bar, for example. The function will
   *    get passed the number of iterations run so far.
   * @param {function(Number)} [config.asyncProgress] Called after the second and subsequent batches, with the
   *    total number of iterations done thus far
   * @param {function} [config.asyncExit] If more than one batch was done, this will be called. For example, can
   *    be used to hide a progress bar.
   * @param {function} [config.then] Run after everything is done
   * @returns {Promise|undefined}
   */
  run(fun, maxIter, config) {
    if (this.enabled) {
      // Disable async if we're already doing async
      this.enabled = false;
      const runResult = this._run(fun, maxIter, config);
      // enabled 必须无条件恢复：原先只在 config.then 存在且计算成功时才恢复，
      // 一旦抛错（或调用方没给 then），后续所有 Async.run 都会退化成同步执行
      const chained = config.then ? runResult.then(() => config.then()) : runResult;
      return chained.then(
        value => { this.enabled = true; return value; },
        error => { this.enabled = true; throw error; }
      );
    }
    // 同步回退分支（如被另一个 Async.run 嵌套调用时）：仍然要成对触发 asyncEntry/asyncExit。
    // 调用方（simulateTime、扩增现实）把「重启计时器 / 解冻倍率 / 清除进度条」放在 asyncExit 里，
    // 原先这条分支完全不调用它，会留下：GameIntervals 停摆 + OrekiSpeed 冻结令牌泄漏。
    let syncFailure = null;
    try {
      if (config.asyncEntry) config.asyncEntry(0);
      for (let i = 0; i < maxIter; ++i) {
        fun(i);
      }
    } catch (e) {
      syncFailure = e;
    } finally {
      if (config.asyncExit) {
        try {
          config.asyncExit();
        } catch (exitError) {
          // 清理本身出错时，不要把计算过程中的原始异常盖掉
          if (!syncFailure) syncFailure = exitError;
        }
      }
    }
    if (syncFailure) throw syncFailure;
    if (config.then) config.then();
  },
  /**
   * @private
   */
  async _run(fun, maxIter, config) {
    if (!config.progress) config.progress = {};
    // We need to use config.progress variables because something else could change them
    // (e.g. someone speeding up offline progress)
    config.progress.maxIter = maxIter;
    let failure = null;
    try {
      config.progress.remaining = this.runForTime(fun, config.progress.maxIter, config);
      const sleepTime = config.sleepTime || 1;
      if (config.asyncEntry) config.asyncEntry(config.progress.maxIter - config.progress.remaining);
      // 这里不能用 return 提前退出：finally 里捕获到的清理异常会因此被丢掉
      if (config.progress.remaining > 0) {
        do {
          await this.sleepPromise(sleepTime);
          config.progress.remaining = this.runForTime(fun, config.progress.remaining, config);
          if (config.asyncProgress) config.asyncProgress(config.progress.maxIter - config.progress.remaining);
        } while (config.progress.remaining > 0);
      }
    } catch (e) {
      failure = e;
    } finally {
      // 早退（一批就跑完）与异常抛出都必须走清理：否则 asyncEntry 造成的副作用
      // （GameIntervals 停止、simulateTime 的倍率冻结）不会被撤销
      if (config.asyncExit) {
        try {
          config.asyncExit();
        } catch (exitError) {
          if (!failure) failure = exitError;
        }
      }
    }
    if (failure) throw failure;
  }
};
