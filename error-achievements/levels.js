// levels.js — ステージ定義と端末データ
// タイルは32pxグリッド。1=地面ブロック、2=浮きブロック

const TILE = 32;

// ステージ（横に長い1枚マップ）。行×列の2次元配列
// 幅60タイル（1920px）、高さ11.25タイル（360px → 11行 + HUD余白）
const LEVEL_MAP = (() => {
  const W = 64, H = 12;
  const m = Array.from({ length: H }, () => Array(W).fill(0));
  // 地面（下2段）。浮きブロックは端末付近の衝突バグの原因になったため撤去
  for (let x = 0; x < W; x++) { m[10][x] = 1; m[11][x] = 1; }
  return m;
})();

// 端末の定義。x はタイル座標（足元は地面の上）
const TERMINALS = [
  {
    id: 0,
    x: 7,
    theme: "変数",
    desc: "変数に名前と値を入れて表示するコード。名前を打ち間違えたら何が起きる？",
    code: 'name = "python"\nlevel = 3\nprint("name:", name)\nprint("level:", level)\n',
    // フォールバック時、無改変で実行したときの出力
    expectedOutput: "name: python\nlevel: 3",
  },
  {
    id: 1,
    x: 22,
    theme: "条件分岐",
    desc: "if文でHPによって表示を変えるコード。コロンやインデントを消すとどうなる？",
    code: 'hp = 70\nif hp > 50:\n    print("元気です")\nelse:\n    print("休みましょう")\n',
    expectedOutput: "元気です",
  },
  {
    id: 2,
    x: 38,
    theme: "関数",
    desc: "2つの数を足す関数。数字の代わりに文字列を渡したら？",
    code: 'def add(a, b):\n    return a + b\n\nprint(add(2, 3))\n',
    expectedOutput: "5",
  },
  {
    id: 3,
    x: 54,
    theme: "データ構造",
    desc: "リストと辞書を使うコード。無い番号や無いキーを指定したら？ .pushを呼んだら？",
    code: 'items = ["sword", "shield", "herb"]\nstock = {"sword": 1, "herb": 3}\nprint(len(items))\nprint(items[0])\nprint(stock["herb"])\n',
    expectedOutput: "3\nsword\n3",
  },
];

// バッジ定義（10種）
const BADGES = [
  {
    error: "SyntaxError", name: "構文崩壊者", rarity: "Common",
    hint: "括弧やコロンなど、文法の一部を消してみよう",
    lesson: "SyntaxError：Pythonが文として読めないコードで出るエラー。括弧の閉じ忘れやコロン抜けが定番。",
  },
  {
    error: "IndentationError", name: "インデントの反逆者", rarity: "Common",
    hint: "行頭の字下げを消したり、余計に増やしてみよう",
    lesson: "IndentationError：字下げの深さがおかしいと出るエラー。Pythonではインデントが文法の一部。",
  },
  {
    error: "NameError", name: "幽霊変数使い", rarity: "Common",
    hint: "存在しない変数名を呼び出してみよう",
    lesson: "NameError：定義されていない名前を呼ぶと出るエラー。変数名の打ち間違いで最もよく遭遇する。",
  },
  {
    error: "TypeError", name: "型の反乱軍", rarity: "Common",
    hint: "数値と文字列を混ぜて計算させてみよう",
    lesson: "TypeError：型が合わない操作をすると出るエラー。数値と文字列の足し算などが典型。",
  },
  {
    error: "IndexError", name: "境界突破者", rarity: "Uncommon",
    hint: "リストの長さより大きい番号を指定してみよう",
    lesson: "IndexError：リストの範囲外の位置を読むと出るエラー。番号は0から始まることも思い出そう。",
  },
  {
    error: "KeyError", name: "鍵なき扉の探索者", rarity: "Uncommon",
    hint: "辞書に存在しないキーで開けようとしてみよう",
    lesson: "KeyError：辞書に無いキーを指定すると出るエラー。キーの綴り間違いでよく起きる。",
  },
  {
    error: "ImportError", name: "輸入禁止令の違反者", rarity: "Uncommon",
    hint: "存在しないモジュールをimportしてみよう",
    lesson: "ImportError：読み込めないモジュールを指定すると出るエラー。モジュール名の打ち間違いが典型。",
  },
  {
    error: "ValueError", name: "値の錬金術師", rarity: "Rare",
    hint: "数字ではない文字列をint()で数値に変えようとしてみよう",
    lesson: "ValueError：型は合っていても値が不正なときに出るエラー。int(\"abc\")が代表例。",
  },
  {
    error: "AttributeError", name: "属性迷宮の探索者", rarity: "Rare",
    hint: "リストに存在しないメソッド（.pushなど）を呼んでみよう",
    lesson: "AttributeError：その型に無いメソッドや属性を呼ぶと出るエラー。listにpush()は無い（appendが正解）。",
  },
  {
    error: "ZeroDivisionError", name: "ゼロ除算の勇者", rarity: "Epic",
    hint: "何かを0で割ってみよう",
    lesson: "ZeroDivisionError：0で割ると出るエラー。数学でもプログラムでも、ゼロ除算は定義できない。",
  },
];
