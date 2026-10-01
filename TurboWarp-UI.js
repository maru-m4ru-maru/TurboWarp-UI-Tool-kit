// Name: UIツールキット
// ID: uitoolkit
// Description: ステージ上にボタン・入力欄・スライダー・ウィンドウなどのUI部品、通知、ダイアログを作成できる拡張機能。
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

  /* =================ユーティリティ================= */

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

  // "A,B,C" / 改行区切り / JSON配列 のいずれも受け付ける
  const parseList = (v) => {
    const s = str(v).trim();
    if (!s) return [];
    if (s[0] === '[') {
      try {
        const a = JSON.parse(s);
        if (Array.isArray(a)) return a.map(String);
      } catch (e) { /* 通常の区切りとして処理 */ }
    }
    return s.split(/[,\n]/).map((x) => x.trim()).filter(Boolean);
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

  /* =================テーマ/CSS================= */

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
.uitk .uitk-top{position:absolute;transform:translate(-50%,-50%);max-width:100%}
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

  /* =================メニュー定義================= */

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
      ['ドロップダウン', 'dropdown'], ['プログレスバー', 'progress'], ['画像', 'image'],
      ['パネル（縦並び）', 'panel'], ['パネル（横並び）', 'row'], ['ウィンドウ', 'window']
    ]),
    styleProp: items([
      ['文字色', 'color'], ['背景色', 'background'], ['アクセント色', 'accent'], ['枠線色', 'borderColor'],
      ['文字サイズ(px)', 'fontSize'], ['角丸(px)', 'radius'], ['不透明度(0-100)', 'opacity'],
      ['余白(px)', 'padding'], ['文字揃え(left/center/right)', 'align'],
      ['ツールチップ', 'tooltip'], ['プレースホルダー', 'placeholder']
    ]),
    state: items([
      ['表示する', 'show'], ['非表示にする', 'hide'], ['表示を切り替える', 'toggle'],
      ['有効にする', 'enable'], ['無効にする', 'disable'],
      ['最前面に出す', 'front'], ['最背面に送る', 'back'], ['フォーカスする', 'focus']
    ]),
    attr: items([
      ['テキスト', 'text'], ['選択中の番号', 'index'], ['x座標', 'x'], ['y座標', 'y'],
      ['幅', 'width'], ['高さ', 'height'], ['表示中か', 'visible'], ['有効か', 'enabled'],
      ['種類', 'type'], ['親のID', 'parent']
    ]),
    evt: items([
      ['クリック', 'click'], ['値の確定', 'change'], ['入力中', 'input'], ['Enterキー', 'enter'],
      ['フォーカス取得', 'focus'], ['フォーカス喪失', 'blur'], ['閉じる', 'close']
    ])
  };

  /* =================拡張機能の本体================= */

  class UIToolkit {
    constructor() {
      this.widgets = new Map();
      this.root = null;
      this.mode = 'light';
      this.overrides = {};
      this.toastPos = 'top-right';
      this.labels = { ok: 'OK', cancel: 'キャンセル' };
      this.autoClean = true;
      this.events = new Set();
      this.last = { id: '', kind: '', value: '' };
      this.queue = Promise.resolve();
      this.gen = 0;
      this.activeClose = null;
      this.lastDialog = { canceled: false, index: 0 };
      this.zTop = 0;
      this.zBot = 0;

      runtime.on('PROJECT_STOP_ALL', () => { if (this.autoClean) this.cleanup(); });
      // イベントは1フレームだけ有効（ハットブロックの判定用）
      runtime.on('AFTER_EXECUTE', () => this.events.clear());
    }

    getInfo() {
      const id = (d = 'ui1') => ({ type: AT.STRING, defaultValue: d });
      const s = (d) => ({ type: AT.STRING, defaultValue: d });
      const n = (d) => ({ type: AT.NUMBER, defaultValue: d });
      const m = (menu, d) => ({ type: AT.STRING, menu, defaultValue: d });
      const label = (text) => ({ blockType: BT.LABEL, text });
      const menus = {};
      for (const k of Object.keys(MENUS)) menus[k] = { acceptReporters: true, items: MENUS[k] };

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
          { opcode: 'setSize', blockType: BT.COMMAND, text: '[ID] のサイズを 幅 [W] 高さ [H] にする（0で自動）', arguments: { ID: id('btn1'), W: n(0), H: n(0) } },
          { opcode: 'setStyle', blockType: BT.COMMAND, text: '[ID] の [PROP] を [VALUE] にする', arguments: { ID: id('btn1'), PROP: m('styleProp', 'accent'), VALUE: s('#e5484d') } },
          { opcode: 'setCSS', blockType: BT.COMMAND, text: '[ID] にCSS [CSS] を追加', arguments: { ID: id('btn1'), CSS: s('font-weight:bold') } },
          { opcode: 'setState', blockType: BT.COMMAND, text: '[ID] を [STATE]', arguments: { ID: id('btn1'), STATE: m('state', 'hide') } },

          label('イベント'),
          { opcode: 'whenEvent', blockType: BT.HAT, isEdgeActivated: false, text: '[ID] の [EVT] が起きたとき', arguments: { ID: id('btn1'), EVT: m('evt', 'click') } },
          { opcode: 'whenAnyEvent', blockType: BT.HAT, isEdgeActivated: false, text: 'いずれかのUI部品が操作されたとき' },
          { opcode: 'lastId', blockType: BT.REPORTER, text: '最後に操作されたUIのID' },
          { opcode: 'lastEvent', blockType: BT.REPORTER, text: '最後の操作の種類' },
          { opcode: 'lastValue', blockType: BT.REPORTER, text: '最後に操作されたUIの値' },

          label('値の取得'),
          { opcode: 'getValue', blockType: BT.REPORTER, text: '[ID] の値', arguments: { ID: id('slider1') } },
          { opcode: 'getAttr', blockType: BT.REPORTER, text: '[ID] の [ATTR]', arguments: { ID: id('btn1'), ATTR: m('attr', 'text') } },
          { opcode: 'isChecked', blockType: BT.BOOLEAN, text: '[ID] はオン（チェック済み）', arguments: { ID: id('check1') } },
          { opcode: 'exists', blockType: BT.BOOLEAN, text: '[ID] は存在する', arguments: { ID: id('btn1') } },
          { opcode: 'listIds', blockType: BT.REPORTER, text: 'UI部品のID一覧（JSON）' }
        ],
        menus
      };
    }

    /* ----------ルート要素・テーマ---------- */

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

      //入力中のキーがScratch(TurboWarp)側（スペースキーなどなど）に伝わらないようにする。capslockの暴発防止？そんなの物理的に取り外してください
      const guard = (e) => {
        if (e.target.closest && e.target.closest('input,textarea,select')) e.stopPropagation();
      };
      for (const t of ['keydown', 'keyup', 'keypress']) root.addEventListener(t, guard);

      this.root = root;
      this.applyTheme();

      const r = Scratch.renderer;
      if (r && typeof r.addOverlay === 'function') {
        //'scale'ステージの実サイズ(px)で配置されて、全画面表示でも自動拡大されます
        r.addOverlay(root, 'scale');
      } else {
        this.mountFallback(root);
      }
      if (window.matchMedia) {
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => this.applyTheme());
      }
    }

    // addOverlayが無い環境への配慮(全米がないた)。キャンバスの位置に合わせてbody直下に重ねる
    mountFallback(root) {
      const canvas = Scratch.renderer && Scratch.renderer.canvas;
      document.body.appendChild(root);
      root.style.position = 'fixed';
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

    resetTheme() {
      this.mode = 'light';
      this.overrides = {};
      this.applyTheme();
    }

    setAutoClean(args) {
      this.autoClean = args.ONOFF !== 'off';
    }

    /* ----------通知---------- */

    toast(args) {
      this.ensureRoot();
      const type = ['success', 'warning', 'error'].includes(args.TYPE) ? args.TYPE : 'info';
      const icon = { info: 'i', success: '✓', warning: '!', error: '✕' }[type];
      const t = el('div', 'uitk-t t-' + type);
      t.setAttribute('role', type === 'error' ? 'alert' : 'status');
      t.append(el('i', '', icon), el('span', '', str(args.TEXT)));
      let closed = false;
      const close = () => {
        if (closed) return;
        closed = true;
        t.classList.add('out');
        setTimeout(() => t.remove(), 220);
      };
      t.addEventListener('click', close);
      this.toasts.append(t);
      while (this.toasts.children.length > 6) this.toasts.firstElementChild.remove();
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

    /* ----------ダイアログ---------- */

    // 複数のダイアログは順番に1つずーつ表示
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
            if (cfg.kind === 'alert') ok(); else cancel();
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
      await this.dialog({ kind: 'alert', title: str(args.TITLE), text: str(args.TEXT) });
    }

    async confirmDialog(args) {
      const r = await this.dialog({ kind: 'confirm', title: str(args.TITLE), text: str(args.TEXT) });
      return !r.canceled;
    }

    async promptDialog(args) {
      const r = await this.dialog({ kind: 'prompt', title: str(args.TITLE), text: str(args.TEXT), def: str(args.DEFAULT) });
      return r.canceled ? '' : r.value;
    }

    async choiceDialog(args) {
      const r = await this.dialog({ kind: 'choice', title: str(args.TITLE), text: str(args.TEXT), options: parseList(args.OPTIONS) });
      return r.canceled ? '' : r.value;
    }

    dialogCanceled() { return this.lastDialog.canceled; }
    dialogIndex() { return this.lastDialog.index; }

    setDialogLabels(args) {
      this.labels = { ok: str(args.OK) || 'OK', cancel: str(args.CANCEL) || 'キャンセル' };
    }

    /* ----------UI部品の作成---------- */

    get(id) {
      return this.widgets.get(str(id).trim());
    }

    createWidget(args) {
      const id = str(args.ID).trim();
      const type = str(args.TYPE);
      if (!id || !MENUS.widgetType.some((i) => i.value === type)) return;
      this.ensureRoot();
      if (this.widgets.has(id)) this.removeWidget({ ID: id });

      const w = { id, type, x: Math.round(num(args.X)), y: Math.round(num(args.Y)), parent: '', text: '' };
      this.build(w);
      w.root.classList.add('uitk-w', 'uitk-top');
      this.widgets.set(id, w);
      this.layer.append(w.root);
      this.place(w);
      this.setTextOf(w, str(args.TEXT));
    }

    build(w) {
      const t = w.type;
      switch (t) {
        case 'button':
          w.root = w.ctl = el('button', 'uitk-btn');
          w.ctl.type = 'button';
          // マウス操作後はフォーカスを外し、ゲームのキー入力を妨げない設計
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
      const own = (e) => e.target.closest('.uitk-w') === w.root; // 子部品のイベントは除外
      if (['button', 'label', 'image', 'panel', 'row', 'progress'].includes(t)) {
        w.root.addEventListener('click', (e) => { if (own(e)) this.fire(w, 'click'); });
      }
      if (w.ctl) {
        w.ctl.addEventListener('input', () => this.fire(w, 'input'));
        w.ctl.addEventListener('change', () => this.fire(w, 'change'));
        w.ctl.addEventListener('focus', () => this.fire(w, 'focus'));
        w.ctl.addEventListener('blur', () => this.fire(w, 'blur'));
        if (t === 'input' || t === 'textarea') {
          w.ctl.addEventListener('keydown', (e) => {
            if (e.key !== 'Enter' || e.isComposing) return;
            if (t === 'input' || e.ctrlKey || e.metaKey) this.fire(w, 'enter');
          });
        }
      }
    }

    makeDraggable(w, handle) {
      handle.addEventListener('pointerdown', (e) => {
        if (w.parent || e.target.closest('button')) return;
        e.preventDefault();
        const rect = this.root.getBoundingClientRect();
        const k = rect.width / this.root.offsetWidth || 1; // 画面上の拡大率
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

    /* ----------UI部品の削除とかをここでやります---------- */

    removeWidget(args) {
      const id = str(args.ID).trim();
      const w = this.widgets.get(id);
      if (!w) return;
      for (const c of [...this.widgets.values()]) if (c.parent === id) this.removeWidget({ ID: c.id });
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
      this.clearToasts();
      this.events.clear();
    }

    place(w) {
      if (w.parent) return;
      // 座標はScratchと同じ、使いやすい...でしょう？
      w.root.style.left = 'calc(50% + ' + w.x + 'px)';
      w.root.style.top = 'calc(50% - ' + w.y + 'px)';
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
        for (let q = p; q; q = this.widgets.get(q.parent)) if (q === w) return; // 簡易な循環防止
        p.inner.append(w.root);
        w.parent = p.id;
        w.root.classList.remove('uitk-top');
        w.root.style.left = '';
        w.root.style.top = '';
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
      if (front) box.append(w.root); else box.prepend(w.root);
    }

    /* ---------- UIの部品？みたいな。装飾とか ---------- */

    setText(args) {
      const w = this.get(args.ID);
      if (w) this.setTextOf(w, str(args.TEXT));
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
      }
    }

    drawProgress(w) {
      const p = w.max > w.min ? clamp((w.num - w.min) / (w.max - w.min), 0, 1) : 0;
      w.bar.style.width = p * 100 + '%';
      // テキスト中の {p} は進捗率(%)に置き換わる...はず
      w.lab.textContent = w.text.replace(/\{p\}/g, Math.round(p * 100));
      w.root.setAttribute('aria-valuenow', Math.round(p * 100));
    }

    setValue(args) {
      const w = this.get(args.ID);
      if (!w) return;
      const v = args.VALUE;
      switch (w.type) {
        case 'input':
        case 'textarea':
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
          if ([...w.ctl.options].some((o) => o.value === str(v))) w.ctl.value = str(v);
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
      if (url && !(await Scratch.canFetch(url))) return; // 許可されたURL（data: など）のみ
      if (this.widgets.get(w.id) === w) w.root.src = url;
    }

    setOptions(args) {
      const w = this.get(args.ID);
      if (!w || w.type !== 'dropdown') return;
      const opts = parseList(args.OPTIONS);
      const cur = w.ctl.value;
      w.ctl.textContent = '';
      for (const o of opts) w.ctl.append(new Option(o, o));
      if (opts.includes(cur)) w.ctl.value = cur;
    }

    setRange(args) {
      const w = this.get(args.ID);
      if (!w) return;
      const min = num(args.MIN);
      const max = Math.max(min, num(args.MAX, 100));
      if (w.type === 'slider') {
        w.ctl.min = min;
        w.ctl.max = max;
        w.ctl.step = Math.max(num(args.STEP, 1), 0.000001);
        w.vEl.textContent = w.ctl.value;
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
        case 'color': s.color = v; break;
        case 'background': s.background = v; break;
        case 'accent':
          if (empty) {
            s.removeProperty('--ui-accent');
            s.removeProperty('--ui-on-accent');
          } else {
            s.setProperty('--ui-accent', v);
            s.setProperty('--ui-on-accent', onColor(v));
          }
          break;
        case 'borderColor':
          s.borderColor = v;
          if (!empty) {
            s.borderStyle = 'solid';
            if (!s.borderWidth) s.borderWidth = '1px';
          }
          break;
        case 'fontSize': s.fontSize = empty ? '' : clamp(num(v, 14), 4, 400) + 'px'; break;
        case 'radius': s.borderRadius = empty ? '' : Math.max(0, num(v)) + 'px'; break;
        case 'opacity': s.opacity = empty ? '' : clamp(num(v, 100), 0, 100) / 100; break;
        case 'padding': s.padding = empty ? '' : Math.max(0, num(v)) + 'px'; break;
        case 'align': s.textAlign = v; break;
        case 'tooltip': w.root.title = v; break;
        case 'placeholder': if (w.ctl && 'placeholder' in w.ctl) w.ctl.placeholder = v; break;
      }
    }

    setCSS(args) {
      const w = this.get(args.ID);
      if (w) w.root.style.cssText += ';' + str(args.CSS);
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

    /* ----------イベント系。正直ハットブロックはいらないと思ってる---------- */

    fire(w, kind) {
      this.last = { id: w.id, kind, value: this.readValue(w) };
      this.events.add(w.id + '|' + kind);
      this.events.add('*');
      runtime.startHats(HAT_EVENT);
      runtime.startHats(HAT_ANY);
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

    /* ----------取得などなど。---------- */

    readValue(w) {
      switch (w.type) {
        case 'input':
        case 'textarea':
        case 'dropdown': return w.ctl.value;
        case 'checkbox':
        case 'switch': return w.ctl.checked;
        case 'slider': return Number(w.ctl.value);
        case 'progress': return w.num;
        case 'image': return w.root.getAttribute('src') || '';
        default: return w.text;
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
        case 'text': return w.type === 'input' || w.type === 'textarea' ? w.ctl.value : w.text;
        case 'index': return w.type === 'dropdown' ? w.ctl.selectedIndex + 1 : 0;
        case 'x': return w.x;
        case 'y': return w.y;
        case 'width': return w.root.offsetWidth;
        case 'height': return w.root.offsetHeight;
        case 'visible': return !w.root.hidden;
        case 'enabled': return !w.root.inert;
        case 'type': return w.type;
        case 'parent': return w.parent;
        default: return '';
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
