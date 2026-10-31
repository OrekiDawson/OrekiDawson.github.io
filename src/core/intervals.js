export const GameIntervals = (function() {
  const interval = (handler, timeout) => {
    let id = -1;
    return {
      start() {
        // This starts the interval if it isn't already started,
        // and throws an error if it is.
        if (this.isStarted) {
          throw new Error("An already started interval cannot be started again.");
        } else {
          id = setInterval(handler, typeof timeout === "function" ? timeout() : timeout);
        }
      },
      get isStarted() {
        return id !== -1;
      },
      stop() {
        // This stops the interval if it isn't already stopped,
        // and does nothing if it is already stopped.
        clearInterval(id);
        id = -1;
      },
      restart() {
        this.stop();
        this.start();
      }
    };
  };
  return {
    // Not a getter because getter will cause stack overflow
    all() {
      return Object.values(GameIntervals)
        .filter(i =>
          Object.prototype.hasOwnProperty.call(i, "start") &&
          Object.prototype.hasOwnProperty.call(i, "stop")
        );
    },
    start() {
      // eslint-disable-next-line no-shadow
      for (const interval of this.all()) {
        interval.start();
      }
    },
    stop() {
      // eslint-disable-next-line no-shadow
      for (const interval of this.all()) {
        interval.stop();
      }
    },
    restart() {
      // eslint-disable-next-line no-shadow
      for (const interval of this.all()) {
        interval.restart();
      }
    },
    gameLoop: interval(() => gameLoop(), () => player.options.updateRate),
    save: interval(() => GameStorage.save(), () =>
      player.options.autosaveInterval - Math.clampMin(0, Date.now() - GameStorage.lastSaveTime)
    ),
    // This simplifies auto-backup code to check every second instead of dynamically stopping and
    // restarting the interval every save operation, and is how it's structured on Android as well
    checkEverySecond: interval(() => {
      if (Math.random() < 0.00001) SecretAchievement(18).unlock();
      GameStorage.tryOnlineBackups();
    }, 1000),
    checkForUpdates: interval(() => {
      if (isLocalEnvironment()) return;
      // 站点把 public/ 当作子目录整块发布（index.html 里全是 ./public/...），
      // 所以 version.txt 也必须带 public/ 前缀，否则会解析成站点根的 /version.txt（404）
      fetch("./public/version.txt")
        .then(response => (response.ok ? response.json() : null))
        .then(json => {
          if (!json || !(json.version > player.version)) return;
          Modal.message.show(json.message, { callback: updateRefresh }, 3);
        })
        .catch(() => {
          // 更新检查是可选功能，失败时必须静默：否则每 60 s 往控制台丢一条
          // unhandled rejection，污染线上 pageErrors 计数
        });
    }, 60000)
  };
}());
