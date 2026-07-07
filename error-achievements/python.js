// python.js — Pythonコードの実行層
// 1) PyodideをCDNから読み込み、本物のPythonで実行する
// 2) 読み込みに失敗した環境では、ルールベースの簡易シミュレータに
//    自動フォールバックする（オフラインでも4種のバッジが取れる）

const PY = {
  pyodide: null,
  loading: null,
  failed: false,

  // Pyodideの読み込みを開始（起動時に呼ぶ。失敗しても例外は投げない）
  init() {
    if (this.loading) return this.loading;
    this.loading = new Promise((resolve) => {
      const timeout = setTimeout(() => fail("タイムアウト"), 20000);
      const fail = () => {
        clearTimeout(timeout);
        this.failed = true;
        resolve(false);
      };
      try {
        const s = document.createElement("script");
        s.src = "https://cdn.jsdelivr.net/pyodide/v0.26.2/full/pyodide.js";
        s.onerror = fail;
        s.onload = async () => {
          try {
            this.pyodide = await loadPyodide({
              indexURL: "https://cdn.jsdelivr.net/pyodide/v0.26.2/full/",
            });
            clearTimeout(timeout);
            resolve(true);
          } catch (e) {
            fail();
          }
        };
        document.head.appendChild(s);
      } catch (e) {
        fail();
      }
    });
    return this.loading;
  },

  // コードを実行して統一形式の結果を返す
  // { ok, output, errorType, message, traceback, engine }
  async run(code, terminal) {
    if (this.pyodide) return this.runPyodide(code);
    return simulate(code, terminal);
  },

  async runPyodide(code) {
    const py = this.pyodide;
    try {
      // 標準出力をバッファに集める
      let out = [];
      py.setStdout({ batched: (s) => out.push(s) });
      py.setStderr({ batched: (s) => out.push(s) });
      // 毎回まっさらなグローバルで実行する
      await py.runPythonAsync(
        "import sys\n__g = {}\n", { globals: py.globals }
      );
      py.globals.set("__user_code", code);
      await py.runPythonAsync("exec(__user_code, {})");
      return { ok: true, output: out.join("\n"), engine: "pyodide" };
    } catch (e) {
      const tb = String(e.message || e);
      // Tracebackの最終行から「XxxError: ...」を取り出す
      const lines = tb.trim().split("\n");
      let errorType = "UnknownError", message = "";
      for (let i = lines.length - 1; i >= 0; i--) {
        const m = lines[i].match(/^([A-Za-z_]+(?:Error|Exception|Interrupt|Exit))\s*:?\s*(.*)$/);
        if (m) { errorType = m[1]; message = m[2]; break; }
      }
      // ModuleNotFoundErrorはImportErrorの一種としてバッジ判定する
      if (errorType === "ModuleNotFoundError") errorType = "ImportError";
      return { ok: false, errorType, message, traceback: tb, engine: "pyodide" };
    }
  },
};

// ------------------------------------------------------------------
// フォールバック簡易シミュレータ
// 「変更→エラー」の対応表＋軽い静的チェックで4種のエラーを再現する。
// 本物のPythonではないので、README記載の壊し方を確実に検出できる範囲に絞る
// ------------------------------------------------------------------


// ------------------------------------------------------------------
// フォールバック簡易シミュレータ
// 「変更→エラー」の対応表＋軽い静的チェックで10種のエラーを再現する。
// 本物のPythonではないので、答え.txt記載の壊し方を確実に検出できる範囲に絞る
// ------------------------------------------------------------------

const PY_BUILTINS = new Set([
  "print", "len", "range", "str", "int", "float", "input", "list",
  "dict", "set", "tuple", "type", "abs", "min", "max", "sum", "sorted",
  "True", "False", "None", "and", "or", "not", "in", "is",
  "if", "elif", "else", "for", "while", "def", "return", "import",
  "from", "pass", "break", "continue", "as",
]);

// フォールバックで「存在する」と見なすモジュールと、mathの主な中身
const PY_MODULES = new Set([
  "math", "random", "sys", "os", "json", "time", "re", "string",
  "itertools", "functools", "collections", "datetime",
]);
const MATH_ATTRS = new Set(["sqrt", "pi", "e", "floor", "ceil", "pow", "sin", "cos", "tan", "log", "fabs"]);

// 型ごとに「実在するメソッド」の一覧（これ以外は AttributeError）
const LIST_METHODS = new Set(["append", "pop", "remove", "insert", "sort", "count", "index", "extend", "clear", "reverse", "copy"]);
const STR_METHODS = new Set(["upper", "lower", "strip", "split", "join", "replace", "find", "count", "startswith", "endswith", "title", "capitalize", "format", "isdigit"]);
const DICT_METHODS = new Set(["get", "keys", "values", "items", "pop", "update", "clear", "copy", "setdefault"]);

function simulate(code, terminal) {
  const lines = code.replace(/\r\n/g, "\n").split("\n");
  const fake = (errorType, message, lineNo, lineText) => ({
    ok: false,
    errorType,
    message,
    traceback:
      `Traceback (most recent call last):\n  File "<stdin>", line ${lineNo}\n    ${(lineText || "").trim()}\n${errorType}: ${message}`,
    engine: "fallback",
  });

  // --- 1. IndentationError / SyntaxError（行構造のチェック） ---
  let expectIndent = false;
  let prevIndent = 0;
  const indentStack = [0];
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    if (raw.trim() === "" || raw.trim().startsWith("#")) continue;
    const indent = raw.match(/^[ \t]*/)[0].replace(/\t/g, "    ").length;
    const text = raw.trim();

    if (expectIndent) {
      if (indent <= prevIndent) {
        return fake("IndentationError", "expected an indented block", i + 1, raw);
      }
      indentStack.push(indent);
    } else {
      if (indent > indentStack[indentStack.length - 1]) {
        return fake("IndentationError", "unexpected indent", i + 1, raw);
      }
      while (indent < indentStack[indentStack.length - 1]) indentStack.pop();
      if (indent !== indentStack[indentStack.length - 1]) {
        return fake("IndentationError", "unindent does not match any outer indentation level", i + 1, raw);
      }
    }

    // ブロック開始行のチェック（コロン抜け → SyntaxError）
    const blockHead = text.match(/^(if|elif|else|for|while|def)\b/);
    if (blockHead) {
      if (!text.endsWith(":")) {
        return fake("SyntaxError", "expected ':'", i + 1, raw);
      }
      expectIndent = true;
      prevIndent = indent;
    } else {
      expectIndent = false;
    }

    // if文の中に代入（=）がある → SyntaxError
    if (/^(if|elif|while)\b/.test(text) && /[^=!<>]=[^=]/.test(text)) {
      return fake("SyntaxError", "invalid syntax. Maybe you meant '==' instead of '='?", i + 1, raw);
    }
  }

  // --- 2. SyntaxError（括弧・クォートの対応チェック） ---
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i];
    if (t.trim().startsWith("#")) continue;
    const stripped = t.replace(/(["'])(?:\\.|(?!\1).)*\1/g, "");
    if (/["']/.test(stripped)) {
      return fake("SyntaxError", "unterminated string literal", i + 1, t);
    }
    let depth = 0;
    for (const ch of stripped) {
      if ("([{".includes(ch)) depth++;
      if (")]}".includes(ch)) depth--;
      if (depth < 0) return fake("SyntaxError", "unmatched ')'", i + 1, t);
    }
    if (depth > 0) {
      return fake("SyntaxError", "'(' was never closed", i + 1, t);
    }
  }

  // 文字列を "" に潰し、コメントを外した行（識別子スキャン用）
  const strippedLines = lines.map((l) =>
    l.replace(/(["'])(?:\\.|(?!\1).)*\1/g, '""').replace(/#.*/, "")
  );
  // 文字列は残しつつコメントだけ外した行（値・キーの検査用）
  const rawLines = lines.map((l) => l.replace(/#.*/, ""));

  // --- 3. ImportError（存在しないモジュール・存在しない名前のimport） ---
  const defined = new Set(PY_BUILTINS);
  for (let i = 0; i < strippedLines.length; i++) {
    const t = strippedLines[i].trim();
    let m;
    if ((m = t.match(/^import\s+([A-Za-z_]\w*)/))) {
      if (!PY_MODULES.has(m[1])) {
        // 実際のPythonでは ModuleNotFoundError（ImportErrorの一種）
        return fake("ImportError", `No module named '${m[1]}'`, i + 1, lines[i]);
      }
      defined.add(m[1]);
    }
    if ((m = t.match(/^from\s+([A-Za-z_]\w*)\s+import\s+([A-Za-z_]\w*)/))) {
      if (!PY_MODULES.has(m[1])) {
        return fake("ImportError", `No module named '${m[1]}'`, i + 1, lines[i]);
      }
      if (m[1] === "math" && !MATH_ATTRS.has(m[2])) {
        return fake("ImportError", `cannot import name '${m[2]}' from 'math'`, i + 1, lines[i]);
      }
      defined.add(m[2]);
    }
  }

  // --- 4. NameError（未定義の名前の使用） ---
  for (const t of strippedLines) {
    let m;
    if ((m = t.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=[^=]/))) defined.add(m[1]);
    if ((m = t.match(/^\s*def\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(([^)]*)\)/))) {
      defined.add(m[1]);
      for (const p of m[2].split(",")) {
        const name = p.trim().split("=")[0].trim();
        if (name) defined.add(name);
      }
    }
    if ((m = t.match(/^\s*for\s+([A-Za-z_][A-Za-z0-9_]*)\s+in\b/))) defined.add(m[1]);
  }
  for (let i = 0; i < strippedLines.length; i++) {
    const line = strippedLines[i];
    for (const m of line.matchAll(/\b([A-Za-z_][A-Za-z0-9_]*)\b/g)) {
      const name = m[1];
      if (/^\d/.test(name)) continue;
      // ドットの直後は属性名なのでスキップ（items.push の push など）
      if (m.index > 0 && line[m.index - 1] === ".") continue;
      if (!defined.has(name)) {
        return fake("NameError", `name '${name}' is not defined`, i + 1, lines[i]);
      }
    }
  }

  // --- 変数の型と中身を簡易に追跡する ---
  const types = {};   // name -> {kind, len?, keys?}
  for (const t of rawLines) {
    let m;
    if ((m = t.match(/^\s*([A-Za-z_]\w*)\s*=\s*(["'].*["'])\s*$/))) types[m[1]] = { kind: "str" };
    else if ((m = t.match(/^\s*([A-Za-z_]\w*)\s*=\s*-?\d+(\.\d+)?\s*$/))) types[m[1]] = { kind: "num" };
    else if ((m = t.match(/^\s*([A-Za-z_]\w*)\s*=\s*\[(.*)\]\s*$/))) {
      const inner = m[2].trim();
      types[m[1]] = { kind: "list", len: inner === "" ? 0 : inner.split(",").length };
    }
    else if ((m = t.match(/^\s*([A-Za-z_]\w*)\s*=\s*\{(.*)\}\s*$/))) {
      const keys = new Set();
      for (const km of m[2].matchAll(/(["'])((?:\\.|(?!\1).)*)\1\s*:/g)) keys.add(km[2]);
      types[m[1]] = { kind: "dict", keys };
    }
  }
  const kindOf = (expr) => {
    expr = (expr || "").trim();
    if (/^(["']).*\1$/.test(expr)) return "str";
    if (/^-?\d+(\.\d+)?$/.test(expr)) return "num";
    if (/^\[.*\]$/.test(expr)) return "list";
    if (/^\{.*\}$/.test(expr)) return "dict";
    return types[expr] ? types[expr].kind : null;
  };

  // --- 5. TypeError（型が合わない操作の代表パターン） ---
  for (let i = 0; i < rawLines.length; i++) {
    const t = rawLines[i];
    // a + b / a - b で str と num の混在
    for (const m of t.matchAll(/([A-Za-z_]\w*|(["'])(?:\\.|(?!\2).)*\2|-?\d+(?:\.\d+)?)\s*([+\-])\s*([A-Za-z_]\w*|(["'])(?:\\.|(?!\5).)*\5|-?\d+(?:\.\d+)?)/g)) {
      const a = kindOf(m[1]), op = m[3], b = kindOf(m[4]);
      if (a && b && a !== b && (a === "str" || b === "str")) {
        const msg = op === "+"
          ? (a === "str" ? 'can only concatenate str (not "int") to str'
                         : "unsupported operand type(s) for +: 'int' and 'str'")
          : "unsupported operand type(s) for -: 'int' and 'str'";
        return fake("TypeError", msg, i + 1, lines[i]);
      }
    }
    // len(数値)
    let m2 = t.match(/len\(\s*(-?\d+(\.\d+)?|[A-Za-z_]\w*)\s*\)/);
    if (m2 && kindOf(m2[1]) === "num") {
      return fake("TypeError", "object of type 'int' has no len()", i + 1, lines[i]);
    }
    // 関数add(a,b)への文字列と数値の混在呼び出し（端末3の対応表）
    let m3 = t.match(/add\(\s*([^,]+)\s*,\s*([^)]+)\s*\)/);
    if (m3) {
      const a = kindOf(m3[1]), b = kindOf(m3[2]);
      if (a && b && a !== b && (a === "str" || b === "str")) {
        return fake("TypeError", "unsupported operand type(s) for +: 'int' and 'str'", i + 1, lines[i]);
      }
    }
  }

  // --- 6. ValueError（数字ではない文字列を数値に変換） ---
  for (let i = 0; i < rawLines.length; i++) {
    const m = rawLines[i].match(/\b(int|float)\(\s*(["'])((?:\\.|(?!\2).)*)\2\s*\)/);
    if (m && !/^-?\d+(\.\d+)?$/.test(m[3].trim())) {
      const base = m[1] === "int" ? " with base 10" : "";
      return fake("ValueError", `invalid literal for ${m[1]}()${base}: '${m[3]}'`, i + 1, lines[i]);
    }
  }

  // --- 7. AttributeError（型に存在しないメソッド・属性） ---
  for (let i = 0; i < strippedLines.length; i++) {
    for (const m of strippedLines[i].matchAll(/\b([A-Za-z_]\w*)\.([A-Za-z_]\w*)/g)) {
      const info = types[m[1]];
      if (!info) continue;                       // 型が分からない変数やモジュールは触らない
      const attr = m[2];
      const jp = { list: "list", str: "str", num: "int", dict: "dict" }[info.kind];
      const ok =
        (info.kind === "list" && LIST_METHODS.has(attr)) ||
        (info.kind === "str" && STR_METHODS.has(attr)) ||
        (info.kind === "dict" && DICT_METHODS.has(attr));
      if (!ok) {
        return fake("AttributeError", `'${jp}' object has no attribute '${attr}'`, i + 1, lines[i]);
      }
    }
  }

  // --- 8. KeyError（辞書に無いキー） ---
  for (let i = 0; i < rawLines.length; i++) {
    for (const m of rawLines[i].matchAll(/\b([A-Za-z_]\w*)\[\s*(["'])((?:\\.|(?!\2).)*)\2\s*\]/g)) {
      const info = types[m[1]];
      if (info && info.kind === "dict" && !info.keys.has(m[3])) {
        return fake("KeyError", `'${m[3]}'`, i + 1, lines[i]);
      }
    }
  }

  // --- 9. IndexError（リストの範囲外アクセス） ---
  for (let i = 0; i < strippedLines.length; i++) {
    for (const m of strippedLines[i].matchAll(/\b([A-Za-z_]\w*)\[\s*(\d+)\s*\]/g)) {
      const info = types[m[1]];
      if (info && info.kind === "list" && parseInt(m[2], 10) >= info.len) {
        return fake("IndexError", "list index out of range", i + 1, lines[i]);
      }
    }
  }

  // --- 10. ZeroDivisionError（0で割る） ---
  for (let i = 0; i < strippedLines.length; i++) {
    if (/(\/|%)\s*0(?!\d|\.)/.test(strippedLines[i])) {
      return fake("ZeroDivisionError", "division by zero", i + 1, lines[i]);
    }
  }

  // --- 11. エラーなし：無改変なら本来の出力、改変済みなら簡易メッセージ ---
  const normalized = (s) => s.replace(/\r\n/g, "\n").trim();
  if (terminal && normalized(code) === normalized(terminal.code)) {
    return { ok: true, output: terminal.expectedOutput, engine: "fallback" };
  }
  return {
    ok: true,
    output: "(簡易実行モード) エラーは検出されませんでした。",
    engine: "fallback",
  };
}
