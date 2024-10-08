const twinUtils = {
  debounce(func, wait, immediate = false) {
    let timeout;
    return function () {
      const context = this,
        args = arguments;

      const later = function () {
        timeout = null;
        if (!immediate) func.apply(context, args);
      };

      const callNow = immediate && !timeout;
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);

      if (callNow) func.apply(context, args);
    };
  },
  waitForMutations: () => {
    return new Promise((resolve) => {
      const start = Date.now();
      const timeout = 10000;
      const delay = 800;
      let tid;
      const obs = new MutationObserver((_records, observer) => {
        if (Date.now() - start > timeout) {
          observer.disconnect();
          return;
        }
        if (tid) {
          clearTimeout(tid);
          tid = null;
        }
        tid = setTimeout(() => {
          observer.disconnect();
          resolve();
        }, delay);
      });
      obs.observe(document, { subtree: true, childList: true });
      tid = setTimeout(() => {
        obs.disconnect();
        resolve();
      }, delay);
    });
  }
};

window.twinUtils = twinUtils;
