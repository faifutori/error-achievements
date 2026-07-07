// sounds.js — サウンドエンジン
// 標準では Web Audio API でレトロ電子音をその場で合成する（ファイル不要）。
// assets/sounds/ に規定のファイル名のmp3があれば、自動でそちらを優先する。
//
// 対応ファイル（すべて任意。無ければ合成音）：
//   bgm.mp3      … ループ再生のBGM
//   jump.mp3     … ジャンプ
//   open.mp3     … 端末を開く
//   ok.mp3       … 正常実行
//   error.mp3    … エラー発生
//   descend.mp3  … バッジ降臨
//   collect.mp3  … バッジ取得
//   clear.mp3    … 全バッジ達成
//   hint.mp3     … ヒント表示

const SND = {
  ctx: null,
  master: null,
  bgmGain: null,
  sfxGain: null,
  files: {},            // name -> HTMLAudioElement（存在したものだけ）
  bgmPlaying: false,
  bgmTimer: null,
  settings: { bgm: true, sfx: true, volume: 0.85 },

  // 設定の読み書き（file://でlocalStorageが使えない環境でも落ちないように）
  loadSettings() {
    try {
      const s = JSON.parse(localStorage.getItem("ea-sound") || "null");
      if (s) this.settings = { ...this.settings, ...s };
    } catch (e) { /* 保存なしで続行 */ }
  },
  saveSettings() {
    try { localStorage.setItem("ea-sound", JSON.stringify(this.settings)); } catch (e) {}
  },

  // 最初のユーザー操作で呼ぶ（ブラウザの自動再生制限のため）
  init() {
    if (this.ctx) return;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain();
      this.master.connect(this.ctx.destination);
      this.bgmGain = this.ctx.createGain();
      this.bgmGain.connect(this.master);
      this.sfxGain = this.ctx.createGain();
      this.sfxGain.connect(this.master);
      this.applyVolume();
      if (this.settings.bgm) this.startBGM();
    } catch (e) { /* 音なしで続行 */ }
  },

  applyVolume() {
    if (!this.ctx) return;
    this.master.gain.value = this.settings.volume;
    this.bgmGain.gain.value = this.settings.bgm ? 0.8 : 0;
    this.sfxGain.gain.value = this.settings.sfx ? 1 : 0;
    const f = this.files.bgm;
    if (f) f.volume = this.settings.bgm ? this.settings.volume * 0.9 : 0;
  },

  // assets/sounds/ のmp3を探す（見つかったものだけ登録）
  loadFiles() {
    const names = ["bgm", "jump", "open", "ok", "error", "descend", "collect", "clear", "hint"];
    for (const n of names) {
      const a = new Audio();
      a.src = `assets/sounds/${n}.mp3`;
      a.addEventListener("canplaythrough", () => { this.files[n] = a; }, { once: true });
      a.addEventListener("error", () => {}, { once: true });
      if (n === "bgm") a.loop = true;
      a.load();
    }
  },

  // ---- 合成音のパーツ ----
  tone(freq, dur, { type = "square", vol = 0.2, slide = 0, delay = 0 } = {}) {
    if (!this.ctx || !this.settings.sfx) return;
    const t0 = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t0 + dur);
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(g); g.connect(this.sfxGain);
    osc.start(t0); osc.stop(t0 + dur + 0.02);
  },
  noise(dur, { vol = 0.15, delay = 0 } = {}) {
    if (!this.ctx || !this.settings.sfx) return;
    const t0 = this.ctx.currentTime + delay;
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const g = this.ctx.createGain();
    g.gain.value = vol;
    src.connect(g); g.connect(this.sfxGain);
    src.start(t0);
  },

  // ---- 効果音（mp3があればそれ、なければ合成） ----
  play(name) {
    if (!this.settings.sfx) return;
    const f = this.files[name];
    if (f) {
      try { f.currentTime = 0; f.volume = this.settings.volume; f.play(); } catch (e) {}
      return;
    }
    if (!this.ctx) return;
    switch (name) {
      case "jump":
        this.tone(220, 0.14, { slide: 260, vol: 0.28 });
        break;
      case "open":
        this.tone(520, 0.06, { vol: 0.22 });
        this.tone(780, 0.08, { vol: 0.22, delay: 0.06 });
        break;
      case "ok":
        this.tone(660, 0.08, { type: "sine", vol: 0.28 });
        this.tone(880, 0.12, { type: "sine", vol: 0.28, delay: 0.09 });
        break;
      case "error":
        this.tone(160, 0.22, { type: "sawtooth", vol: 0.35, slide: -60 });
        this.noise(0.15, { vol: 0.15 });
        break;
      case "descend": {
        // 天使の降臨：「フォ〜ン」と壮大にうねるコーラス風の和音
        const t0 = this.ctx.currentTime;
        const chord = [130.8, 196, 261.6, 329.6, 392, 523.3];   // Cメジャーを低音から積む
        for (let i = 0; i < chord.length; i++) {
          for (const detune of [-6, 0, 6]) {                     // 少しずらして重ねると合唱っぽくなる
            const osc = this.ctx.createOscillator();
            const g = this.ctx.createGain();
            osc.type = i < 2 ? "triangle" : "sine";
            osc.frequency.setValueAtTime(chord[i] * 0.94, t0);
            osc.frequency.exponentialRampToValueAtTime(chord[i], t0 + 1.2);  // 下からせり上がる
            osc.detune.value = detune;
            g.gain.setValueAtTime(0.0001, t0);
            g.gain.exponentialRampToValueAtTime(0.16, t0 + 0.9);             // ゆっくり膨らむ
            g.gain.exponentialRampToValueAtTime(0.0001, t0 + 3.0);           // 長く余韻
            osc.connect(g); g.connect(this.sfxGain);
            osc.start(t0); osc.stop(t0 + 3.1);
          }
        }
        // 高音のきらめきを上に散らす
        [1046, 1318, 1568, 2093].forEach((f2, i) =>
          this.tone(f2, 0.9, { type: "sine", vol: 0.16, delay: 0.7 + i * 0.18 }));
        break;
      }
      case "collect": {
        const notes = [659, 784, 988, 1318];
        notes.forEach((f2, i) =>
          this.tone(f2, 0.18, { type: "triangle", vol: 0.3, delay: i * 0.07 }));
        this.noise(0.1, { vol: 0.1, delay: 0.28 });
        break;
      }
      case "clear": {
        // ファンファーレ
        const seq = [[523, 0], [659, 0.15], [784, 0.3], [1046, 0.45], [1046, 0.7], [1318, 0.85]];
        for (const [f2, d] of seq) this.tone(f2, 0.35, { type: "square", vol: 0.26, delay: d });
        break;
      }
      case "hint":
        this.tone(440, 0.1, { type: "sine", vol: 0.22 });
        break;
    }
  },

  // ---- BGM（mp3があればループ再生、なければ静かなペンタトニックの環境音） ----
  startBGM() {
    if (!this.settings.bgm) return;
    const f = this.files.bgm;
    if (f) {
      f.volume = this.settings.volume * 0.9;
      f.play().catch(() => {});
      this.bgmPlaying = true;
      return;
    }
    if (!this.ctx || this.bgmPlaying) return;
    this.bgmPlaying = true;
    // ペンタトニック（Am）から静かに音を置いていく
    const scale = [220, 261.6, 293.7, 329.6, 392, 440, 523.3];
    const step = () => {
      if (!this.bgmPlaying || !this.settings.bgm) return;
      const n = scale[Math.floor(Math.random() * scale.length)];
      const t0 = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = n;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.16, t0 + 0.4);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 2.4);
      osc.connect(g); g.connect(this.bgmGain);
      osc.start(t0); osc.stop(t0 + 2.5);
      this.bgmTimer = setTimeout(step, 900 + Math.random() * 900);
    };
    step();
  },
  stopBGM() {
    this.bgmPlaying = false;
    clearTimeout(this.bgmTimer);
    const f = this.files.bgm;
    if (f) f.pause();
  },

  setBGM(on) {
    this.settings.bgm = on;
    this.saveSettings();
    this.applyVolume();
    if (on) this.startBGM(); else this.stopBGM();
  },
  setSFX(on) {
    this.settings.sfx = on;
    this.saveSettings();
    this.applyVolume();
  },
  setVolume(v) {
    this.settings.volume = v;
    this.saveSettings();
    this.applyVolume();
  },
};

SND.loadSettings();
SND.loadFiles();
