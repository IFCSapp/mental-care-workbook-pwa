/* ===== こころの立て直しワークブック — メインアプリ ===== */

import {
  DATA_SCHEMA_VERSION,
  EPHEMERAL_WORK_IDS,
  PERSISTED_WORK_IDS,
  WORK_DATA_POLICY,
  migrateStoredEntries,
  migrateWorkbookStorage,
} from './work-data-policy.js';

const WORKS = [
  {
    id: 1,
    file: '1.問題を深く知る1.1.html',
    label: '困っていることを整理する',
    desc: 'どんな場面で、何が起きているのか。自分自身を責めずに、出来事を見える形にしていくワークです。',
    workName: '困っていることを整理する',
    legacyName: '問題を深く知る',
    modalNote: null,
  },
  {
    id: 2,
    file: '2.DOTS1.0.html',
    label: 'つらさへの対処を振り返る',
    desc: 'これまで自分がつらいときにどうやってしのいできたか、工夫を振り返ります。',
    workName: 'つらさへの対処を振り返る',
    legacyName: 'DOTS',
    modalNote: null,
  },
  {
    id: 3,
    file: '3.創造的絶望1.1.html',
    label: 'コントロールとの関わりを見る',
    desc: '感情や考えをなんとかしようとすることを、体験を通じて見直します。',
    workName: 'コントロールとの関わりを見る',
    legacyName: '創造的絶望',
    modalNote: 'このワークは、人によってはしんどく感じることがあります。無理に進めず、しんどくなったら途中で止めて大丈夫です。職員と一緒に使うこともできます。',
  },
  {
    id: 4,
    file: '4.視覚化ツール1.0.html',
    label: '頭の中を少し離れて見る',
    desc: '頭のなかの出来事を、色や形で見えるように整理します。',
    workName: '頭の中を少し離れて見る',
    legacyName: '視覚化ツール',
    modalNote: null,
  },
  {
    id: 5,
    file: '5.心のコンパス1.2.html',
    label: '大事にしたい方向を見つける',
    desc: '生活のいろいろな場面で、どんなふるまいを大切にしたいかを考えます。',
    workName: '大事にしたい方向を見つける',
    legacyName: '心のコンパス',
    modalNote: null,
  },
  {
    id: 6,
    file: '6.leaves_on_stream_single_full.html',
    label: '浮かぶ言葉を眺める',
    desc: '頭に浮かぶ言葉や気持ちを、葉に乗せて流れていくものとして見るワークです。',
    workName: '浮かぶ言葉を眺める',
    legacyName: 'Leaves on the Stream',
    modalNote: null,
  },
  {
    id: 7,
    file: '7.少し距離を取る.html',
    label: '考えと少し距離を取る',
    desc: '頭の中の言葉を「通知」と捉えて、少し距離を取ってから小さな行動を決めます。',
    workName: '考えと少し距離を取る',
    legacyName: '少し距離を取る',
    modalNote: null,
  },
  {
    id: 8,
    file: '8.いまどうするか1.0.html',
    label: '今できる一歩を選ぶ',
    desc: '気がかりを整理して、今の自分にできる一歩を見つけるワークです。',
    workName: '今できる一歩を選ぶ',
    legacyName: 'いまどうするか',
    modalNote: null,
  },
].map((work) => ({ ...work, ...WORK_DATA_POLICY[work.id] }));

const PROFILE_STORAGE_KEY = 'mentalCareWorkbookProfile';
const FULL_BACKUP_META = {
  app: 'mental-care-workbook',
  scope: 'full-workbook',
  schemaVersion: DATA_SCHEMA_VERSION,
  compatibleSchemaVersions: [1, DATA_SCHEMA_VERSION],
  includedWorkIds: PERSISTED_WORK_IDS,
  excludedEphemeralWorkIds: EPHEMERAL_WORK_IDS,
};
const WORK_STORAGE_KEYS = [
  PROFILE_STORAGE_KEY,
  ...Object.values(WORK_DATA_POLICY).flatMap((policy) => [
    policy.storageKey,
    ...(policy.legacyStorageKeys || []),
  ]).filter(Boolean),
];
let backupStatus = null;
let rejectedBackupFile = null;

try {
  migrateWorkbookStorage(localStorage);
} catch (error) {
  console.warn('保存データをv2へ移行できませんでした。元の記録は保持しています。', error);
  backupStatus = { role: 'alert', text: '保存データを新しい形式へ移行できませんでした。元の記録は変更していません。' };
}


function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function loadProfile() {
  try {
    const saved = localStorage.getItem(PROFILE_STORAGE_KEY);
    if (saved) return { name: '', ...JSON.parse(saved) };
  } catch (err) {
    console.warn('表紙情報の読み込みに失敗しました', err);
  }
  return { name: '' };
}

function saveProfile(profile) {
  try {
    localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify({
      name: profile.name || '',
      updatedAt: new Date().toISOString(),
    }));
  } catch (err) {
    console.warn('表紙情報の保存に失敗しました', err);
  }
}


function getSafeFilePart(value, fallback) {
  return String(value || fallback)
    .trim()
    .replace(/[\\/:*?"<>|\s]+/g, '-')
    .replace(/^-+|-+$/g, '') || fallback;
}

function downloadJsonFile(filename, payload) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function downloadTextFile(filename, text, type = 'text/plain;charset=utf-8') {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function collectWorkbookBackup() {
  const entries = {};
  WORK_STORAGE_KEYS.forEach((key) => {
    const value = localStorage.getItem(key);
    if (value !== null) entries[key] = value;
  });
  return {
    _workbookBackup: FULL_BACKUP_META,
    createdAt: new Date().toISOString(),
    exportedAt: new Date().toISOString(),
    storage: entries,
  };
}

function exportFullBackup() {
  const profile = loadProfile();
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const name = getSafeFilePart(profile.name, 'workbook');
  downloadJsonFile(`mental-care-workbook_${date}_${name}.json`, collectWorkbookBackup());
}

function isValidFullBackup(parsed) {
  const meta = parsed?._workbookBackup;
  return meta?.app === FULL_BACKUP_META.app
    && meta?.scope === FULL_BACKUP_META.scope
    && [1, DATA_SCHEMA_VERSION].includes(meta?.schemaVersion)
    && parsed?.storage
    && typeof parsed.storage === 'object';
}

function prepareBackupImport(parsed) {
  if (!isValidFullBackup(parsed)) throw new Error('INVALID_BACKUP');
  const entries = Object.entries(parsed.storage).filter(([key, value]) => (
    WORK_STORAGE_KEYS.includes(key) && typeof value === 'string'
  ));
  if (!entries.length) throw new Error('EMPTY_BACKUP');
  entries.forEach(([key, value]) => {
    const decoded = JSON.parse(value);
    if (!decoded || typeof decoded !== 'object' || Array.isArray(decoded)) {
      throw new Error(`INVALID_ENTRY:${key}`);
    }
  });
  const migratedEntries = migrateStoredEntries(entries);
  return {
    sourceSchemaVersion: parsed._workbookBackup.schemaVersion,
    entries: migratedEntries,
    overwriteCount: entries.filter(([key]) => localStorage.getItem(key) !== null).length,
    workIds: PERSISTED_WORK_IDS.filter((id) => entries.some(([key]) => (
      key === WORK_DATA_POLICY[id].storageKey || WORK_DATA_POLICY[id].legacyStorageKeys?.includes(key)
    ))),
    excludedEphemeralWorkIds: EPHEMERAL_WORK_IDS,
  };
}

function applyPreparedBackup(prepared) {
  const originals = new Map(prepared.entries.map(([key]) => [key, localStorage.getItem(key)]));
  try {
    prepared.entries.forEach(([key, value]) => {
      localStorage.setItem(key, value);
      if (localStorage.getItem(key) !== value) throw new Error(`VERIFY_FAILED:${key}`);
    });
  } catch (error) {
    prepared.entries.forEach(([key]) => {
      try { localStorage.removeItem(key); } catch {}
    });
    originals.forEach((value, key) => {
      if (value === null) return;
      try { localStorage.setItem(key, value); } catch {}
    });
    throw error;
  }
}

function showBackupImportConfirm(prepared) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  const hasProfile = prepared.entries.some(([key]) => key === PROFILE_STORAGE_KEY);
  overlay.innerHTML = `
    <div class="modal-content" role="dialog" aria-modal="true" aria-labelledby="import-title" tabindex="-1">
      <p class="modal-heading" id="import-title">バックアップを読み込みますか？</p>
      <div class="modal-body">
        <p>対象: ${prepared.workIds.length ? `work${prepared.workIds.join('・')}` : ''}${hasProfile ? `${prepared.workIds.length ? 'と' : ''}表紙` : ''}</p>
        <p>読み込む記録は${prepared.entries.length}件です。現在の記録${prepared.overwriteCount}件を上書きします。</p>
        <p>体験型のwork${prepared.excludedEphemeralWorkIds.join('・')}は保存対象ではないため、このファイルには含まれません。</p>
        <p>元のバックアップ形式はv${prepared.sourceSchemaVersion}です。値を保ったままv${DATA_SCHEMA_VERSION}として扱います。</p>
      </div>
      <div class="modal-actions">
        <button class="btn btn-ghost" id="import-cancel">読み込まない</button>
        <button class="btn btn-primary" id="import-confirm">上書きして読み込む</button>
      </div>
    </div>`;
  const close = openModal({ overlay, initialFocus: overlay.querySelector('#import-cancel') });
  overlay.querySelector('#import-cancel').addEventListener('click', () => close());
  overlay.querySelector('#import-confirm').addEventListener('click', () => {
    try {
      applyPreparedBackup(prepared);
      rejectedBackupFile = null;
      backupStatus = { role: 'status', text: `バックアップを読み込みました。対象${prepared.entries.length}件、上書き${prepared.overwriteCount}件です。` };
      close({ restoreFocus: false });
      renderHome();
    } catch (error) {
      console.warn('全体バックアップの保存に失敗しました', error);
      backupStatus = { role: 'alert', text: 'バックアップを保存できませんでした。現在の記録は変更していません。' };
      close({ restoreFocus: false });
      renderHome();
    }
  });
}

function importFullBackupFile(file) {
  const reader = new FileReader();
  reader.onload = (event) => {
    try {
      const rawText = String(event.target.result || '');
      const parsed = JSON.parse(rawText);
      showBackupImportConfirm(prepareBackupImport(parsed));
    } catch (err) {
      console.warn('全体バックアップの読み込みに失敗しました', err);
      backupStatus = { role: 'alert', text: 'バックアップを読み込めませんでした。ファイルが壊れているか、対象データの形式が違います。現在の記録は変更していません。' };
      rejectedBackupFile = {
        name: `読み込めなかった_${getSafeFilePart(file.name, 'backup')}`,
        text: String(event.target.result || ''),
      };
      renderHome();
    }
  };
  reader.readAsText(file, 'UTF-8');
}

/* ===== ルーティング ===== */

function navigate(hash) {
  window.location.hash = hash;
}

let finishFallbackTimer = null;
let activeModalCleanup = null;
let pendingFinishWorkId = null;

const CRISIS_GUIDE_HTML = `
  <p><strong>今すぐ自分や誰かの安全が心配なとき、自分を傷つける行動を止めにくいときは、このワークより安全の確保を優先してください。</strong></p>
  <p>近くの人、利用中の支援機関・医療機関、地域の緊急窓口へ連絡してください。</p>
  <p><a href="https://www.mhlw.go.jp/mamorouyokokoro/" target="_blank" rel="noopener noreferrer">厚生労働省「まもろうよ こころ」で相談先を見る</a></p>
`;

const USER_BOUNDARY_HTML = `
  <p>このワークブックは、気持ちや考えを正しく直す検査でも、診断や治療でもありません。今の場面を整理し、大切にしたい方向や、今の条件で選べそうなことを探すための道具です。</p>
  <p>このワークでいう「そのままにする」は、危険や暴力、不当な状況にとどまることではありません。安全のために離れる、断る、助けを求めることも大切な選択です。</p>
`;

const SUPPORT_BOUNDARY_HTML = `
  <p>この画面は本人のための記入欄です。最初に、どこまで一緒に見るか、誰が入力するか、保存・印刷・共有をどうするかを本人と決めてください。</p>
  <p>空欄・中断・やり直しは本人の選択です。記入量や点数を評価や支援継続の条件にせず、本人の明示的な同意なく内容をコピー・印刷・提出しないでください。</p>
`;

const SUPPORT_GUIDE_HTML = `
  <h3>始める前に、本人と決めること</h3>
  <p>どこまで一緒に見るか、誰が入力するか、保存・印刷・共有をどうするかを、本人と先に決めます。支援者が補助できるのは、本人が希望した範囲の読み上げや入力操作です。</p>
  <h3>ワーク中に守ること</h3>
  <p>本人の言葉を支援者の表現へ置き換えたり、正解へ導いたりしません。空欄、中断、戻る、やり直す、支援者に見せないことは本人が選べます。記入量や内容を点数化せず、支援継続の条件にも使いません。</p>
  <h3>記録と共有</h3>
  <p>記録型workはこのブラウザ内に保存されます。共用端末では閲覧される可能性があります。本人の明示的な同意なく、画面、印刷物、バックアップをコピー・提出・共有しません。このガイドを開いても本人の保存データは表示も送信もされません。</p>
  <h3>安全が心配なとき</h3>
  <p>今すぐの安全が心配なときは、ワークを続けず、所属先の緊急時手順、医療機関、地域の相談先へ切り替えます。</p>
  ${CRISIS_GUIDE_HTML}
`;

function openModal({ overlay, initialFocus, onClose }) {
  if (activeModalCleanup) activeModalCleanup();

  const app = document.getElementById('app');
  const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const dialog = overlay.querySelector('[role="dialog"]');
  const focusableSelector = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

  app?.setAttribute('inert', '');
  app?.setAttribute('aria-hidden', 'true');
  document.body.appendChild(overlay);

  const handleKeydown = (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      cleanup();
      return;
    }
    if (event.key !== 'Tab') return;

    const focusables = Array.from(dialog.querySelectorAll(focusableSelector));
    if (!focusables.length) {
      event.preventDefault();
      dialog.focus();
      return;
    }
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  function cleanup({ restoreFocus = true } = {}) {
    if (!overlay.isConnected) return;
    document.removeEventListener('keydown', handleKeydown, true);
    overlay.remove();
    app?.removeAttribute('inert');
    app?.removeAttribute('aria-hidden');
    activeModalCleanup = null;
    onClose?.();
    if (restoreFocus && opener?.isConnected) opener.focus();
  }

  document.addEventListener('keydown', handleKeydown, true);
  activeModalCleanup = cleanup;
  requestAnimationFrame(() => (initialFocus || dialog)?.focus());
  return cleanup;
}

function clearFinishFallback() {
  if (finishFallbackTimer) {
    clearTimeout(finishFallbackTimer);
    finishFallbackTimer = null;
  }
}

function returnHomeAfterFinish() {
  clearFinishFallback();
  navigate('home');
}

function showFinishConfirm(workId) {
  const work = WORKS.find((item) => item.id === workId);
  if (!work) return;
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal-content modal-content-finish" role="dialog" aria-modal="true" aria-labelledby="finish-title" tabindex="-1">
      <span class="modal-icon" aria-hidden="true">☕</span>
      <p class="modal-heading" id="finish-title">今日はここまでにしますか？</p>
      <div class="modal-body">
        <p>${work.mode === 'persisted'
          ? 'このワークは記録型です。保存できたことを確認してから結果をお知らせします。'
          : 'このワークは体験型です。入力は保存されず、閉じると消えます。'}</p>
        <p>ここで終えても、続けても大丈夫です。</p>
      </div>
      <div class="modal-actions">
        <button class="btn btn-ghost" id="finish-cancel">続ける</button>
        <button class="btn btn-primary" id="finish-confirm">ここまでにする</button>
      </div>
    </div>
  `;

  const close = openModal({
    overlay,
    initialFocus: overlay.querySelector('#finish-cancel'),
  });

  overlay.querySelector('#finish-cancel').addEventListener('click', () => close());
  overlay.querySelector('#finish-confirm').addEventListener('click', () => {
    close({ restoreFocus: false });
    requestCurrentWorkFinish(work.id);
  });
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });
}

function showSavingStatus(work) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal-content modal-content-finish" role="dialog" aria-modal="true" aria-labelledby="saving-title" tabindex="-1">
      <p class="modal-heading" id="saving-title">${work.mode === 'persisted' ? '保存を確認しています' : '終了を確認しています'}</p>
      <div class="modal-body"><p role="status">画面を閉じずに、そのままお待ちください。</p></div>
    </div>
  `;
  openModal({ overlay });
}

async function getCurrentWorkText(work) {
  const iframe = document.getElementById('work-frame');
  try {
    const bodyText = await iframe?.contentWindow?.MentalCareFinish?.getRecoveryText?.();
    if (bodyText) return `【${work.workName}】\n\n${bodyText}`;
  } catch (error) {
    console.warn('現在の入力内容を取得できませんでした', error);
  }
  return `【${work.workName}】\n\n入力内容を取得できませんでした。画面を閉じず、各入力欄から内容を控えてください。`;
}

async function copyCurrentWorkText(work) {
  const text = await getCurrentWorkText(work);
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    textarea.remove();
  }
}

async function downloadCurrentWorkText(work) {
  const blob = new Blob([await getCurrentWorkText(work)], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `mental-care-work${work.id}-${new Date().toISOString().slice(0, 10)}.txt`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function showFinishResult(work, result) {
  if (activeModalCleanup) activeModalCleanup({ restoreFocus: false });
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  const savedTime = result.savedAt
    ? new Date(result.savedAt).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })
    : '';
  const succeeded = result.ok === true;
  const failureDetail = {
    QUOTA_EXCEEDED: 'ブラウザの保存容量を確認してください。',
    STORAGE_BLOCKED: 'ブラウザの保存設定を確認してください。',
    TIMEOUT: 'ワーク画面から保存結果が返りませんでした。',
  }[result.errorCode] || '保存処理を完了できませんでした。';
  const resultMessage = succeeded
    ? (result.mode === 'persisted'
      ? `このブラウザに保存しました（${savedTime}）。あとで続きから開けます。`
      : 'このワークの入力は保存されません。閉じると消えます。')
    : `保存できませんでした。${failureDetail} 画面を閉じる前に、内容をコピーするかファイルへ保存できます。`;
  overlay.innerHTML = `
    <div class="modal-content modal-content-finish" role="dialog" aria-modal="true" aria-labelledby="finish-result-title" tabindex="-1">
      <p class="modal-heading" id="finish-result-title">${succeeded ? 'ここまでにします' : '保存を確認できませんでした'}</p>
      <div class="modal-body">
        <p role="${succeeded ? 'status' : 'alert'}" class="${succeeded ? 'save-status-success' : 'save-status-error'}">${resultMessage}</p>
        <p>ここまでで気づいたことがあれば、1つだけ持ち帰れます。今は何もしない、あとで見直すことも選べます。</p>
      </div>
      <div class="modal-actions ${succeeded ? '' : 'modal-actions-stack'}">
        ${succeeded ? `
          <button class="btn btn-ghost" id="finish-result-continue">続ける</button>
          <button class="btn btn-primary" id="finish-result-home">表紙へ戻る</button>
        ` : `
          <button class="btn btn-primary" id="finish-result-retry">再試行</button>
          <button class="btn btn-ghost" id="finish-result-copy">内容をコピー</button>
          <button class="btn btn-ghost" id="finish-result-file">テキストとして保存</button>
          <button class="btn btn-ghost" id="finish-result-close">保存せず閉じる</button>
        `}
      </div>
    </div>
  `;
  const close = openModal({
    overlay,
    initialFocus: overlay.querySelector(succeeded ? '#finish-result-continue' : '#finish-result-retry'),
  });
  if (succeeded) {
    overlay.querySelector('#finish-result-continue').addEventListener('click', () => close());
    overlay.querySelector('#finish-result-home').addEventListener('click', () => {
      close({ restoreFocus: false });
      returnHomeAfterFinish();
    });
  } else {
    overlay.querySelector('#finish-result-retry').addEventListener('click', () => {
      close({ restoreFocus: false });
      requestCurrentWorkFinish(work.id);
    });
    overlay.querySelector('#finish-result-copy').addEventListener('click', async (event) => {
      await copyCurrentWorkText(work);
      event.currentTarget.textContent = 'コピーしました';
    });
    overlay.querySelector('#finish-result-file').addEventListener('click', async () => downloadCurrentWorkText(work));
    overlay.querySelector('#finish-result-close').addEventListener('click', () => {
      close({ restoreFocus: false });
      returnHomeAfterFinish();
    });
  }
}

function requestCurrentWorkFinish(workId) {
  const iframe = document.getElementById('work-frame');
  const work = WORKS.find((item) => item.id === workId);
  if (!work) return;
  clearFinishFallback();
  pendingFinishWorkId = workId;
  showSavingStatus(work);

  if (iframe?.contentWindow) {
    iframe.contentWindow.postMessage({ type: 'mental-care-finish', workId }, window.location.origin);
    finishFallbackTimer = setTimeout(() => {
      pendingFinishWorkId = null;
      showFinishResult(work, { workId, mode: work.mode, ok: false, savedAt: null, errorCode: 'TIMEOUT' });
    }, 1600);
  } else {
    pendingFinishWorkId = null;
    showFinishResult(work, { workId, mode: work.mode, ok: false, savedAt: null, errorCode: 'FRAME_UNAVAILABLE' });
  }
}

window.addEventListener('message', (event) => {
  if (event.origin !== window.location.origin) return;
  if (event.data?.type !== 'mental-care-finish-result') return;
  const iframe = document.getElementById('work-frame');
  if (event.source !== iframe?.contentWindow) return;
  if (event.data.workId !== pendingFinishWorkId) return;
  const work = WORKS.find((item) => item.id === pendingFinishWorkId);
  if (!work || event.data.mode !== work.mode) return;
  clearFinishFallback();
  pendingFinishWorkId = null;
  showFinishResult(work, event.data);
});

function getCurrentRoute() {
  const hash = window.location.hash.replace(/^#\/?/, '') || 'home';
  return hash;
}

/* ===== ビューレンダリング ===== */

function showSafetyGuide(work = null) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal-content" role="dialog" aria-modal="true" aria-labelledby="safety-title" tabindex="-1">
      <p class="modal-heading" id="safety-title">安全と使い方${work ? ` — ${work.workName}` : ''}</p>
      <div class="modal-body boundary-copy">${USER_BOUNDARY_HTML}${CRISIS_GUIDE_HTML}</div>
      <div class="modal-actions"><button class="btn btn-primary" id="safety-close">閉じる</button></div>
    </div>
  `;
  const close = openModal({ overlay, initialFocus: overlay.querySelector('#safety-close') });
  overlay.querySelector('#safety-close').addEventListener('click', () => close());
}

function showSupportGuide() {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  // The guide is fixed product copy, not user-provided HTML.
  overlay.innerHTML = `
    <div class="modal-content modal-content-guide" role="dialog" aria-modal="true" aria-labelledby="support-guide-title" tabindex="-1">
      <p class="modal-heading" id="support-guide-title">支援者向け 1ページガイド</p>
      <div class="modal-body boundary-copy supporter-guide-copy">${SUPPORT_GUIDE_HTML}</div>
      <div class="modal-actions"><button class="btn btn-primary" id="support-guide-close">閉じる</button></div>
    </div>`;
  const close = openModal({ overlay, initialFocus: overlay.querySelector('#support-guide-close') });
  overlay.querySelector('#support-guide-close').addEventListener('click', () => close());
}

function showStoredDataPolicy() {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal-content" role="dialog" aria-modal="true" aria-labelledby="stored-data-title" tabindex="-1">
      <p class="modal-heading" id="stored-data-title">保存されるもの</p>
      <div class="modal-body boundary-copy">
        <p><strong>「保存される」:</strong> この表示があるワークの入力は、このブラウザ内に保存され、全体バックアップに含まれます。</p>
        <p><strong>「この画面だけ」:</strong> この表示があるワークの入力は保存されず、画面を閉じると消えます。</p>
        <p>表紙で入力した名前も、このブラウザ内に保存されます。</p>
      </div>
      <div class="modal-actions"><button class="btn btn-primary" id="stored-data-close">閉じる</button></div>
    </div>
  `;
  const close = openModal({ overlay, initialFocus: overlay.querySelector('#stored-data-close') });
  overlay.querySelector('#stored-data-close').addEventListener('click', () => close());
}

function showClearWorkbookDataConfirm() {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal-content" role="dialog" aria-modal="true" aria-labelledby="clear-data-title" tabindex="-1">
      <p class="modal-heading" id="clear-data-title">このブラウザの記録を消しますか？</p>
      <div class="modal-body"><p>表紙の名前と、「保存される」と表示されたワークの記録を消します。この操作は取り消せません。</p></div>
      <div class="modal-actions">
        <button class="btn btn-ghost" id="clear-data-cancel">消さない</button>
        <button class="btn btn-danger" id="clear-data-confirm">記録を消す</button>
      </div>
    </div>
  `;
  const close = openModal({ overlay, initialFocus: overlay.querySelector('#clear-data-cancel') });
  overlay.querySelector('#clear-data-cancel').addEventListener('click', () => close());
  overlay.querySelector('#clear-data-confirm').addEventListener('click', () => {
    WORK_STORAGE_KEYS.forEach((key) => localStorage.removeItem(key));
    close({ restoreFocus: false });
    renderHome();
  });
}

function renderHome() {
  const app = document.getElementById('app');
  const profile = loadProfile();
  // Work metadata comes from static source definitions; profile.name is escaped below.
  app.innerHTML = `
    <div class="app-header">
      <h1>🌱 こころの立て直しワークブック</h1>
      <p>気持ちや考えを消したり、正しい答えに直したりするためではありません。今の場面を少し整理し、大切にしたい方向や、今の条件で選べそうなことを探すためのワークブックです。</p>
    </div>
    <section class="boundary-card" aria-labelledby="boundary-title">
      <h2 id="boundary-title">使う前に確認してください</h2>
      <p><strong>診断や治療でもありません。緊急相談の代わりでもありません。</strong>書かない、途中でやめる、安全のために離れる・断る・助けを求めることも選べます。</p>
      <details class="boundary-details">
        <summary>安全と使い方を詳しく読む</summary>
        <div>${USER_BOUNDARY_HTML}<div class="crisis-box">${CRISIS_GUIDE_HTML}</div></div>
      </details>
    </section>
    <p class="work-choice-intro">順番に全部行う必要はありません。今扱いたいことに近いものを1つ選べます。開いてから戻る、途中でやめる、何も書かないことも選べます。</p>
    <div class="work-grid">
      ${WORKS.map((w) => `
        <button class="work-card" data-work-id="${w.id}">
          <span class="work-card-head">
            <span class="work-card-label">${w.label}</span>
            <span class="work-save-tag work-save-tag--${w.mode}" data-save-mode="${w.mode}">${w.mode === 'persisted' ? '保存される' : 'この画面だけ'}</span>
          </span>
          <span class="work-card-meta"><span>${w.duration}</span></span>
          <span class="work-card-desc">${w.desc}</span>
        </button>`).join('')}
    </div>
    <section class="cover-card" aria-labelledby="cover-title">
      <div>
        <h2 id="cover-title">名前</h2>
        <p>名前を入れておくと、対応しているワークの名前欄に反映されます。</p>
      </div>
      <label class="cover-field" for="cover-name">
        <span>名前</span>
        <input id="cover-name" type="text" value="${escapeHtml(profile.name)}" autocomplete="name" placeholder="名前を入力">
      </label>
    </section>
    <section class="support-card" aria-labelledby="support-title">
      <h2 id="support-title">支援者と一緒に使う場合</h2>
      <p>本人の同意、補助する範囲、記録の扱いを始める前に確認します。支援者向けガイドを開いても、本人の保存データは表示されません。</p>
      <button class="btn btn-ghost" id="show-support-guide">支援者向け1ページガイドを開く</button>
    </section>
    <section class="backup-card" aria-labelledby="backup-title">
      <div>
        <h2 id="backup-title">データ管理</h2>
        <p>全体バックアップの対象は、表紙の名前と「保存される」と表示されたワークです。「この画面だけ」は含まれません。</p>
      </div>
      <div class="backup-actions">
        <button class="btn btn-ghost" id="show-stored-data">保存されるものを見る</button>
        <button class="btn btn-primary" id="export-full-backup">バックアップを保存</button>
        <label class="btn btn-ghost backup-import-label">バックアップを読み込む
          <input id="import-full-backup" type="file" accept=".json,application/json" hidden>
        </label>
        <button class="btn btn-danger" id="clear-workbook-data">このブラウザの記録を消す</button>
      </div>
      ${backupStatus ? `<p class="backup-status ${backupStatus.role === 'alert' ? 'backup-status-error' : ''}" role="${backupStatus.role}">${escapeHtml(backupStatus.text)}</p>` : ''}
      ${rejectedBackupFile ? '<button class="btn btn-ghost" id="download-rejected-backup">読み込めなかったファイルを保存</button>' : ''}
    </section>
    <div class="app-footer">
      <p>このアプリの画面を開くために通信が発生しますが、入力内容をアプリのサーバーへ送る処理はありません。「保存される」はこのブラウザ内に残り、「この画面だけ」は画面を閉じると消えます。共用端末での閲覧や、ブラウザデータ消去・保存容量・設定による消失に注意してください。</p>
    </div>
  `;

  const nameInput = document.getElementById('cover-name');
  nameInput.addEventListener('input', () => {
    saveProfile({ name: nameInput.value.trim() });
  });

  document.getElementById('export-full-backup').addEventListener('click', exportFullBackup);
  document.getElementById('show-stored-data').addEventListener('click', showStoredDataPolicy);
  document.getElementById('show-support-guide').addEventListener('click', showSupportGuide);
  document.getElementById('clear-workbook-data').addEventListener('click', showClearWorkbookDataConfirm);
  document.getElementById('import-full-backup').addEventListener('change', (event) => {
    const file = event.target.files?.[0];
    if (file) importFullBackupFile(file);
    event.target.value = '';
  });
  document.getElementById('download-rejected-backup')?.addEventListener('click', () => {
    downloadTextFile(rejectedBackupFile.name, rejectedBackupFile.text, 'application/json;charset=utf-8');
  });

  document.querySelectorAll('.work-card').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = parseInt(btn.dataset.workId, 10);
      showConfirm(id);
    });
  });
}

/* ===== 確認モーダル ===== */

function showConfirm(workId) {
  const work = WORKS.find(w => w.id === workId);
  if (!work) return;

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  // `work` is selected from the static WORKS constant above, not user-provided HTML.
  overlay.innerHTML = `
    <div class="modal-content" role="dialog" aria-modal="true" aria-labelledby="confirm-title" tabindex="-1">
      <span class="modal-icon" aria-hidden="true">🌱</span>
      <p class="modal-heading" id="confirm-title">「${work.workName}」</p>
      <p class="modal-subtitle">${work.duration}（時間切れはありません）</p>
      <div class="modal-body">
        <p><strong>このワークで行うこと</strong><br>${work.desc}<br>画面の案内に沿って、起きたことや選べそうなことを1つずつ見ます。</p>
        <p><strong>データ</strong><br>${work.mode === 'persisted'
          ? '入力はこのブラウザ内に保存され、全体バックアップの対象になります。'
          : '入力は保存されません。閉じると消えます。終了前に自分でテキストへ保存できます。'}</p>
        <div class="start-save-state" aria-label="保存状態">
          <span class="work-save-tag work-save-tag--${work.mode}" data-save-mode="${work.mode}">${work.mode === 'persisted' ? '保存される' : 'この画面だけ'}</span>
        </div>
        <details class="start-safety-details">
          <summary>安全と使い方を確認する</summary>
          <div>${USER_BOUNDARY_HTML}${CRISIS_GUIDE_HTML}</div>
        </details>
        <details class="work-background-details">
          <summary>このワークの背景</summary>
          <div>
            <p>考えや気持ちを消すことを目標にせず、今の場面で選べる行動の幅を確かめる考え方を背景にしています。これは効果や診断を示す説明ではありません。</p>
            <p><a href="https://contextualscience.org/about_act" target="_blank" rel="noopener noreferrer">Association for Contextual Behavioral Science「About ACT」</a></p>
          </div>
        </details>
        <p>書かない、途中でやめる、表紙へ戻ることも選べます。</p>
        ${work.modalNote ? `<p class="modal-note">${work.modalNote}</p>` : ''}
      </div>
      <div class="modal-actions">
        <button class="btn btn-ghost" id="confirm-cancel">表紙に戻る</button>
        <button class="btn btn-primary" id="confirm-start">このワークを始める</button>
      </div>
    </div>
  `;

  const close = openModal({
    overlay,
    initialFocus: overlay.querySelector('#confirm-cancel'),
  });

  overlay.querySelector('#confirm-cancel').addEventListener('click', () => close());
  overlay.querySelector('#confirm-start').addEventListener('click', () => {
    close({ restoreFocus: false });
    navigate(`work/${work.id}`);
  });

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });
}

/* ===== ワークビュー ===== */

function renderWork(workId) {
  const work = WORKS.find(w => w.id === workId);
  if (!work) {
    navigate('home');
    return;
  }

  const app = document.getElementById('app');
  const profile = loadProfile();
  app.innerHTML = `
    <div class="work-view-full">
      <div class="work-topbar">
        <div class="work-topbar-inner">
          <button class="btn-back" id="back-to-home" aria-label="表紙に戻る">
            <span aria-hidden="true">←</span>
            <span>表紙に戻る</span>
          </button>
          <span class="work-title-bar">
            <span>${work.workName}</span>
            <button class="work-safety-link" id="work-safety-guide">安全と使い方</button>
          </span>
          <button class="btn-finish-work" id="finish-work" aria-label="今日はここまで" title="今日はここまで">
            <span aria-hidden="true">☕</span>
            <span>ここまで</span>
          </button>
        </div>
      </div>
      <div class="work-frame-wrap">
        <iframe id="work-frame" src="./works/${work.file}" title="${work.workName}" allow="fullscreen; clipboard-write"></iframe>
      </div>
    </div>
  `;

  const iframe = document.getElementById('work-frame');
  iframe.addEventListener('load', () => {
    iframe.contentWindow?.postMessage({
      type: 'mental-care-profile',
      profile,
    }, window.location.origin);
  });

  document.getElementById('back-to-home').addEventListener('click', () => {
    navigate('home');
  });

  document.getElementById('work-safety-guide').addEventListener('click', () => showSafetyGuide(work));
  document.getElementById('finish-work').addEventListener('click', () => showFinishConfirm(work.id));
}

/* ===== ルーター ===== */

function router() {
  if (activeModalCleanup) activeModalCleanup({ restoreFocus: false });
  clearFinishFallback();
  pendingFinishWorkId = null;
  const route = getCurrentRoute();

  if (route === 'home') {
    renderHome();
  } else if (route.startsWith('work/')) {
    const workId = parseInt(route.split('/')[1], 10);
    renderWork(workId);
  } else {
    navigate('home');
  }
}

/* ===== 初期化 ===== */

window.addEventListener('hashchange', router);
router();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((err) => {
      console.warn('Service Worker の登録に失敗しました', err);
    });
  });
}
