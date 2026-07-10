(function installFinishHandshake(global) {
  'use strict';

  let currentSerializer = null;

  function errorCodeFor(error) {
    if (error?.name === 'QuotaExceededError' || error?.code === 22 || error?.code === 1014) {
      return 'QUOTA_EXCEEDED';
    }
    if (error?.name === 'SecurityError') return 'STORAGE_BLOCKED';
    return 'SAVE_FAILED';
  }

  function sendResult(payload) {
    if (global.parent && global.parent !== global) {
      global.parent.postMessage({ type: 'mental-care-finish-result', ...payload }, global.location.origin);
    }
  }

  function serializeDocument() {
    const controls = Array.from(global.document.querySelectorAll('input, textarea, select'))
      .filter((element) => !['button', 'file', 'hidden', 'password'].includes(element.type))
      .map((element) => {
        const key = element.id || element.name || element.getAttribute('aria-label') || element.tagName.toLowerCase();
        if (element.type === 'checkbox' || element.type === 'radio') {
          return `${key}: ${element.checked ? element.value || '選択' : '未選択'}`;
        }
        return `${key}: ${element.value}`;
      });
    return [global.document.body.innerText.trim(), controls.length ? `\n【現在の入力】\n${controls.join('\n')}` : '']
      .filter(Boolean)
      .join('\n');
  }

  function getRecoveryText() {
    const value = currentSerializer ? currentSerializer() : serializeDocument();
    return Promise.resolve(value).then((text) => String(text || ''));
  }

  function install({ workId, mode, save = null, serialize = null }) {
    if (!Number.isInteger(workId) || !['persisted', 'ephemeral'].includes(mode)) {
      throw new TypeError('Invalid mental-care finish policy');
    }
    if (mode === 'persisted' && typeof save !== 'function') {
      throw new TypeError(`Persisted work ${workId} requires an explicit save callback`);
    }
    currentSerializer = typeof serialize === 'function' ? serialize : serializeDocument;

    global.addEventListener('message', async (event) => {
      if (event.origin !== global.location.origin) return;
      if (event.source !== global.parent) return;
      if (event.data?.type !== 'mental-care-finish') return;
      if (event.data?.workId !== workId) return;

      if (mode === 'ephemeral') {
        sendResult({ workId, mode, ok: true, savedAt: null, errorCode: null });
        return;
      }

      try {
        await save();
        sendResult({
          workId,
          mode,
          ok: true,
          savedAt: new Date().toISOString(),
          errorCode: null,
        });
      } catch (error) {
        console.warn('終了時の保存処理に失敗しました', error);
        sendResult({
          workId,
          mode,
          ok: false,
          savedAt: null,
          errorCode: errorCodeFor(error),
        });
      }
    });
  }

  global.MentalCareFinish = Object.freeze({ install, getRecoveryText });
})(window);
