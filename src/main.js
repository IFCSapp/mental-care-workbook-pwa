/* ===== こころの立て直しワークブック — メインアプリ ===== */

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
];

const PROFILE_STORAGE_KEY = 'mentalCareWorkbookProfile';
const FULL_BACKUP_META = { app: 'mental-care-workbook', scope: 'full-workbook', schemaVersion: 1 };
const WORK_STORAGE_KEYS = [
  PROFILE_STORAGE_KEY,
  'worksheet_auto_save_v1',
  'dots_work_state_v3',
  'dots_work_state_v2',
  'act_worksheet_standalone_data',
  'control_map_state_v1',
];


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

function collectWorkbookBackup() {
  const entries = {};
  WORK_STORAGE_KEYS.forEach((key) => {
    const value = localStorage.getItem(key);
    if (value !== null) entries[key] = value;
  });
  return {
    _workbookBackup: FULL_BACKUP_META,
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
    && meta?.schemaVersion === FULL_BACKUP_META.schemaVersion
    && parsed?.storage
    && typeof parsed.storage === 'object';
}

function importFullBackupFile(file) {
  const reader = new FileReader();
  reader.onload = (event) => {
    try {
      const parsed = JSON.parse(event.target.result);
      if (!isValidFullBackup(parsed)) {
        window.alert('このワークブックで保存した全体バックアップファイルを選んでください。');
        return;
      }
      Object.entries(parsed.storage).forEach(([key, value]) => {
        if (WORK_STORAGE_KEYS.includes(key) && typeof value === 'string') {
          localStorage.setItem(key, value);
        }
      });
      window.alert('全体バックアップを読み込みました。表紙を開き直します。');
      navigate('home');
      router();
    } catch (err) {
      console.warn('全体バックアップの読み込みに失敗しました', err);
      window.alert('全体バックアップを読み込めませんでした。');
    }
  };
  reader.readAsText(file, 'UTF-8');
}

/* ===== ルーティング ===== */

function navigate(hash) {
  window.location.hash = hash;
}

let finishFallbackTimer = null;

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

function showFinishConfirm() {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal-content modal-content-finish" role="dialog" aria-modal="true" aria-labelledby="finish-title">
      <span class="modal-icon" aria-hidden="true">☕</span>
      <p class="modal-heading" id="finish-title">今日はここまでにしますか？</p>
      <div class="modal-body">
        <p>入力内容は、この端末に保存されます。</p>
        <p>ここで終えても大丈夫です。続きは、また余裕のあるときに開けます。</p>
      </div>
      <div class="modal-actions">
        <button class="btn btn-ghost" id="finish-cancel">続ける</button>
        <button class="btn btn-primary" id="finish-confirm">ここまでにする</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  function close() {
    overlay.remove();
  }

  document.getElementById('finish-cancel').addEventListener('click', close);
  document.getElementById('finish-confirm').addEventListener('click', () => {
    close();
    requestCurrentWorkFinish();
  });
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });
}

function requestCurrentWorkFinish() {
  const iframe = document.getElementById('work-frame');
  clearFinishFallback();

  if (iframe?.contentWindow) {
    iframe.contentWindow.postMessage({ type: 'mental-care-finish' }, window.location.origin);
    finishFallbackTimer = setTimeout(() => {
      returnHomeAfterFinish();
    }, 900);
  } else {
    returnHomeAfterFinish();
  }
}

window.addEventListener('message', (event) => {
  if (event.origin !== window.location.origin) return;
  if (event.data?.type !== 'mental-care-finish-complete') return;
  returnHomeAfterFinish();
});

function getCurrentRoute() {
  const hash = window.location.hash.replace(/^#\/?/, '') || 'home';
  return hash;
}

/* ===== ビューレンダリング ===== */

function renderHome() {
  const app = document.getElementById('app');
  const profile = loadProfile();
  app.innerHTML = `
    <div class="app-header">
      <h1>🌱 こころの立て直しワークブック</h1>
      <p>ようこそ。あなたのペースで使ってください。</p>
    </div>
    <section class="cover-card" aria-labelledby="cover-title">
      <div>
        <h2 id="cover-title">表紙</h2>
        <p>名前を入れておくと、対応しているワークの名前欄に反映されます。</p>
      </div>
      <label class="cover-field" for="cover-name">
        <span>名前</span>
        <input id="cover-name" type="text" value="${escapeHtml(profile.name)}" autocomplete="name" placeholder="名前を入力">
      </label>
    </section>
    <section class="backup-card" aria-labelledby="backup-title">
      <div>
        <h2 id="backup-title">全体バックアップ</h2>
        <p>表紙と各ワークの入力内容を、ひとつのファイルとして保存・読み込みします。</p>
      </div>
      <div class="backup-actions">
        <button class="btn btn-primary" id="export-full-backup">全体バックアップを保存</button>
        <label class="btn btn-ghost backup-import-label">バックアップを読み込んで続ける
          <input id="import-full-backup" type="file" accept=".json,application/json" hidden>
        </label>
      </div>
    </section>
    <div class="work-grid">
      ${WORKS.map((w) => `
        <button class="work-card" data-work-id="${w.id}">
          <span class="work-card-label">${w.label}</span>
          <span class="work-card-subtitle">${w.legacyName}</span>
          <span class="work-card-desc">${w.desc}</span>
        </button>`).join('')}
    </div>
    <div class="app-footer">
      <p>このワークブックは、あなたを評価するためのものではありません。<br>空欄のままでも、途中でやめても大丈夫です。<br>書いた内容はこの端末の中だけに残ります。</p>
    </div>
  `;

  const nameInput = document.getElementById('cover-name');
  nameInput.addEventListener('input', () => {
    saveProfile({ name: nameInput.value.trim() });
  });

  document.getElementById('export-full-backup').addEventListener('click', exportFullBackup);
  document.getElementById('import-full-backup').addEventListener('change', (event) => {
    const file = event.target.files?.[0];
    if (file) importFullBackupFile(file);
    event.target.value = '';
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
  overlay.innerHTML = `
    <div class="modal-content">
      <span class="modal-icon">🌱</span>
      <p class="modal-heading">「${work.workName}」</p>
      <p class="modal-subtitle">${work.legacyName}</p>
      <div class="modal-body">
        <p>書けるところだけ書いてみてください。</p>
        <p>合わないと思ったら、遠慮なく途中でやめて大丈夫です。</p>
        <p>書いた内容はこの端末の中だけに残ります。</p>
        ${work.modalNote ? `<p class="modal-note">${work.modalNote}</p>` : ''}
      </div>
      <div class="modal-actions">
        <button class="btn btn-ghost" id="confirm-cancel">やめる</button>
        <button class="btn btn-primary" id="confirm-start">はじめる</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  function close() {
    overlay.remove();
  }

  document.getElementById('confirm-cancel').addEventListener('click', close);
  document.getElementById('confirm-start').addEventListener('click', () => {
    close();
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
            <small>${work.legacyName}</small>
          </span>
          <button class="btn-finish-work" id="finish-work" aria-label="今日はここまで" title="今日はここまで">
            <span aria-hidden="true">☕</span>
            <span>ここまで</span>
          </button>
        </div>
      </div>
      <div class="work-frame-wrap">
        <iframe id="work-frame" src="./works/${work.file}" title="${work.workName}" allow="fullscreen; clipboard-write" sandbox="allow-scripts allow-same-origin allow-forms allow-downloads allow-modals"></iframe>
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

  document.getElementById('finish-work').addEventListener('click', showFinishConfirm);
}

/* ===== ルーター ===== */

function router() {
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
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.warn('Service Worker の登録に失敗しました', err);
    });
  });
}
