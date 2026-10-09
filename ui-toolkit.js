// Name: UIツールキット
// ID: uitoolkit
// Description: ステージ上にUI部品（ボタン・入力欄・タブ・ウィンドウ等）、通知、ダイアログを作成。変数連動・アニメーション・レイアウト保存に対応。
// License: MIT

(function (Scratch) {
  'use strict';

  if (!Scratch.extensions.unsandboxed) {
    throw new Error('「UIツールキット」はサンドボックス外（Unsandboxed）で読み込む必要があります。');
  }

  const { BlockType: BT, ArgumentType: AT, Cast } = Scratch;
  const runtime = Scratch.vm.runtime;
  const EXT = 'uitoolkit';
  const HAT_EVENT = EXT + '_whenEvent';
  const HAT_ANY = EXT + '_whenAnyEvent';

  /* === 割と色々やるユーティリティ === */

  const str = (v) => Cast.toString(v);
  const num = (v, d = 0) => {
    const n = Cast.toNumber(v);
    return Number.isFinite(n) ? n : d;
  };
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const items = (pairs) => pairs.map(([text, value]) => ({ text, value }));

  const el = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  };

  // A,B,C / 改行 / JSON配列 のいずれも受け付けます。
  const parseList = (v) => {
    const s = str(v).trim();
    if (!s) return [];
    if (s[0] === '[') {
      try {
        const a = JSON.parse(s);
        if (Array.isArray(a)) return a.map(String);
      } catch (e) { /* 通常の区切りとして処理します */ }
    }
    return s.split(/[,\n]/).map((x) => x.trim()).filter(Boolean);
  };

  // 文字列中の「\n」を改行に変換
  const nl = (v) => str(v).replace(/\\n/g, '\n');
  // CSS内の url() を無効化
  const safeCss = (v) => str(v).replace(/url\s*\(/gi, 'blocked(');

  const TEXTY = new Set(['input', 'textarea', 'number', 'color']);
  const OPTION_TYPES = new Set(['dropdown', 'list', 'radio', 'tabs']);

  // ショートカットキー表記の正規化
  const KEY_ALIAS = {
    esc: 'escape', return: 'enter', spacebar: 'space', cmd: 'ctrl', command: 'ctrl', meta: 'ctrl',
    control: 'ctrl', del: 'delete', up: 'arrowup', down: 'arrowdown', left: 'arrowleft', right: 'arrowright'
  };

  const normKey = (v) => {
    const parts = str(v).toLowerCase().split('+').map((x) => x.trim()).filter(Boolean).map((x) => KEY_ALIAS[x] || x);
    const mods = ['ctrl', 'alt', 'shift'].filter((m) => parts.includes(m));
    const key = parts.find((p) => !['ctrl', 'alt', 'shift'].includes(p)) || '';
    return key ? [...mods, key].join('+') : '';
  };

  const eventKey = (e) => {
    const mods = [(e.ctrlKey || e.metaKey) && 'ctrl', e.altKey && 'alt', e.shiftKey && 'shift'].filter(Boolean);
    let k = String(e.key).toLowerCase();
    if (k === ' ') k = 'space';
    return [...mods, KEY_ALIAS[k] || k].join('+');
  };

  // 背景色に対して読みやすい文字色（黒/白）を返す
  const onColor = (c) => {
    const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(str(c).trim());
    if (!m) return '#ffffff';
    let h = m[1];
    if (h.length === 3) h = [...h].map((x) => x + x).join('');
    const [r, g, b] = [0, 2, 4]
      .map((i) => parseInt(h.substr(i, 2), 16) / 255)
      .map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.5 ? '#111827' : '#ffffff';
  };

  /* === テーマとかCSS === */

  const PALETTE = {
    light: { bg: '#ffffff', text: '#1f2430', shadow: 'rgba(15,23,42,.20)' },
    dark: { bg: '#1e2230', text: '#eef0f6', shadow: 'rgba(0,0,0,.55)' }
  };

  const DEFAULTS = {
    accent: '#3b82f6',
    radius: 10,
    fontSize: 14,
    font: 'system-ui,-apple-system,"Segoe UI","Hiragino Sans","Noto Sans JP","Yu Gothic UI",Meiryo,sans-serif'
  };

  const CSS = `
.uitk,.uitk *{box-sizing:border-box}
.uitk{--ui-surface:color-mix(in srgb,var(--ui-bg) 94%,var(--ui-text));--ui-border:color-mix(in srgb,var(--ui-bg) 80%,var(--ui-text));
position:absolute;left:0;top:0;width:100%;height:100%;overflow:hidden;isolation:isolate;pointer-events:none;
color:var(--ui-text);font-family:var(--ui-font);font-size:var(--ui-font-size);line-height:1.45;-webkit-user-select:none;user-select:none}
.uitk [hidden]{display:none!important}
.uitk-layer,.uitk-modals,.uitk-ts{position:absolute;inset:0;pointer-events:none}
.uitk-layer{z-index:1}.uitk-modals{z-index:2}
.uitk-ts{z-index:3;inset:12px;display:flex;flex-direction:column;gap:8px}
.uitk-ts[data-pos^="top"]{justify-content:flex-start}
.uitk-ts[data-pos^="bottom"]{justify-content:flex-end}
.uitk-ts[data-pos$="left"]{align-items:flex-start}
.uitk-ts[data-pos$="center"]{align-items:center}
.uitk-ts[data-pos$="right"]{align-items:flex-end}
.uitk-w{pointer-events:auto}
.uitk .uitk-top{position:absolute;max-width:100%}
:where(.uitk-top){width:max-content}
.uitk-disabled{opacity:.5}

.uitk-btn{font:inherit;font-weight:600;color:var(--ui-on-accent);background:var(--ui-accent);border:1px solid transparent;
border-radius:var(--ui-radius);padding:.55em 1.1em;cursor:pointer;transition:filter .12s,transform .06s}
.uitk-btn:hover{filter:brightness(1.08)}
.uitk-btn:active{transform:scale(.97)}
.uitk-btn.ghost{color:var(--ui-text);background:var(--ui-surface);border-color:var(--ui-border)}
.uitk-btn.ghost:hover{border-color:var(--ui-accent);filter:none}
.uitk-btn:focus-visible,.uitk-in:focus,.uitk-sw input:focus-visible+.trk{outline:none;box-shadow:0 0 0 3px color-mix(in srgb,var(--ui-accent) 35%,transparent)}
.uitk-label{white-space:pre-wrap}
.uitk-in{font:inherit;color:var(--ui-text);background:var(--ui-bg);border:1px solid var(--ui-border);
border-radius:var(--ui-radius);padding:.5em .75em;width:180px;-webkit-user-select:text;user-select:text}
.uitk-in:focus{border-color:var(--ui-accent)}
textarea.uitk-in{resize:both;min-height:3em}
.uitk-ck,.uitk-sw{display:inline-flex;align-items:center;gap:.6em;cursor:pointer}
.uitk-ck input{width:1.15em;height:1.15em;margin:0;accent-color:var(--ui-accent)}
.uitk-sw input{position:absolute;opacity:0;width:0;height:0;margin:0}
.uitk-sw .trk{position:relative;flex:none;width:2.6em;height:1.45em;border-radius:99px;background:var(--ui-border);transition:background .15s}
.uitk-sw .trk::after{content:"";position:absolute;left:.15em;top:.15em;width:1.15em;height:1.15em;border-radius:50%;background:#fff;
box-shadow:0 1px 2px var(--ui-shadow);transition:transform .15s}
.uitk-sw input:checked+.trk{background:var(--ui-accent)}
.uitk-sw input:checked+.trk::after{transform:translateX(1.15em)}
.uitk-sl{width:200px}
.uitk-sl .hd{display:flex;justify-content:space-between;gap:1em;margin-bottom:.2em}
.uitk-sl .hd:has(span:empty):not(:has(b:empty)){justify-content:flex-end}
.uitk-sl input{display:block;width:100%;margin:0;accent-color:var(--ui-accent)}
.uitk-sl b{color:var(--ui-accent)}
.uitk-pg{position:relative;width:200px;height:1.5em;overflow:hidden;background:var(--ui-surface);border:1px solid var(--ui-border);border-radius:99px}
.uitk-pg i{display:block;height:100%;width:0;background:var(--ui-accent);transition:width .25s}
.uitk-pg span{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:.85em;font-weight:700;
text-shadow:0 0 3px var(--ui-bg),0 0 3px var(--ui-bg)}
.uitk-img{display:block;max-width:100%;max-height:100%;-webkit-user-drag:none}
.uitk-panel{display:flex;flex-direction:column;gap:8px;padding:12px;background:var(--ui-surface);border:1px solid var(--ui-border);border-radius:var(--ui-radius)}
.uitk-panel.row{flex-direction:row;align-items:center}
.uitk-win{display:flex;flex-direction:column;min-width:220px;max-height:100%;background:var(--ui-bg);border:1px solid var(--ui-border);
border-radius:calc(var(--ui-radius) + 2px);box-shadow:0 10px 30px var(--ui-shadow);overflow:hidden}
.uitk-win-h{display:flex;align-items:center;gap:8px;padding:.55em .8em;background:var(--ui-surface);border-bottom:1px solid var(--ui-border);
font-weight:700;cursor:move;touch-action:none}
.uitk-win-h b{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.uitk-x{font:inherit;color:inherit;opacity:.6;background:none;border:0;border-radius:6px;padding:0 .45em;cursor:pointer}
.uitk-x:hover{opacity:1;background:var(--ui-border)}
.uitk-win-b{display:flex;flex-direction:column;gap:8px;flex:1;padding:12px;overflow:auto}

.uitk-bd{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;padding:16px;
background:rgba(10,14,25,.45);pointer-events:auto;animation:uitk-fade .15s}
.uitk-dlg{display:flex;flex-direction:column;gap:12px;min-width:260px;max-width:92%;max-height:92%;overflow:auto;padding:18px;
background:var(--ui-bg);border:1px solid var(--ui-border);border-radius:calc(var(--ui-radius) + 4px);
box-shadow:0 18px 50px var(--ui-shadow);animation:uitk-pop .16s}
.uitk-dlg h3{margin:0;font-size:1.15em}
.uitk-dlg p{margin:0;white-space:pre-wrap;line-height:1.5}
.uitk-acts{display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap}
.uitk-list{display:flex;flex-direction:column;gap:6px}

.uitk-t{--c:var(--ui-accent);pointer-events:auto;cursor:pointer;display:flex;gap:.6em;align-items:flex-start;max-width:80%;
padding:.65em .95em;background:var(--ui-bg);color:var(--ui-text);border:1px solid var(--ui-border);border-left:4px solid var(--c);
border-radius:var(--ui-radius);box-shadow:0 6px 20px var(--ui-shadow);white-space:pre-wrap;animation:uitk-in .2s;
transition:opacity .2s,transform .2s}
.uitk-t.out{opacity:0;transform:translateY(-6px)}
.uitk-t i{font-style:normal;font-weight:800;color:var(--c)}
.t-success{--c:#22a45d}.t-warning{--c:#e0a100}.t-error{--c:#e5484d}
select.uitk-in[size]{height:auto;padding:.25em;overflow:auto}
select.uitk-in[size] option{padding:.35em .6em;border-radius:calc(var(--ui-radius) - 3px)}
select.uitk-in[size] option:checked{background-color:var(--ui-accent);color:var(--ui-on-accent)}
input.uitk-color{width:3.6em;height:2.4em;padding:2px;cursor:pointer}
.uitk-grp{display:flex;flex-direction:column;gap:.4em}
.uitk-grp label{display:inline-flex;align-items:center;gap:.5em;cursor:pointer}
.uitk-grp input{width:1.1em;height:1.1em;margin:0;accent-color:var(--ui-accent)}
.uitk-tabs{display:flex;gap:2px;border-bottom:2px solid var(--ui-border)}
.uitk-tabs button{font:inherit;color:inherit;opacity:.65;background:none;border:0;border-bottom:2px solid transparent;margin-bottom:-2px;padding:.5em 1em;cursor:pointer}
.uitk-tabs button:hover{opacity:1}
.uitk-tabs button[aria-selected="true"]{opacity:1;font-weight:700;color:var(--ui-accent);border-bottom-color:var(--ui-accent)}
.uitk-tabs button:focus-visible{outline:none;box-shadow:0 0 0 3px color-mix(in srgb,var(--ui-accent) 35%,transparent)}
.uitk-load{display:flex;flex-direction:column;align-items:center;gap:12px;padding:20px 28px;background:var(--ui-bg);border:1px solid var(--ui-border);
border-radius:calc(var(--ui-radius) + 4px);box-shadow:0 18px 50px var(--ui-shadow);white-space:pre-wrap;text-align:center}
.uitk-load div:empty{display:none}
.uitk-spin{width:2.4em;height:2.4em;border-radius:50%;border:3px solid color-mix(in srgb,var(--ui-text) 20%,transparent);
border-top-color:var(--ui-accent);animation:uitk-rot .8s linear infinite}
@keyframes uitk-rot{to{transform:rotate(360deg)}}
@keyframes uitk-fade{from{opacity:0}}
@keyframes uitk-pop{from{opacity:0;transform:translateY(8px) scale(.97)}}
@keyframes uitk-in{from{opacity:0;transform:translateY(-8px)}}
@media (prefers-reduced-motion:reduce){.uitk *{animation:none!important;transition:none!important}}
`;

  const ICON = 'data:image/svg+xml;utf8,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40">' +
    '<rect x="4" y="9" width="32" height="22" rx="6" fill="#3b82f6"/>' +
    '<rect x="9" y="15" width="14" height="4" rx="2" fill="#fff"/>' +
    '<rect x="9" y="22" width="22" height="3" rx="1.5" fill="#fff" opacity=".7"/></svg>');

  /* === メニュー定義 ===*/

  const MENUS = {
    theme: items([['ライト', 'light'], ['ダーク', 'dark'], ['自動（OSの設定に合わせる）', 'auto']]),
    themeProp: items([
      ['アクセント色', 'accent'], ['背景色', 'bg'], ['文字色', 'text'],
      ['文字サイズ(px)', 'fontSize'], ['角丸(px)', 'radius'], ['フォント', 'font']
    ]),
    onOff: items([['オン', 'on'], ['オフ', 'off']]),
    toastType: items([['情報', 'info'], ['成功', 'success'], ['警告', 'warning'], ['エラー', 'error']]),
    toastPos: items([
      ['左上', 'top-left'], ['上中央', 'top-center'], ['右上', 'top-right'],
      ['左下', 'bottom-left'], ['下中央', 'bottom-center'], ['右下', 'bottom-right']
    ]),
    widgetType: items([
      ['ボタン', 'button'], ['ラベル', 'label'], ['入力欄', 'input'], ['複数行入力欄', 'textarea'],
      ['チェックボックス', 'checkbox'], ['スイッチ', 'switch'], ['スライダー', 'slider'],
      ['ドロップダウン', 'dropdown'], ['リスト', 'list'], ['ラジオボタン', 'radio'], ['タブ', 'tabs'],
      ['数値入力欄', 'number'], ['色選択', 'color'], ['プログレスバー', 'progress'], ['画像', 'image'],
      ['パネル（縦並び）', 'panel'], ['パネル（横並び）', 'row'], ['ウィンドウ', 'window']
    ]),
    styleProp: items([
      ['文字色', 'color'], ['背景色', 'background'], ['アクセント色', 'accent'], ['枠線色', 'borderColor'],
      ['文字サイズ(px)', 'fontSize'], ['角丸(px)', 'radius'], ['不透明度(0-100)', 'opacity'],
      ['余白(px)', 'padding'], ['文字揃え(left/center/right)', 'align'],
      ['ツールチップ', 'tooltip'], ['プレースホルダー', 'placeholder'],
      ['入力タイプ(text/password/email/tel/url/search)', 'inputType'], ['最大文字数', 'maxlength'],
      ['内側の間隔(px)', 'gap'], ['並び方(start/center/end/between)', 'justify']
    ]),
    state: items([
      ['表示する', 'show'], ['非表示にする', 'hide'], ['表示を切り替える', 'toggle'],
      ['有効にする', 'enable'], ['無効にする', 'disable'],
      ['最前面に出す', 'front'], ['最背面に送る', 'back'], ['フォーカスする', 'focus']
    ]),
    attr: items([
      ['テキスト', 'text'], ['選択中の番号', 'index'], ['x座標', 'x'], ['y座標', 'y'],
      ['幅', 'width'], ['高さ', 'height'], ['表示中か', 'visible'], ['有効か', 'enabled'],
      ['種類', 'type'], ['親のID', 'parent'], ['選択肢の数', 'count'], ['固定位置', 'anchor'], ['マウスが乗っているか', 'hover']
    ]),
    evt: items([
      ['クリック', 'click'], ['ダブルクリック', 'dblclick'], ['値の確定', 'change'], ['入力中', 'input'],
      ['Enterキー', 'enter'], ['マウスが乗った', 'hover'], ['フォーカス取得', 'focus'], ['フォーカス喪失', 'blur'], ['閉じる', 'close']
    ]),
    anim: items([
      ['フェードイン', 'fadeIn'], ['フェードアウト（終了後に非表示）', 'fadeOut'], ['ポップ（拡大しながら出現）', 'pop'],
      ['下からスライドイン', 'slideUp'], ['上からスライドイン', 'slideDown'],
      ['バウンス', 'bounce'], ['シェイク', 'shake'], ['パルス', 'pulse']
    ]),
    anchor: items([
      ['中央', 'center'], ['左上', 'top-left'], ['上', 'top'], ['右上', 'top-right'], ['左', 'left'],
      ['右', 'right'], ['左下', 'bottom-left'], ['下', 'bottom'], ['右下', 'bottom-right']
    ]),
    preset: items([
      ['ブルー', '#3b82f6'], ['インディゴ', '#6366f1'], ['パープル', '#a855f7'], ['ピンク', '#ec4899'], ['レッド', '#e5484d'],
      ['オレンジ', '#f97316'], ['イエロー', '#eab308'], ['グリーン', '#22a45d'], ['ティール', '#14b8a6'], ['グレー', '#64748b']
    ]),
    loading: items([['表示', 'show'], ['非表示', 'hide']])
  };

  /* === 拡張機能の本体 === */

  class UIToolkit {
    constructor() {
      this.widgets = new Map();
      this.root = null;
      this.mode = 'light';
      this.overrides = {};
      this.toastPos = 'top-right';
      this.labels = { ok: 'OK', cancel: 'キャンセル' };
      this.autoClean = true;
      this.events = new Map();
      this.tok = 0;
      this.waiters = [];
      this.lastWaitTimedOut_ = false;
      this.shortcuts = new Map();
      this.bound = new Set();
      this.poll = 0;
      this.uid = 0;
      this.loadEl = null;
      this.hoverUI = false;
      this.last = { id: '', kind: '', value: '' };
      this.queue = Promise.resolve();
      this.gen = 0;
      this.activeClose = null;
      this.lastDialog = { canceled: false, index: 0 };
      this.zTop = 0;
      this.zBot = 0;

      runtime.on('PROJECT_STOP_ALL', () => { if (this.autoClean) this.cleanup(); });

      // イベントは1フレームだけ有効（ハットブロックの暴発防止のため）
      runtime.on('AFTER_EXECUTE', () => {
        this.events.clear();
        this.pullBindings();
      });
    }

    getInfo() {
      const id = (d = 'ui1') => ({ type: AT.STRING, defaultValue: d });
      const s = (d) => ({ type: AT.STRING, defaultValue: d });
      const n = (d) => ({ type: AT.NUMBER, defaultValue: d });
      const m = (menu, d) => ({ type: AT.STRING, menu, defaultValue: d });
      const label = (text) => ({ blockType: BT.LABEL, text });
      const menus = {};

      for (const k of Object.keys(MENUS)) {
        menus[k] = { acceptReporters: true, items: MENUS[k] };
      }

      menus.variables = { acceptReporters: true, items: 'variableMenu' };

      return {
        id: EXT,
        name: 'UIツールキット',
        color1: '#3b82f6',
        color2: '#2563eb',
        color3: '#1d4ed8',
        menuIconURI: ICON,
        blocks: [
          label('テーマ'),
          { opcode: 'setTheme', blockType: BT.COMMAND, text: 'テーマを [THEME] にする', arguments: { THEME: m('theme', 'light') } },
          { opcode: 'setAccent', blockType: BT.COMMAND, text: 'アクセント色を [COLOR] にする', arguments: { COLOR: { type: AT.COLOR, defaultValue: '#3b82f6' } } },
          { opcode: 'setPreset', blockType: BT.COMMAND, text: 'カラープリセット [PRESET] を適用', arguments: { PRESET: m('preset', '#3b82f6') } },
          { opcode: 'setThemeProp', blockType: BT.COMMAND, text: 'テーマの [PROP] を [VALUE] にする（空欄で初期値）', arguments: { PROP: m('themeProp', 'radius'), VALUE: s('10') } },
          { opcode: 'resetTheme', blockType: BT.COMMAND, text: 'テーマを初期状態に戻す' },
          { opcode: 'setAutoClean', blockType: BT.COMMAND, text: '停止ボタンでUIを消す: [ONOFF]', arguments: { ONOFF: m('onOff', 'on') } },

          label('通知（トースト）'),
          { opcode: 'toast', blockType: BT.COMMAND, text: '通知 [TEXT] を表示 種類 [TYPE] 秒数 [SEC]（0で消えない）', arguments: { TEXT: s('保存しました'), TYPE: m('toastType', 'success'), SEC: n(3) } },
          { opcode: 'setToastPos', blockType: BT.COMMAND, text: '通知の表示位置を [POS] にする', arguments: { POS: m('toastPos', 'top-right') } },
          { opcode: 'clearToasts', blockType: BT.COMMAND, text: 'すべての通知を消す' },

          label('ダイアログ'),
          { opcode: 'alertDialog', blockType: BT.COMMAND, text: 'アラート タイトル [TITLE] 本文 [TEXT] を表示して待つ', arguments: { TITLE: s('お知らせ'), TEXT: s('ゲームをクリアしました！') } },
          { opcode: 'confirmDialog', blockType: BT.BOOLEAN, text: '確認 タイトル [TITLE] 本文 [TEXT]', arguments: { TITLE: s('確認'), TEXT: s('本当に削除しますか？') } },
          { opcode: 'promptDialog', blockType: BT.REPORTER, text: '入力ダイアログ タイトル [TITLE] 本文 [TEXT] 初期値 [DEFAULT]', arguments: { TITLE: s('名前の入力'), TEXT: s('名前を入力してください'), DEFAULT: s('') } },
          { opcode: 'choiceDialog', blockType: BT.REPORTER, text: '選択ダイアログ タイトル [TITLE] 本文 [TEXT] 選択肢 [OPTIONS]', arguments: { TITLE: s('難易度'), TEXT: s('選んでください'), OPTIONS: s('かんたん,ふつう,むずかしい') } },
          { opcode: 'dialogCanceled', blockType: BT.BOOLEAN, text: '直前のダイアログはキャンセルされた' },
          { opcode: 'dialogIndex', blockType: BT.REPORTER, text: '直前の選択ダイアログの番号' },
          { opcode: 'setDialogLabels', blockType: BT.COMMAND, text: 'ダイアログのボタン名を OK [OK] キャンセル [CANCEL] にする', arguments: { OK: s('OK'), CANCEL: s('キャンセル') } },

          { opcode: 'loading', blockType: BT.COMMAND, text: 'ローディング [STATE] テキスト [TEXT]', arguments: { STATE: m('loading', 'show'), TEXT: s('読み込み中…') } },

          label('UI部品の作成と削除'),
          { opcode: 'createWidget', blockType: BT.COMMAND, text: '[TYPE] [ID] を作成 テキスト [TEXT] x [X] y [Y]', arguments: { TYPE: m('widgetType', 'button'), ID: id('btn1'), TEXT: s('ボタン'), X: n(0), Y: n(0) } },
          { opcode: 'removeWidget', blockType: BT.COMMAND, text: '[ID] を削除', arguments: { ID: id('btn1') } },
          { opcode: 'removeAll', blockType: BT.COMMAND, text: 'すべてのUI部品を削除' },
          { opcode: 'setParent', blockType: BT.COMMAND, text: '[ID] を [PARENT] の中に入れる（空欄で解除）', arguments: { ID: id('btn1'), PARENT: id('panel1') } },

          label('内容・見た目の設定'),
          { opcode: 'setText', blockType: BT.COMMAND, text: '[ID] のテキストを [TEXT] にする', arguments: { ID: id('btn1'), TEXT: s('こんにちは') } },
          { opcode: 'setValue', blockType: BT.COMMAND, text: '[ID] の値を [VALUE] にする', arguments: { ID: id('slider1'), VALUE: s('50') } },
          { opcode: 'setOptions', blockType: BT.COMMAND, text: '[ID] の選択肢を [OPTIONS] にする', arguments: { ID: id('select1'), OPTIONS: s('りんご,みかん,ぶどう') } },
          { opcode: 'setRange', blockType: BT.COMMAND, text: '[ID] の範囲を 最小 [MIN] 最大 [MAX] 刻み [STEP] にする', arguments: { ID: id('slider1'), MIN: n(0), MAX: n(100), STEP: n(1) } },
          { opcode: 'moveTo', blockType: BT.COMMAND, text: '[ID] を x [X] y [Y] に移動', arguments: { ID: id('btn1'), X: n(0), Y: n(0) } },
          { opcode: 'moveBy', blockType: BT.COMMAND, text: '[ID] を x [X] y [Y] だけ動かす', arguments: { ID: id('btn1'), X: n(10), Y: n(0) } },
          { opcode: 'anchorTo', blockType: BT.COMMAND, text: '[ID] を [ANCHOR] に固定 余白 [M] px（x,yは固定位置からのずれ）', arguments: { ID: id('btn1'), ANCHOR: m('anchor', 'top-left'), M: n(16) } },
          { opcode: 'setSize', blockType: BT.COMMAND, text: '[ID] のサイズを 幅 [W] 高さ [H] にする（0で自動）', arguments: { ID: id('btn1'), W: n(0), H: n(0) } },
          { opcode: 'setStyle', blockType: BT.COMMAND, text: '[ID] の [PROP] を [VALUE] にする', arguments: { ID: id('btn1'), PROP: m('styleProp', 'accent'), VALUE: s('#e5484d') } },
          { opcode: 'setCSS', blockType: BT.COMMAND, text: '[ID] にCSS [CSS] を追加', arguments: { ID: id('btn1'), CSS: s('font-weight:bold') } },
          { opcode: 'setState', blockType: BT.COMMAND, text: '[ID] を [STATE]', arguments: { ID: id('btn1'), STATE: m('state', 'hide') } },

          { opcode: 'animate', blockType: BT.COMMAND, text: '[ID] に [ANIM] アニメーション 時間 [SEC] 秒', arguments: { ID: id('btn1'), ANIM: m('anim', 'pop'), SEC: n(0.4) } },
          { opcode: 'animateWait', blockType: BT.COMMAND, text: '[ID] に [ANIM] アニメーションをつけて待つ 時間 [SEC] 秒', arguments: { ID: id('btn1'), ANIM: m('anim', 'bounce'), SEC: n(0.4) } },

          label('連携・操作'),
          { opcode: 'bindVariable', blockType: BT.COMMAND, text: '[ID] を変数 [VAR] と連動させる（空欄で解除）', arguments: { ID: id('slider1'), VAR: m('variables', '') } },
          { opcode: 'setShortcut', blockType: BT.COMMAND, text: '[ID] にショートカットキー [KEY] を割り当てる（空欄で解除）', arguments: { ID: id('btn1'), KEY: s('ctrl+s') } },

          label('イベント'),
          { opcode: 'whenEvent', blockType: BT.HAT, isEdgeActivated: false, text: '[ID] の [EVT] が起きたとき', arguments: { ID: id('btn1'), EVT: m('evt', 'click') } },
          { opcode: 'whenAnyEvent', blockType: BT.HAT, isEdgeActivated: false, text: 'いずれかのUI部品が操作されたとき' },
          { opcode: 'lastId', blockType: BT.REPORTER, text: '最後に操作されたUIのID' },
          { opcode: 'lastEvent', blockType: BT.REPORTER, text: '最後の操作の種類' },
          { opcode: 'lastValue', blockType: BT.REPORTER, text: '最後に操作されたUIの値' },

          { opcode: 'waitEvent', blockType: BT.COMMAND, text: '[ID] の [EVT] を待つ（最大 [SEC] 秒・0で無制限）', arguments: { ID: id('btn1'), EVT: m('evt', 'click'), SEC: n(0) } },
          { opcode: 'lastWaitTimedOut', blockType: BT.BOOLEAN, text: '直前の待機はタイムアウトした' },

          label('値の取得'),
          { opcode: 'getValue', blockType: BT.REPORTER, text: '[ID] の値', arguments: { ID: id('slider1') } },
          { opcode: 'getAttr', blockType: BT.REPORTER, text: '[ID] の [ATTR]', arguments: { ID: id('btn1'), ATTR: m('attr', 'text') } },
          { opcode: 'isChecked', blockType: BT.BOOLEAN, text: '[ID] はオン（チェック済み）', arguments: { ID: id('check1') } },
          { opcode: 'exists', blockType: BT.BOOLEAN, text: '[ID] は存在する', arguments: { ID: id('btn1') } },
          { opcode: 'listIds', blockType: BT.REPORTER, text: 'UI部品のID一覧（JSON）' },
          { opcode: 'overUI', blockType: BT.BOOLEAN, text: 'マウスがUI部品の上にある' },

          label('レイアウトの保存と復元'),
          { opcode: 'exportUI', blockType: BT.REPORTER, text: 'UIレイアウトをJSONで書き出す' },
          { opcode: 'importUI', blockType: BT.COMMAND, text: 'UIレイアウトをJSON [JSON] から復元', arguments: { JSON: s('') } }
        ],
        menus
      };
    }

    /* === ルート要素と、テーマ === */

    ensureRoot() {
      if (this.root) return;
      const root = el('div', 'uitk');
      const style = el('style');
      style.textContent = CSS;
      this.layer = el('div', 'uitk-layer');
      this.modals = el('div', 'uitk-modals');
      this.toasts = el('div', 'uitk-ts');
      this.toasts.dataset.pos = this.toastPos;
      root.append(style, this.layer, this.modals, this.toasts);

      // 入力中のキーがScratch（TurboWarp）側に伝わらないようにする
      const guard = (e) => {
        if (e.target.closest && e.target.closest('input,textarea,select')) e.stopPropagation();
      };
      for (const t of ['keydown', 'keyup', 'keypress']) root.addEventListener(t, guard);

      // マウスがUIの上にあるか（ステージのクリック判定とのしわけをしてます）
      const SEL = '.uitk-w,.uitk-bd,.uitk-t';
      root.addEventListener('pointerover', (e) => { this.hoverUI = !!(e.target.closest && e.target.closest(SEL)); });
      root.addEventListener('pointerout', (e) => {
        if (!e.relatedTarget || !e.relatedTarget.closest || !e.relatedTarget.closest(SEL)) this.hoverUI = false;
      });

      // ショートカットキー（入力欄やダイアログ内のキーは上のguardで止まるので反応しない作り）
      document.addEventListener('keydown', (e) => {
        if (!this.shortcuts.size || e.repeat || e.isComposing) return;
        const w = this.widgets.get(this.shortcuts.get(eventKey(e)));
        if (!w || w.root.closest('[hidden],[inert]')) return;
        e.preventDefault();
        if (w.type === 'button') w.ctl.click(); else this.fire(w, 'click');
      });

      this.root = root;
      this.applyTheme();

      // リストモニターなどのGUI要素より前面に出すため、
      // ステージ専用オーバーレイではなく、ページ直下の固定レイヤーに配置します。
      // mountFallback内でステージの位置・サイズに追従するため、既存の座標系は維持されます。
      this.mountFallback(root);

      if (window.matchMedia) {
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => this.applyTheme());
      }
    }

    // ステージ座標に追従するページ直下の前面レイヤー
    mountFallback(root) {
      const canvas = Scratch.renderer && Scratch.renderer.canvas;
      document.body.appendChild(root);
      root.style.position = 'fixed';
      root.style.zIndex = '2147483647';
      root.style.transformOrigin = '0 0';

      const sync = () => {
        if (canvas) {
          const w = runtime.stageWidth || 480;
          const h = runtime.stageHeight || 360;
          const rect = canvas.getBoundingClientRect();

          root.style.left = rect.left + 'px';
          root.style.top = rect.top + 'px';
          root.style.width = w + 'px';
          root.style.height = h + 'px';
          root.style.transform = 'scale(' + rect.width / w + ')';
        }

        requestAnimationFrame(sync);
      };

      sync();
    }

    applyTheme() {
      if (!this.root) return;
      let mode = this.mode;

      if (mode === 'auto') {
        mode = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      }

      const o = this.overrides;
      const p = PALETTE[mode];
      const accent = o.accent || DEFAULTS.accent;
      const set = (k, v) => this.root.style.setProperty(k, v);

      set('--ui-bg', o.bg || p.bg);
      set('--ui-text', o.text || p.text);
      set('--ui-shadow', p.shadow);
      set('--ui-accent', accent);
      set('--ui-on-accent', onColor(accent));
      set('--ui-radius', (o.radius !== undefined ? o.radius : DEFAULTS.radius) + 'px');
      set('--ui-font-size', (o.fontSize !== undefined ? o.fontSize : DEFAULTS.fontSize) + 'px');
      set('--ui-font', o.font || DEFAULTS.font);
    }

    setTheme(args) {
      this.mode = ['light', 'dark', 'auto'].includes(args.THEME) ? args.THEME : 'light';
      this.applyTheme();
    }

    setAccent(args) {
      this.overrides.accent = str(args.COLOR);
      this.applyTheme();
    }

    setThemeProp(args) {
      const prop = str(args.PROP);
      if (!['accent', 'bg', 'text', 'fontSize', 'radius', 'font'].includes(prop)) return;
      const v = str(args.VALUE).trim();

      if (v === '') delete this.overrides[prop];
      else if (prop === 'fontSize') this.overrides[prop] = clamp(num(v, 14), 6, 120);
      else if (prop === 'radius') this.overrides[prop] = clamp(num(v, 10), 0, 100);
      else this.overrides[prop] = v;

      this.applyTheme();
    }

    setPreset(args) {
      this.overrides.accent = str(args.PRESET);
      this.applyTheme();
    }

    resetTheme() {
      this.mode = 'light';
      this.overrides = {};
      this.applyTheme();
    }

    setAutoClean(args) {
      this.autoClean = args.ONOFF !== 'off';
    }

    /* === 通知 === */

    toast(args) {
      this.ensureRoot();
      const type = ['success', 'warning', 'error'].includes(args.TYPE) ? args.TYPE : 'info';
      const icon = { info: 'i', success: '✓', warning: '!', error: '✕' }[type];
      const t = el('div', 'uitk-t t-' + type);
      t.setAttribute('role', type === 'error' ? 'alert' : 'status');
      t.append(el('i', '', icon), el('span', '', nl(args.TEXT)));

      let closed = false;
      const close = () => {
        if (closed) return;
        closed = true;
        t.classList.add('out');
        setTimeout(() => t.remove(), 220);
      };

      t.addEventListener('click', close);
      this.toasts.append(t);

      while (this.toasts.children.length > 6) {
        this.toasts.firstElementChild.remove();
      }

      const ms = num(args.SEC) * 1000;
      if (ms > 0) setTimeout(close, ms);
    }

    setToastPos(args) {
      if (!MENUS.toastPos.some((i) => i.value === args.POS)) return;
      this.toastPos = args.POS;
      if (this.toasts) this.toasts.dataset.pos = args.POS;
    }

    clearToasts() {
      if (this.toasts) this.toasts.replaceChildren();
    }

    /* === ダイアログ === */

    // ダイアログが複数ある場合は整列させる（1つずつ表示する）
    dialog(cfg) {
      const gen = this.gen;
      const p = this.queue.then(() => this.runDialog(cfg, gen));
      this.queue = p;

      return p.then((res) => {
        this.lastDialog = { canceled: res.canceled, index: res.index };
        return res;
      });
    }

    runDialog(cfg, gen) {
      return new Promise((resolve) => {
        if (gen !== this.gen) return resolve({ canceled: true, index: 0, value: '' });

        this.ensureRoot();

        const bd = el('div', 'uitk-bd');
        const dlg = el('div', 'uitk-dlg');

        dlg.setAttribute('role', 'dialog');
        dlg.setAttribute('aria-modal', 'true');

        if (cfg.title) dlg.append(el('h3', '', cfg.title));
        if (cfg.text) dlg.append(el('p', '', cfg.text));

        let finished = false;

        const finish = (res) => {
          if (finished) return;
          finished = true;
          this.activeClose = null;
          bd.remove();
          resolve(res);
        };

        const cancel = () => finish({ canceled: true, index: 0, value: '' });
        let input = null;
        const ok = () => finish({ canceled: false, index: 0, value: input ? input.value : '' });

        const btn = (text, cls, fn) => {
          const b = el('button', 'uitk-btn ' + cls, text);
          b.type = 'button';
          b.addEventListener('click', fn);
          return b;
        };

        let first = null;
        const acts = el('div', 'uitk-acts');

        if (cfg.kind === 'prompt') {
          input = el('input', 'uitk-in');
          input.type = 'text';
          input.value = cfg.def;
          input.style.width = '100%';
          dlg.append(input);
          first = input;
        }

        if (cfg.kind === 'choice') {
          const list = el('div', 'uitk-list');

          cfg.options.forEach((o, i) => {
            const b = btn(o, 'ghost', () => finish({ canceled: false, index: i + 1, value: o }));
            list.append(b);
            if (!first) first = b;
          });

          dlg.append(list);
        }

        if (cfg.kind !== 'alert') acts.append(btn(this.labels.cancel, 'ghost', cancel));

        if (cfg.kind !== 'choice') {
          const b = btn(this.labels.ok, '', ok);
          acts.append(b);
          if (!first) first = b;
        }

        if (!first) first = acts.lastElementChild;
        dlg.append(acts);

        bd.addEventListener('keydown', (e) => {
          e.stopPropagation();

          if (e.key === 'Escape') {
            e.preventDefault();
            if (cfg.kind === 'alert') ok();
            else cancel();
          } else if (e.key === 'Enter' && e.target.tagName !== 'BUTTON') {
            e.preventDefault();
            ok();
          } else if (e.key === 'Tab') {
            // フォーカスをダイアログ内に閉じ込める
            const f = [...dlg.querySelectorAll('button,input')];
            const i = f.indexOf(document.activeElement);
            const next = e.shiftKey ? (i <= 0 ? f.length - 1 : i - 1) : (i === f.length - 1 ? 0 : i + 1);
            f[next].focus();
            e.preventDefault();
          }
        });

        bd.addEventListener('keyup', (e) => e.stopPropagation());

        bd.append(dlg);
        this.modals.append(bd);
        this.activeClose = cancel;

        if (first) {
          first.focus();
          if (input) input.select();
        }
      });
    }

    async alertDialog(args) {
      await this.dialog({ kind: 'alert', title: nl(args.TITLE), text: nl(args.TEXT) });
    }

    async confirmDialog(args) {
      const r = await this.dialog({ kind: 'confirm', title: nl(args.TITLE), text: nl(args.TEXT) });
      return !r.canceled;
    }

    async promptDialog(args) {
      const r = await this.dialog({ kind: 'prompt', title: nl(args.TITLE), text: nl(args.TEXT), def: str(args.DEFAULT) });
      return r.canceled ? '' : r.value;
    }

    async choiceDialog(args) {
      const r = await this.dialog({ kind: 'choice', title: nl(args.TITLE), text: nl(args.TEXT), options: parseList(args.OPTIONS) });
      return r.canceled ? '' : r.value;
    }

    dialogCanceled() { return this.lastDialog.canceled; }
    dialogIndex() { return this.lastDialog.index; }

    setDialogLabels(args) {
      this.labels = { ok: str(args.OK) || 'OK', cancel: str(args.CANCEL) || 'キャンセル' };
    }

    /* === UI部品（作成） === */

    get(id) {
      return this.widgets.get(str(id).trim());
    }

    createWidget(args) {
      const id = str(args.ID).trim();
      const type = str(args.TYPE);

      if (!id || !MENUS.widgetType.some((i) => i.value === type)) return;

      this.ensureRoot();

      if (this.widgets.has(id)) this.removeWidget({ ID: id });

      const w = {
        id, type, x: Math.round(num(args.X)), y: Math.round(num(args.Y)),
        parent: '', text: '', anchor: 'center', margin: 0, bind: ''
      };

      this.build(w);
      w.root.classList.add('uitk-w', 'uitk-top');
      this.widgets.set(id, w);
      this.layer.append(w.root);
      this.place(w);
      this.setTextOf(w, nl(args.TEXT));
    }

    build(w) {
      const t = w.type;

      switch (t) {
        case 'button':
          w.root = w.ctl = el('button', 'uitk-btn');
          w.ctl.type = 'button';
          // マウス操作後はフォーカスを外し、ゲームのキー入力を妨げません。
          w.ctl.addEventListener('click', (e) => { if (e.detail > 0) w.ctl.blur(); });
          break;

        case 'label':
          w.root = el('div', 'uitk-label');
          break;

        case 'input':
          w.root = w.ctl = el('input', 'uitk-in');
          w.ctl.type = 'text';
          break;

        case 'textarea':
          w.root = w.ctl = el('textarea', 'uitk-in');
          w.ctl.rows = 3;
          break;

        case 'checkbox':
        case 'switch':
          w.root = el('label', t === 'switch' ? 'uitk-sw' : 'uitk-ck');
          w.ctl = el('input');
          w.ctl.type = 'checkbox';
          w.lab = el('span');
          w.root.append(w.ctl);
          if (t === 'switch') w.root.append(el('span', 'trk'));
          w.root.append(w.lab);
          break;

        case 'slider': {
          w.root = el('div', 'uitk-sl');
          const head = el('div', 'hd');
          w.lab = el('span');
          w.vEl = el('b', '', '50');
          head.append(w.lab, w.vEl);
          w.ctl = el('input');
          w.ctl.type = 'range';
          w.ctl.min = 0;
          w.ctl.max = 100;
          w.ctl.step = 1;
          w.ctl.value = 50;
          w.ctl.addEventListener('input', () => { w.vEl.textContent = w.ctl.value; });
          w.root.append(head, w.ctl);
          break;
        }

        case 'dropdown':
          w.root = w.ctl = el('select', 'uitk-in');
          break;

        case 'list':
          w.root = w.ctl = el('select', 'uitk-in');
          w.ctl.size = 5;
          break;

        case 'number':
          w.root = w.ctl = el('input', 'uitk-in');
          w.ctl.type = 'number';
          break;

        case 'color':
          w.root = w.ctl = el('input', 'uitk-in uitk-color');
          w.ctl.type = 'color';
          w.ctl.value = '#3b82f6';
          break;

        case 'radio':
        case 'tabs':
          w.root = el('div', t === 'tabs' ? 'uitk-tabs' : 'uitk-grp');
          if (t === 'tabs') w.root.setAttribute('role', 'tablist');
          w.gname = 'uitk-grp-' + (++this.uid);
          w.sel = '';
          w.opts = [];
          break;

        case 'progress':
          w.root = el('div', 'uitk-pg');
          w.root.setAttribute('role', 'progressbar');
          w.bar = el('i');
          w.lab = el('span');
          w.min = 0;
          w.max = 100;
          w.num = 0;
          w.root.append(w.bar, w.lab);
          break;

        case 'image':
          w.root = el('img', 'uitk-img');
          w.root.alt = '';
          w.root.draggable = false;
          break;

        case 'panel':
        case 'row':
          w.root = w.inner = el('div', 'uitk-panel' + (t === 'row' ? ' row' : ''));
          break;

        case 'window': {
          w.root = el('div', 'uitk-win');
          const head = el('div', 'uitk-win-h');
          w.lab = el('b');
          const x = el('button', 'uitk-x', '✕');
          x.type = 'button';
          x.setAttribute('aria-label', '閉じる');

          x.addEventListener('click', () => {
            this.applyState(w, 'hide');
            this.fire(w, 'close');
          });

          head.append(w.lab, x);
          w.inner = el('div', 'uitk-win-b');
          w.root.append(head, w.inner);

          w.root.addEventListener('pointerdown', () => {
            if (!w.parent && Number(w.root.style.zIndex || 0) !== this.zTop) this.reorder(w, true);
          });

          this.makeDraggable(w, head);
          break;
        }
      }

      // --- イベント ---
      const own = (e) => e.target.closest('.uitk-w') === w.root;

      w.root.addEventListener('dblclick', (e) => { if (own(e)) this.fire(w, 'dblclick'); });
      w.root.addEventListener('pointerenter', () => this.fire(w, 'hover'));

      if (['button', 'label', 'image', 'panel', 'row', 'progress'].includes(t)) {
        w.root.addEventListener('click', (e) => { if (own(e)) this.fire(w, 'click'); });
      }

      if (w.ctl) {
        w.ctl.addEventListener('input', () => this.fire(w, 'input'));
        w.ctl.addEventListener('change', () => this.fire(w, 'change'));
        w.ctl.addEventListener('focus', () => this.fire(w, 'focus'));
        w.ctl.addEventListener('blur', () => this.fire(w, 'blur'));

        if (t === 'input' || t === 'textarea' || t === 'number') {
          w.ctl.addEventListener('keydown', (e) => {
            if (e.key !== 'Enter' || e.isComposing) return;
            if (t !== 'textarea' || e.ctrlKey || e.metaKey) this.fire(w, 'enter');
          });
        }
      }
    }

    makeDraggable(w, handle) {
      handle.addEventListener('pointerdown', (e) => {
        if (w.parent || e.target.closest('button')) return;
        e.preventDefault();

        const rect = this.root.getBoundingClientRect();
        const k = rect.width / this.root.offsetWidth || 1;
        const sx = e.clientX, sy = e.clientY, ox = w.x, oy = w.y;
        handle.setPointerCapture(e.pointerId);

        const move = (ev) => {
          w.x = Math.round(ox + (ev.clientX - sx) / k);
          w.y = Math.round(oy - (ev.clientY - sy) / k);
          this.place(w);
        };

        const up = () => {
          handle.removeEventListener('pointermove', move);
          handle.removeEventListener('pointerup', up);
          handle.removeEventListener('pointercancel', up);
        };

        handle.addEventListener('pointermove', move);
        handle.addEventListener('pointerup', up);
        handle.addEventListener('pointercancel', up);
      });
    }

    /* === UI部品（削除と配置と階層） === */

    removeWidget(args) {
      const id = str(args.ID).trim();
      const w = this.widgets.get(id);

      if (!w) return;

      for (const c of [...this.widgets.values()]) {
        if (c.parent === id) this.removeWidget({ ID: c.id });
      }

      for (const [k, v] of this.shortcuts) {
        if (v === id) this.shortcuts.delete(k);
      }

      this.bound.delete(w);
      w.root.remove();
      this.widgets.delete(id);
    }

    removeAll() {
      for (const id of [...this.widgets.keys()]) this.removeWidget({ ID: id });
    }

    cleanup() {
      this.gen++;

      if (this.activeClose) this.activeClose();

      this.removeAll();
      this.stopBindingPoll();
      this.clearToasts();
      this.loading({ STATE: 'hide' });

      for (const x of this.waiters.splice(0)) x.done(true);

      this.events.clear();
    }

    // 座標はScratchと同じ向き（右が+x・上が+y）
    place(w) {
      if (w.parent) return;

      const A = w.anchor, m = w.margin, s = w.root.style;
      const H = /left/.test(A) ? 'l' : /right/.test(A) ? 'r' : 'c';
      const V = /top/.test(A) ? 't' : /bottom/.test(A) ? 'b' : 'c';

      s.left = s.right = s.top = s.bottom = '';

      let tx = '0px', ty = '0px';

      if (H === 'l') s.left = (m + w.x) + 'px';
      else if (H === 'r') s.right = (m - w.x) + 'px';
      else {
        s.left = 'calc(50% + ' + w.x + 'px)';
        tx = '-50%';
      }

      if (V === 't') s.top = (m - w.y) + 'px';
      else if (V === 'b') s.bottom = (m + w.y) + 'px';
      else {
        s.top = 'calc(50% - ' + w.y + 'px)';
        ty = '-50%';
      }

      s.translate = tx + ' ' + ty;
    }

    clearPos(w) {
      const s = w.root.style;
      s.left = s.right = s.top = s.bottom = '';
      s.translate = '';
    }

    anchorTo(args) {
      const w = this.get(args.ID);
      const a = str(args.ANCHOR);

      if (!w || !MENUS.anchor.some((i) => i.value === a)) return;

      w.anchor = a;
      w.margin = Math.round(clamp(num(args.M), -9999, 9999));
      this.place(w);
    }

    moveTo(args) {
      const w = this.get(args.ID);
      if (!w) return;

      w.x = Math.round(num(args.X));
      w.y = Math.round(num(args.Y));
      this.place(w);
    }

    moveBy(args) {
      const w = this.get(args.ID);
      if (!w) return;

      w.x += Math.round(num(args.X));
      w.y += Math.round(num(args.Y));
      this.place(w);
    }

    setSize(args) {
      const w = this.get(args.ID);
      if (!w) return;

      const W = num(args.W), H = num(args.H);
      w.root.style.width = W > 0 ? W + 'px' : '';
      w.root.style.height = H > 0 ? H + 'px' : '';
    }

    setParent(args) {
      const w = this.get(args.ID);
      if (!w) return;

      const pid = str(args.PARENT).trim();
      const p = pid ? this.widgets.get(pid) : null;

      if (p && p.inner && p !== w) {
        for (let q = p; q; q = this.widgets.get(q.parent)) {
          if (q === w) return;
        }

        p.inner.append(w.root);
        w.parent = p.id;
        w.root.classList.remove('uitk-top');
        this.clearPos(w);
      } else if (!pid) {
        this.layer.append(w.root);
        w.parent = '';
        w.root.classList.add('uitk-top');
        this.place(w);
      }
    }

    reorder(w, front) {
      if (!w.parent) {
        w.root.style.zIndex = front ? ++this.zTop : --this.zBot;
        return;
      }

      const box = this.widgets.get(w.parent).inner;

      if (front) box.append(w.root);
      else box.prepend(w.root);
    }

    /* === UI部品（内容・状態） === */

    setText(args) {
      const w = this.get(args.ID);
      if (w) this.setTextOf(w, nl(args.TEXT));
    }

    setTextOf(w, t) {
      w.text = t;

      switch (w.type) {
        case 'button':
        case 'label':
          w.root.textContent = t;
          break;

        case 'input':
        case 'textarea':
        case 'number':
        case 'color':
          w.ctl.value = t;
          break;

        case 'checkbox':
        case 'switch':
        case 'slider':
        case 'window':
          w.lab.textContent = t;
          break;

        case 'progress':
          this.drawProgress(w);
          break;

        case 'dropdown':
        case 'list':
        case 'radio':
        case 'tabs':
          this.setOptionsOf(w, parseList(t));
          break;
      }
    }

    drawProgress(w) {
      const p = w.max > w.min ? clamp((w.num - w.min) / (w.max - w.min), 0, 1) : 0;

      w.bar.style.width = p * 100 + '%';
      w.lab.textContent = w.text.replace(/\{p\}/g, Math.round(p * 100));
      w.root.setAttribute('aria-valuenow', Math.round(p * 100));
    }

    setValue(args) {
      const w = this.get(args.ID);
      if (!w) return;

      const r = this.setValueOf(w, args.VALUE);
      this.syncBind(w);
      return r;
    }

    setValueOf(w, v) {
      switch (w.type) {
        case 'input':
        case 'textarea':
        case 'number':
        case 'color':
          w.ctl.value = str(v);
          break;

        case 'checkbox':
        case 'switch':
          w.ctl.checked = Cast.toBoolean(v);
          break;

        case 'slider':
          w.ctl.value = num(v);
          w.vEl.textContent = w.ctl.value;
          break;

        case 'dropdown':
        case 'list':
          if ([...w.ctl.options].some((o) => o.value === str(v))) w.ctl.value = str(v);
          break;

        case 'radio':
        case 'tabs':
          if (w.opts.includes(str(v))) {
            w.sel = str(v);
            this.markGroup(w);
          }
          break;

        case 'progress':
          w.num = num(v);
          this.drawProgress(w);
          break;

        case 'image':
          return this.setImage(w, str(v));

        default:
          this.setTextOf(w, str(v));
      }
    }

    async setImage(w, url) {
      if (url && !(await Scratch.canFetch(url))) return;

      if (this.widgets.get(w.id) === w) w.root.src = url;
    }

    setOptions(args) {
      const w = this.get(args.ID);
      if (w) this.setOptionsOf(w, parseList(args.OPTIONS));
    }

    setOptionsOf(w, opts) {
      w.text = JSON.stringify(opts);

      if (w.type === 'dropdown' || w.type === 'list') {
        const cur = w.ctl.value;
        w.ctl.textContent = '';

        for (const o of opts) w.ctl.append(new Option(o, o));

        if (opts.includes(cur)) w.ctl.value = cur;
      } else if (w.type === 'radio' || w.type === 'tabs') {
        this.buildGroup(w, opts);
      }
    }

    // ラジオボタン・タブの選択肢を作り直す
    buildGroup(w, opts) {
      w.opts = opts;

      if (!opts.includes(w.sel)) w.sel = w.type === 'tabs' ? (opts[0] || '') : '';

      w.root.textContent = '';

      for (const o of opts) {
        if (w.type === 'tabs') {
          const b = el('button', '', o);
          b.type = 'button';
          b.setAttribute('role', 'tab');

          b.addEventListener('click', (e) => {
            if (e.detail > 0) b.blur();
            this.pick(w, o);
          });

          w.root.append(b);
        } else {
          const lab = el('label');
          const r = el('input');
          r.type = 'radio';
          r.name = w.gname;
          r.value = o;
          r.addEventListener('change', () => this.pick(w, o));
          lab.append(r, el('span', '', o));
          w.root.append(lab);
        }
      }

      this.markGroup(w);
    }

    pick(w, o) {
      if (w.sel === o) return;

      w.sel = o;
      this.markGroup(w);
      this.fire(w, 'input');
      this.fire(w, 'change');
    }

    markGroup(w) {
      for (const c of w.root.children) {
        if (w.type === 'tabs') c.setAttribute('aria-selected', String(c.textContent === w.sel));
        else c.firstChild.checked = c.firstChild.value === w.sel;
      }
    }

    setRange(args) {
      const w = this.get(args.ID);
      if (!w) return;

      const min = num(args.MIN);
      const max = Math.max(min, num(args.MAX, 100));
      const step = Math.max(num(args.STEP, 1), 0.000001);

      if (w.type === 'slider' || w.type === 'number') {
        w.ctl.min = min;
        w.ctl.max = max;
        w.ctl.step = step;
        if (w.vEl) w.vEl.textContent = w.ctl.value;
      } else if (w.type === 'progress') {
        w.min = min;
        w.max = max;
        this.drawProgress(w);
      }
    }

    setStyle(args) {
      const w = this.get(args.ID);
      if (!w) return;

      const prop = str(args.PROP);
      const v = str(args.VALUE).trim();
      const s = w.root.style;
      const empty = v === '';

      switch (prop) {
        case 'color': s.color = safeCss(v); break;
        case 'background': s.background = safeCss(v); break;

        case 'accent':
          if (empty) {
            s.removeProperty('--ui-accent');
            s.removeProperty('--ui-on-accent');
          } else {
            s.setProperty('--ui-accent', safeCss(v));
            s.setProperty('--ui-on-accent', onColor(v));
          }
          break;

        case 'borderColor':
          s.borderColor = safeCss(v);

          if (!empty) {
            s.borderStyle = 'solid';
            if (!s.borderWidth) s.borderWidth = '1px';
          }
          break;

        case 'fontSize': s.fontSize = empty ? '' : clamp(num(v, 14), 4, 400) + 'px'; break;
        case 'radius': s.borderRadius = empty ? '' : Math.max(0, num(v)) + 'px'; break;
        case 'opacity': s.opacity = empty ? '' : clamp(num(v, 100), 0, 100) / 100; break;
        case 'padding': s.padding = empty ? '' : Math.max(0, num(v)) + 'px'; break;
        case 'gap': s.gap = empty ? '' : Math.max(0, num(v)) + 'px'; break;

        case 'justify':
          s.justifyContent = { start: 'flex-start', center: 'center', end: 'flex-end', between: 'space-between' }[v] || '';
          break;

        case 'align': s.textAlign = v; break;

        case 'tooltip':
          w.root.title = v;
          if (empty) w.root.removeAttribute('aria-label');
          else w.root.setAttribute('aria-label', v);
          break;

        case 'placeholder':
          if (w.ctl && 'placeholder' in w.ctl) w.ctl.placeholder = v;
          break;

        case 'inputType':
          if (w.type === 'input' && ['text', 'password', 'email', 'tel', 'url', 'search'].includes(v)) w.ctl.type = v;
          break;

        case 'maxlength':
          if (w.type === 'input' || w.type === 'textarea') {
            if (empty) w.ctl.removeAttribute('maxlength');
            else w.ctl.maxLength = clamp(Math.round(num(v)), 0, 100000);
          }
          break;
      }
    }

    setCSS(args) {
      const w = this.get(args.ID);
      if (w) w.root.style.cssText += ';' + safeCss(args.CSS);
    }

    setState(args) {
      const w = this.get(args.ID);
      if (w) this.applyState(w, str(args.STATE));
    }

    applyState(w, state) {
      switch (state) {
        case 'show': w.root.hidden = false; break;
        case 'hide': w.root.hidden = true; break;
        case 'toggle': w.root.hidden = !w.root.hidden; break;

        case 'enable':
        case 'disable': {
          const on = state === 'enable';
          w.root.inert = !on;
          w.root.classList.toggle('uitk-disabled', !on);
          break;
        }

        case 'front': this.reorder(w, true); break;
        case 'back': this.reorder(w, false); break;
        case 'focus': (w.ctl || w.root).focus(); break;
      }
    }

    /* === イベント === */

    // hover/focus/blur は「最後に操作されたUI」や「いずれかのUI部品が操作されたとき」には影響させません
    fire(w, kind) {
      const quiet = kind === 'hover' || kind === 'focus' || kind === 'blur';
      const key = w.id + '|' + kind;

      if (!quiet) this.last = { id: w.id, kind, value: this.readValue(w) };
      if (w.bind && (kind === 'input' || kind === 'change')) this.syncBind(w);

      this.mark(key);
      if (!quiet) this.mark('*');

      const hit = this.waiters.filter((x) => x.key === key);

      if (hit.length) {
        this.waiters = this.waiters.filter((x) => x.key !== key);
        for (const x of hit) x.done(false);
      }

      runtime.startHats(HAT_EVENT);
      if (!quiet) runtime.startHats(HAT_ANY);
    }

    // ハットブロックが判定するまでの短い間だけイベントを保持する
    mark(k) {
      const t = ++this.tok;
      this.events.set(k, t);
      setTimeout(() => {
        if (this.events.get(k) === t) this.events.delete(k);
      }, 500);
    }

    whenEvent(args) {
      return this.events.has(str(args.ID).trim() + '|' + str(args.EVT));
    }

    whenAnyEvent() {
      return this.events.has('*');
    }

    lastId() { return this.last.id; }
    lastEvent() { return this.last.kind; }
    lastValue() { return this.last.value; }

    /* === アニメーション === */

    animate(args) {
      this.runAnim(args);
    }

    animateWait(args) {
      return this.runAnim(args);
    }

    runAnim(args) {
      const w = this.get(args.ID);
      const kind = str(args.ANIM);

      const F = {
        fadeIn: [{ opacity: 0 }, { opacity: 1 }],
        fadeOut: [{ opacity: 1 }, { opacity: 0 }],
        pop: [{ opacity: 0, transform: 'scale(.6)' }, { opacity: 1, transform: 'scale(1.06)', offset: 0.7 }, { opacity: 1, transform: 'scale(1)' }],
        slideUp: [{ opacity: 0, transform: 'translateY(24px)' }, { opacity: 1, transform: 'translateY(0)' }],
        slideDown: [{ opacity: 0, transform: 'translateY(-24px)' }, { opacity: 1, transform: 'translateY(0)' }],
        bounce: [{ transform: 'translateY(0)' }, { transform: 'translateY(-18px)', offset: 0.35 }, { transform: 'translateY(0)', offset: 0.6 },
          { transform: 'translateY(-6px)', offset: 0.8 }, { transform: 'translateY(0)' }],
        shake: [{ transform: 'translateX(0)' }, { transform: 'translateX(-8px)', offset: 0.15 }, { transform: 'translateX(8px)', offset: 0.35 },
          { transform: 'translateX(-6px)', offset: 0.55 }, { transform: 'translateX(6px)', offset: 0.75 }, { transform: 'translateX(0)' }],
        pulse: [{ transform: 'scale(1)' }, { transform: 'scale(1.12)', offset: 0.5 }, { transform: 'scale(1)' }]
      }[kind];

      if (!w || !F || !w.root.animate) return;

      // OSの「視覚効果を減らす」設定を尊重する
      const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const ms = reduce ? 1 : clamp(num(args.SEC, 0.4), 0.05, 30) * 1000;

      for (const a of w.root.getAnimations()) a.cancel();

      if (['fadeIn', 'pop', 'slideUp', 'slideDown'].includes(kind)) w.root.hidden = false;

      const fadeOut = kind === 'fadeOut';
      const anim = w.root.animate(F, { duration: ms, easing: 'ease-out', fill: fadeOut ? 'forwards' : 'none' });

      return anim.finished.then(() => {
        if (fadeOut) {
          w.root.hidden = true;
          anim.cancel();
        }
      }, () => {});
    }

    /* === 変数の連動 === */

    variableMenu() {
      const stage = runtime.getTargetForStage();
      const names = stage ? Object.values(stage.variables).filter((v) => v.type === '').map((v) => v.name) : [];
      return names.length ? names.sort() : [{ text: '（変数がありません）', value: '' }];
    }

    findVar(name) {
      const stage = runtime.getTargetForStage();
      return stage ? stage.lookupVariableByNameAndType(name, '') : null;
    }

    // 変数が主（連動開始時は変数の値をUIに反映し、以後は双方向に同期）
    bindVariable(args) {
      const w = this.get(args.ID);
      if (!w) return;

      this.bound.delete(w);
      w.bind = '';

      const name = str(args.VAR).trim();
      const v = name ? this.findVar(name) : null;

      if (!v) {
        if (!this.bound.size) this.stopBindingPoll();
        return;
      }

      w.bind = name;
      w.boundLast = v.value;
      this.bound.add(w);
      this.applyVar(w, v.value);

      if (!this.poll) this.poll = setInterval(() => this.pullBindings(), 100);
    }

    stopBindingPoll() {
      if (!this.poll) return;
      clearInterval(this.poll);
      this.poll = 0;
    }

    applyVar(w, val) {
      if (w.type === 'label' || w.type === 'button' || w.type === 'window') this.setTextOf(w, str(val));
      else this.setValueOf(w, val);
    }

    syncBind(w) {
      if (!w.bind) return;

      const v = this.findVar(w.bind);
      if (!v) return;

      const cur = this.readValue(w);
      v.value = cur;
      w.boundLast = cur;
    }

    pullBindings() {
      if (!this.bound.size) return;

      for (const w of this.bound) {
        const v = this.findVar(w.bind);
        if (!v || v.value === w.boundLast) continue;

        w.boundLast = v.value;
        this.applyVar(w, v.value);
      }
    }

    /* === ショートカットキー === */

    setShortcut(args) {
      const w = this.get(args.ID);
      if (!w) return;

      for (const [k, id] of this.shortcuts) {
        if (id === w.id) this.shortcuts.delete(k);
      }

      const key = normKey(args.KEY);
      if (key) this.shortcuts.set(key, w.id);
    }

    /* === ローディング === */

    loading(args) {
      if (args.STATE === 'hide') {
        if (this.loadEl) {
          this.loadEl.remove();
          this.loadEl = null;
        }
        return;
      }

      this.ensureRoot();

      if (!this.loadEl) {
        const bd = el('div', 'uitk-bd');
        const box = el('div', 'uitk-load');
        box.setAttribute('role', 'status');
        box.append(el('div', 'uitk-spin'), el('div'));
        bd.append(box);
        this.modals.append(bd);
        this.loadEl = bd;
      }

      this.loadEl.querySelector('.uitk-load').lastChild.textContent = nl(args.TEXT);
    }

    /* === イベント待機 === */

    waitEvent(args) {
      const key = str(args.ID).trim() + '|' + str(args.EVT);
      const sec = num(args.SEC);

      return new Promise((resolve) => {
        let timer = 0;

        const entry = {
          key,
          done: (timedOut) => {
            clearTimeout(timer);
            this.lastWaitTimedOut_ = timedOut;
            resolve();
          }
        };

        this.waiters.push(entry);

        if (sec > 0) {
          timer = setTimeout(() => {
            this.waiters = this.waiters.filter((x) => x !== entry);
            entry.done(true);
          }, sec * 1000);
        }
      });
    }

    lastWaitTimedOut() { return this.lastWaitTimedOut_; }
    overUI() { return this.hoverUI; }

    /* === レイアウトの保存と復元 === */

    exportUI() {
      const list = [...this.widgets.values()].map((w) => {
        const o = { id: w.id, type: w.type, text: w.text, x: w.x, y: w.y, anchor: w.anchor, margin: w.margin };

        if (w.parent) o.parent = w.parent;
        if (w.root.hidden) o.hidden = true;
        if (w.root.inert) o.disabled = true;
        if (w.bind) o.bind = w.bind;

        const css = w.root.style.cssText;
        if (css) o.css = css;

        const props = {};

        if (w.root.title) props.tooltip = w.root.title;
        if (w.ctl && w.ctl.placeholder) props.placeholder = w.ctl.placeholder;
        if (w.type === 'input' && w.ctl.type !== 'text') props.inputType = w.ctl.type;

        if ((w.type === 'input' || w.type === 'textarea') && w.ctl.maxLength > 0) {
          props.maxlength = w.ctl.maxLength;
        }

        if (Object.keys(props).length) o.props = props;

        if (w.type === 'slider') o.range = [Number(w.ctl.min), Number(w.ctl.max), Number(w.ctl.step)];
        else if (w.type === 'number' && (w.ctl.min || w.ctl.max)) o.range = [Number(w.ctl.min || 0), Number(w.ctl.max || 100), Number(w.ctl.step || 1)];
        else if (w.type === 'progress') o.range = [w.min, w.max];

        if (TEXTY.has(w.type) || OPTION_TYPES.has(w.type) || ['checkbox', 'switch', 'slider', 'progress', 'image'].includes(w.type)) {
          o.value = this.readValue(w);
        }

        const sc = [...this.shortcuts].find(([, id]) => id === w.id);
        if (sc) o.shortcut = sc[0];

        return o;
      });

      return JSON.stringify({ v: 1, widgets: list });
    }

    importUI(args) {
      let data;

      try {
        data = JSON.parse(str(args.JSON));
      } catch (e) {
        return;
      }

      const list = Array.isArray(data) ? data : data && data.widgets;
      if (!Array.isArray(list)) return;

      this.removeAll();

      const ok = list.filter((o) => o && typeof o.id === 'string' && typeof o.type === 'string');

      for (const o of ok) {
        this.createWidget({ TYPE: o.type, ID: o.id, TEXT: o.text === undefined ? '' : o.text, X: o.x, Y: o.y });

        const w = this.widgets.get(o.id);
        if (!w) continue;

        if (Array.isArray(o.range)) {
          this.setRange({ ID: o.id, MIN: o.range[0], MAX: o.range[1], STEP: o.range[2] === undefined ? 1 : o.range[2] });
        }

        if (o.css) w.root.style.cssText = safeCss(o.css);

        if (o.props && typeof o.props === 'object') {
          for (const p of ['tooltip', 'placeholder', 'inputType', 'maxlength']) {
            if (o.props[p] !== undefined) this.setStyle({ ID: o.id, PROP: p, VALUE: o.props[p] });
          }
        }

        w.anchor = MENUS.anchor.some((i) => i.value === o.anchor) ? o.anchor : 'center';
        w.margin = num(o.margin);
        this.place(w);

        if (o.value !== undefined) this.setValueOf(w, o.value);
        if (o.shortcut) this.setShortcut({ ID: o.id, KEY: o.shortcut });
      }

      for (const o of ok) {
        if (o.parent) this.setParent({ ID: o.id, PARENT: o.parent });
      }

      for (const o of ok) {
        if (o.bind) this.bindVariable({ ID: o.id, VAR: o.bind });
        if (o.hidden) this.setState({ ID: o.id, STATE: 'hide' });
        if (o.disabled) this.setState({ ID: o.id, STATE: 'disable' });
      }
    }

    /* === 取得 === */

    readValue(w) {
      switch (w.type) {
        case 'input':
        case 'textarea':
        case 'dropdown':
        case 'list':
        case 'color':
          return w.ctl.value;

        case 'number':
          return w.ctl.value === '' ? '' : Number(w.ctl.value);

        case 'checkbox':
        case 'switch':
          return w.ctl.checked;

        case 'slider':
          return Number(w.ctl.value);

        case 'radio':
        case 'tabs':
          return w.sel;

        case 'progress':
          return w.num;

        case 'image':
          return w.root.getAttribute('src') || '';

        default:
          return w.text;
      }
    }

    getValue(args) {
      const w = this.get(args.ID);
      return w ? this.readValue(w) : '';
    }

    getAttr(args) {
      const w = this.get(args.ID);
      if (!w) return '';

      switch (str(args.ATTR)) {
        case 'text': return TEXTY.has(w.type) || OPTION_TYPES.has(w.type) ? this.readValue(w) : w.text;

        case 'index':
          if (w.type === 'dropdown' || w.type === 'list') return w.ctl.selectedIndex + 1;
          if (w.type === 'radio' || w.type === 'tabs') return w.opts.indexOf(w.sel) + 1;
          return 0;

        case 'count':
          if (w.type === 'dropdown' || w.type === 'list') return w.ctl.options.length;
          if (w.type === 'radio' || w.type === 'tabs') return w.opts.length;
          return 0;

        case 'x': return w.x;
        case 'y': return w.y;
        case 'width': return w.root.offsetWidth;
        case 'height': return w.root.offsetHeight;
        case 'visible': return !w.root.hidden;
        case 'enabled': return !w.root.inert;
        case 'hover': return w.root.matches(':hover');
        case 'type': return w.type;
        case 'parent': return w.parent;
        case 'anchor': return w.anchor;

        default:
          return '';
      }
    }

    isChecked(args) {
      const w = this.get(args.ID);
      return w ? Cast.toBoolean(this.readValue(w)) : false;
    }

    exists(args) {
      return this.widgets.has(str(args.ID).trim());
    }

    listIds() {
      return JSON.stringify([...this.widgets.keys()]);
    }
  }

  Scratch.extensions.register(new UIToolkit());
})(Scratch);
