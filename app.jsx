/* 見えていた敗北 — 静的配信版
   React / ReactDOM は index.html の UMD で読み込む */
const { useState, useMemo, useEffect, useRef } = React;

/* =========================================================================
   見えていた敗北 — 1941年、計算は正しかった。通らなかっただけだ。
   OR体感型 意思決定シリアスゲーム / Phase 1 垂直スライス
   ========================================================================= */

/* ---------- 共有シミュレーションエンジン（両レンズが同一の関数を呼ぶ） ---------- */

const QUARTERS = [
  [1941, 4], [1942, 1], [1942, 2], [1942, 3], [1942, 4],
  [1943, 1], [1943, 2], [1943, 3], [1943, 4],
  [1944, 1], [1944, 2], [1944, 3], [1944, 4],
  [1945, 1], [1945, 2], [1945, 3],
];
const qLabel = (i) => `${QUARTERS[i][0]}年 第${QUARTERS[i][1]}四半期`;
const qShort = (i) => `${QUARTERS[i][0]}Q${QUARTERS[i][1]}`;

const LOSS_BASE = { 1941: 0.030, 1942: 0.042, 1943: 0.078, 1944: 0.165, 1945: 0.230 };
const YARD_CAP = { 1941: 6.5, 1942: 8.0, 1943: 20.0, 1944: 44.0, 1945: 30.0 };
const SOUTH_OIL = [0, 15, 55, 90, 110, 125, 130, 128, 120, 110, 95, 78, 60, 45, 30, 20];

const INIT = { T: 630.0, O: 840.0, steel: 145.0 };

function simulate({ shipSteel = 0.35, lockTurn = {}, noise = null, turns = 16 }) {
  let { T, O, steel } = INIT;
  const rows = [];
  let breach = null;
  const jitter = (base, sd) => (noise ? base * (1 + noise() * sd) : base);

  for (let i = 0; i < turns; i++) {
    const [y] = QUARTERS[i];
    const on = (k) => lockTurn[k] != null && i >= lockTurn[k];

    const steelBefore = steel;
    const weapon = steel * (1 - shipSteel);
    const strain = 1 + Math.max(0, (60 - weapon) / 60) * 0.40;
    const lossRate = jitter(LOSS_BASE[y], 0.18) * (on("convoy") ? 0.55 : 1) * strain;

    const T0 = T;
    const loss = T * lossRate;
    const yardCap = YARD_CAP[y];
    const steelToShips = steel * shipSteel * 0.52;
    const build = Math.min(yardCap, steelToShips);
    const yardBound = steelToShips > yardCap;
    T = Math.max(T - loss + build, 0);

    const tankerShare = 0.10 * (on("unified") ? 1.25 : 1);
    const capacity = T * tankerShare * 1.45;
    const oilIn = Math.min(capacity, jitter(SOUTH_OIL[i], 0.15));
    const oilOut = 118 * (on("withdraw") ? 0.78 : 1);
    O = O + oilIn - oilOut;

    steel = Math.min(155.0, T * 0.26);

    rows.push({
      i, T, T0, O, steel, steelBefore, loss, build, delta: build - loss,
      oilIn, oilOut, capacity, lossRate, yardCap, steelToShips, yardBound, weapon, strain,
    });
    if (breach === null && O <= 0) breach = i;
    if (O <= -200) break;
  }
  return { rows, breach };
}

/* 標準正規乱数 */
function gauss() {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/* ---------- 制約ロック ---------- */

const LOCKS = [
  {
    key: "convoy",
    name: "海上護衛の優先",
    detail: "護衛の軍艦を輸送船団に付け、船団そのものを大きくする。潜水艦に見つかって沈められるのは主に船団の外側なので、船団を大きくしても被害は増えず、割合としては減る。護衛艦を増やさずに効果が出る。",
    barrier: "海軍は「主力艦どうしの決戦で勝負を決める」という考え方を取っている。輸送船の護衛は地味な後方任務とされ、駆逐艦をそちらに回すのは格が落ちると見なされている。",
    credit: 30,
    window: [0, 7],
  },
  {
    key: "unified",
    name: "船腹の一元管理",
    detail: "陸軍・海軍・民間でばらばらに割り当てられている船を、一か所でまとめて配る。空のまま戻る航海がなくなり、実際に運べる量が25％増える。",
    barrier: "陸軍と海軍の縄張り争い。船を差し出すことは、自分の取り分を手放すことに等しい。",
    credit: 55,
    window: [0, 5],
  },
  {
    key: "withdraw",
    name: "中国からの撤兵",
    detail: "アメリカとの交渉で最大の障害になっているものを取り除く。石油の輸出停止が解かれる道が開き、戦線が縮むぶん消費も減る。",
    barrier: "既に払った犠牲。ここで退けば、これまでの戦死者に何と言うのか。",
    credit: 85,
    window: [0, 1],
  },
];

/* ---------- 閣僚 ---------- */

const MINISTERS = [
  {
    id: "army",
    name: "陸軍省 軍務局長",
    trait: "面子",
    portrait: "陸",
    rule: "面子を損なう提案は、どんな数字を添えても通さない",
    fallback: {
      reject: "数字は承った。だが貴官は、これまで散った将兵に何と申し開きをするのか。撤兵などという言葉を、この部屋で二度と口にされるな。",
      accept: "……不本意ではあるが、貴官の申されることには一貫性がある。今回に限り、預かろう。",
    },
  },
  {
    id: "navy",
    name: "海軍省 軍務局長",
    trait: "所管",
    portrait: "海",
    rule: "数字では動くが、自分の担当範囲の外には一切動かない",
    fallback: {
      reject: "船腹の総量については、貴官の計算に誤りは見当たらん。だがそれは企画院の所管である。海軍の駆逐艦をどう使うかは、海軍が決める。",
      accept: "護衛に艦を回すことは本意ではない。だが貴官の見立ては、これまで外れておらん。試みる価値はあろう。",
    },
  },
  {
    id: "cabinet",
    name: "企画院 総裁",
    trait: "同調",
    portrait: "企",
    rule: "自ら判断せず、陸海軍のいずれかが動いた場合にのみ動く",
    fallback: {
      reject: "この場の空気を、貴官もお読みいただきたい。両省がその意向でない以上、企画院として単独に申し上げられることはない。",
      accept: "両省がその方向であるならば、企画院として資材の手当は致します。",
    },
  },
];

/* ---------- パレット ---------- */

const P41 = {
  bg: "#C9BFA3", paper: "#DED5BC", paper2: "#D3C9AE",
  ink: "#222C4A", ink2: "#4E5878", ink3: "#7A8098",
  rule: "#A2957A", red: "#9E2B25",
};
const P26 = {
  bg: "#070A12", panel: "#0E1422", panel2: "#141C2E", line: "#1F2B45",
  text: "#C9D4E8", dim: "#66779A", cyan: "#38D6E0", red: "#E24B3F", amber: "#E8A33D",
};

/* =========================================================================
   小部品
   ========================================================================= */

function Stamp({ text, color, angle = -12 }) {
  return (
    <div
      className="inline-block px-4 py-2"
      style={{
        border: `3px double ${color}`, color, transform: `rotate(${angle}deg)`,
        fontWeight: 700, letterSpacing: "0.3em", opacity: 0.85,
      }}
    >
      {text}
    </div>
  );
}

function Num({ v, digits = 0, color }) {
  return (
    <span style={{ fontFamily: "ui-monospace, monospace", color }}>
      {v.toLocaleString("ja-JP", { minimumFractionDigits: digits, maximumFractionDigits: digits })}
    </span>
  );
}

/* =========================================================================
   用語 — 当時の言葉に、現代語の注釈を添える
   ========================================================================= */

const GLOSSARY = {
  "船腹": "国が持っている輸送船の合計。当時の公文書の言い方で、いまなら「輸送船の総量」。単位は万総トン。",
  "総トン": "船の大きさを表す単位。積める荷物の量にほぼ比例する。1万総トンでおおよそ大型貨物船1〜2隻分。",
  "万kl": "石油の量の単位。1万klは、家庭用の風呂おけ約5万杯分。当時の日本は年間およそ500万klを消費していた。",
  "船台": "造船所で船を組み立てる台。数が限られているため、鉄がいくらあっても同時に造れる船の数には上限がある。",
  "還送": "占領地から資源を船で運んで持ち帰ること。いまなら「輸入」に近いが、自国の勢力圏内から運ぶ点が違う。",
  "損耗率": "一定期間に失われる割合。ここでは、持っている輸送船のうち何％が沈むか。",
  "積算表": "手作業で数字を積み上げて集計した表。いまの表計算ソフトにあたるものを、紙と算盤でやっていた。",
  "上申": "下の者が上の者へ意見や報告を差し出すこと。",
  "所管": "その役所が担当を持つ範囲。範囲の外のことには、正しくても口を出さない。",
  "一元管理": "ばらばらに分かれている資源の割り当てを、一か所にまとめて決めること。",
  "禁輸": "輸出を止めること。1941年、米国は日本への石油の輸出を止めた。",
  "模擬内閣": "本物の内閣を真似た演習。総力戦研究所では、若手が各大臣役を務めて政策を決める訓練をしていた。",
  "較正": "自分の言う確率が、実際の的中率とどれだけ合っているか。「80％」と言ったことの80％が当たれば較正が良い。",
  "ブライアスコア": "予測のずれを測る点数。0に近いほど正確。当たったのに自信が低かった場合も、外れたのに自信が高かった場合も減点される。",
  "モンテカルロ法": "先が読めない部分を乱数で振り、同じ計算を何千回も繰り返して、結果の散らばりを調べる方法。",
  "感度分析": "どの条件をどれだけ動かすと結果がどれだけ変わるかを、一つずつ比べる方法。効くレバーと効かないレバーが分かる。",
  "パレート最適": "誰かの取り分を減らさない限り、他の誰の取り分も増やせない状態。これ以上うまい分け方がない配分。",
};

let openGlossary = () => {};

function T({ w, children }) {
  const key = w || children;
  return (
    <button
      onClick={(e) => { e.stopPropagation(); openGlossary(key); }}
      style={{
        borderBottom: "1px dotted currentColor", color: "inherit",
        font: "inherit", padding: 0, background: "none", cursor: "help",
      }}
      title="用語の説明">
      {children}
    </button>
  );
}

function GlossaryLayer({ era }) {
  const [term, setTerm] = useState(null);
  const [list, setList] = useState(false);
  useEffect(() => { openGlossary = (k) => setTerm(k); }, []);
  const dark = era !== 1941;
  const bg = dark ? P26.panel : P41.paper;
  const fg = dark ? P26.text : P41.ink;
  const sub = dark ? P26.dim : P41.ink3;
  const line = dark ? P26.line : P41.rule;

  return (
    <>
      <button onClick={() => setList(true)}
        className="fixed px-3 py-2"
        style={{
          right: 12, bottom: 12, zIndex: 40, background: bg,
          border: `1px solid ${line}`, color: sub, fontSize: 11, letterSpacing: "0.15em",
        }}>
        用語
      </button>

      {(term || list) && (
        <div className="fixed inset-0 flex items-end justify-center p-4"
          style={{ background: "rgba(0,0,0,0.55)", zIndex: 50 }}
          onClick={() => { setTerm(null); setList(false); }}>
          <div className="w-full max-w-md p-5 overflow-y-auto"
            style={{ background: bg, border: `1px solid ${line}`, maxHeight: "72vh" }}
            onClick={(e) => e.stopPropagation()}>
            {term ? (
              <>
                <div style={{ color: fg, fontSize: 18, marginBottom: 10 }}>{term}</div>
                <p style={{ color: fg, fontSize: 13, lineHeight: 2 }}>{GLOSSARY[term] || "—"}</p>
                <button onClick={() => { setTerm(null); setList(true); }}
                  className="mt-5 px-3 py-2"
                  style={{ border: `1px solid ${line}`, color: sub, fontSize: 11 }}>
                  用語の一覧へ
                </button>
              </>
            ) : (
              <>
                <div style={{ color: fg, fontSize: 14, letterSpacing: "0.2em" }} className="mb-4">用語</div>
                <div className="space-y-4">
                  {Object.entries(GLOSSARY).map(([k, v]) => (
                    <div key={k}>
                      <div style={{ color: fg, fontSize: 13 }}>{k}</div>
                      <div style={{ color: sub, fontSize: 11, lineHeight: 1.9 }}>{v}</div>
                    </div>
                  ))}
                </div>
              </>
            )}
            <button onClick={() => { setTerm(null); setList(false); }}
              className="mt-6 w-full px-4 py-3"
              style={{ background: dark ? P26.cyan : P41.ink, color: dark ? "#04202a" : P41.paper, fontSize: 12, letterSpacing: "0.2em" }}>
              閉じる
            </button>
          </div>
        </div>
      )}
    </>
  );
}

/* =========================================================================
   フェーズ 0 — 表題
   ========================================================================= */

function Title({ onNext }) {
  return (
    <div className="min-h-screen flex items-center justify-center px-6 py-16"
      style={{ background: P41.bg }}>
      <div className="max-w-xl w-full">
        <div style={{ color: P41.ink3, letterSpacing: "0.5em", fontSize: 11 }} className="mb-8">
          総力戦研究所 第一回 模擬内閣演習
        </div>
        <h1 className="mb-6" style={{
          color: P41.ink, fontFamily: "serif", fontSize: 46, lineHeight: 1.25,
          fontWeight: 400, letterSpacing: "0.08em",
        }}>
          見えていた敗北
        </h1>
        <div style={{ height: 1, background: P41.rule }} className="mb-6" />
        <p style={{ color: P41.ink2, fontFamily: "serif", fontSize: 16, lineHeight: 2 }}>
          一九四一年、計算は正しかった。<br />通らなかっただけだ。
        </p>
        <p style={{ color: P41.ink2, fontSize: 13, lineHeight: 2.1 }} className="mt-10">
          あなたに肩書はない。机が一つと、企画院から回ってきた帳簿が一冊あるだけだ。
          誰もあなたが何者か知らないので、誰も、あなたの言うことをどれだけ信じてよいか知らない。
        </p>
        <button onClick={onNext} className="mt-12 px-8 py-3"
          style={{ background: P41.ink, color: P41.paper, letterSpacing: "0.2em", fontSize: 13 }}>
          着席する
        </button>
      </div>
    </div>
  );
}

/* =========================================================================
   フェーズ 1 — 予言
   ========================================================================= */

function Prophecy({ onNext }) {
  const [v, setV] = useState(3);
  return (
    <div className="min-h-screen flex items-center justify-center px-6 py-16" style={{ background: P41.bg }}>
      <div className="max-w-xl w-full">
        <div style={{ color: P41.ink3, letterSpacing: "0.4em", fontSize: 11 }} className="mb-6">
          着席前の記録
        </div>
        <h2 style={{ color: P41.ink, fontFamily: "serif", fontSize: 26, lineHeight: 1.6 }} className="mb-4">
          計算を始める前に、一つだけ書き留めておく。
        </h2>
        <p style={{ color: P41.ink2, fontSize: 13, lineHeight: 2 }} className="mb-10">
          日本は、あと何年戦えると思うか。まだ何の説明も受けていない段階でよい。
          勘で構わないので、いま思う数字を置いてほしい。この数字は封筒に入れて預かり、
          演習の最後にあなた自身へ返される。
        </p>

        <div className="mb-3 flex items-end justify-between">
          <span style={{ color: P41.ink2, fontSize: 12 }}>あと</span>
          <span style={{ color: P41.ink, fontFamily: "ui-monospace, monospace", fontSize: 40 }}>
            {v.toFixed(1)}<span style={{ fontSize: 16 }}> 年</span>
          </span>
        </div>
        <input type="range" min="0.5" max="8" step="0.5" value={v}
          onChange={(e) => setV(parseFloat(e.target.value))}
          className="w-full" style={{ accentColor: P41.ink }} />
        <div className="flex justify-between mt-1" style={{ color: P41.ink3, fontSize: 10 }}>
          <span>半年</span><span>八年</span>
        </div>

        <button onClick={() => onNext(v)} className="mt-12 px-8 py-3"
          style={{ background: P41.ink, color: P41.paper, letterSpacing: "0.2em", fontSize: 13 }}>
          封をして、説明を受ける
        </button>
      </div>
    </div>
  );
}

/* =========================================================================
   フェーズ 1.5 — 着任説明（何を任され、何を判断するのか）
   ========================================================================= */

const LOOP_NODES = {
  forward: [
    { a: -90, t: "輸送船がある", s: "630万総トン" },
    { a: 0,   t: "資源を運べる", s: "石炭・鉄鉱石・石油" },
    { a: 90,  t: "鉄鋼が作れる", s: "運べた量で決まる" },
    { a: 180, t: "船が造れる", s: "鉄鋼から" },
  ],
  reverse: [
    { a: -90, t: "輸送船が減る", s: "沈む量が上回る" },
    { a: 180, t: "造れる船が減る", s: "材料が足りない" },
    { a: 90,  t: "鉄鋼が減る", s: "鉄鉱石が届かない" },
    { a: 0,   t: "運べる量が減る", s: "船が足りない" },
  ],
};

function LoopDiagram({ mode = "forward", interactive = false, onMode }) {
  const [local, setLocal] = useState(mode);
  const m = onMode ? mode : local;
  const set = (v) => (onMode ? onMode(v) : setLocal(v));
  const rev = m === "reverse";

  const cx = 130, cy = 112, r = 66, ri = 40;
  const col = rev ? P41.red : P41.ink2;
  const nodes = LOOP_NODES[m].map((n) => ({
    ...n,
    x: cx + r * Math.cos((n.a * Math.PI) / 180),
    y: cy + r * Math.sin((n.a * Math.PI) / 180),
  }));

  const pt = (a) => [cx + ri * Math.cos((a * Math.PI) / 180), cy + ri * Math.sin((a * Math.PI) / 180)];
  const arc = (a1, a2, sweep) => {
    const [x1, y1] = pt(a1), [x2, y2] = pt(a2);
    return `M ${x1.toFixed(1)} ${y1.toFixed(1)} A ${ri} ${ri} 0 0 ${sweep} ${x2.toFixed(1)} ${y2.toFixed(1)}`;
  };
  const segs = rev
    ? [[-90, -180], [-180, -270], [-270, -360], [-360, -450]].map(([a, b]) => arc(a - 18, b + 18, 0))
    : [[-90, 0], [0, 90], [90, 180], [180, 270]].map(([a, b]) => arc(a + 18, b - 18, 1));

  /* 円環は常に同じ一本（時計回り）。逆回りは keyPoints で再生方向を反転する。
     sweep フラグを 0 にすると弧の中心が弦の反対側へ移り、軌道が円環からずれる。 */
  const ring =
    `M ${cx} ${cy - ri} ` +
    `A ${ri} ${ri} 0 0 1 ${cx} ${cy + ri} ` +
    `A ${ri} ${ri} 0 0 1 ${cx} ${cy - ri}`;

  return (
    <div style={{ width: "100%", maxWidth: 300 }}>
      <svg viewBox="0 0 260 236" className="w-full">
        <defs>
          <marker id={`ah-${m}`} markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
            <path d="M0,0 L6,3 L0,6 z" fill={col} />
          </marker>
          <marker id="ahr" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
            <path d="M0,0 L7,3.5 L0,7 z" fill={P41.red} />
          </marker>
        </defs>

        {segs.map((d, i) => (
          <path key={i} d={d} fill="none" stroke={col} strokeWidth={rev ? 1.8 : 1.1}
            markerEnd={`url(#ah-${m})`} opacity={rev ? 0.95 : 0.75} />
        ))}

        {/* 回る点で向きを示す */}
        <circle r="3.2" fill={col}>
          <animateMotion
            key={m}
            dur={rev ? "3s" : "5s"}
            repeatCount="indefinite"
            path={ring}
            calcMode="linear"
            keyPoints={rev ? "1;0" : "0;1"}
            keyTimes="0;1" />
        </circle>

        <text x={cx} y={cy - 4} textAnchor="middle" fill={col} fontSize="9" letterSpacing="2">
          {rev ? "逆回り" : "順回り"}
        </text>
        <text x={cx} y={cy + 8} textAnchor="middle" fill={rev ? P41.red : P41.ink3} fontSize="8">
          差引 {rev ? "−" : "＋"}
        </text>

        {nodes.map((n, i) => (
          <g key={i}>
            <rect x={n.x - 47} y={n.y - 15} width="94" height="30"
              fill={P41.paper} stroke={i === 0 ? (rev ? P41.red : P41.ink) : P41.rule}
              strokeWidth={i === 0 ? 2 : 1} />
            <text x={n.x} y={n.y - 2} textAnchor="middle" fill={rev ? P41.red : P41.ink} fontSize="10">{n.t}</text>
            <text x={n.x} y={n.y + 9} textAnchor="middle" fill={P41.ink3} fontSize="7">{n.s}</text>
          </g>
        ))}

        <line x1="130" y1="14" x2="130" y2="29" stroke={P41.red} strokeWidth="1.6" markerEnd="url(#ahr)" />
        <text x="137" y="13" fill={P41.red} fontSize="8">潜水艦・空襲で沈む</text>

        <text x={cx} y="228" textAnchor="middle" fill={P41.ink3} fontSize="8">
          {rev
            ? "配分を変えても、速さが変わるだけで向きは戻らない"
            : "四つは輪になっている。どこか一つが増えれば、隣も増える"}
        </text>
      </svg>

      {interactive && (
        <div className="flex gap-1 mt-1">
          {[["forward", "差引が＋のとき"], ["reverse", "差引が−になったら"]].map(([k, l]) => (
            <button key={k} onClick={() => set(k)} className="flex-1 py-2"
              style={{
                border: `1px solid ${m === k ? (k === "reverse" ? P41.red : P41.ink) : P41.rule}`,
                background: m === k ? (k === "reverse" ? P41.red : P41.ink) : "transparent",
                color: m === k ? P41.paper : P41.ink2, fontSize: 11,
              }}>
              {l}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const BRIEF = [
  {
    tag: "〇",
    head: "このゲームで問われること",
    body: [
      "問われるのは計算力ではない。",
      "正しい数字に、いつ辿り着けるか。そしてそれを、誰に、どうやって飲ませるか。",
      "この演習は二周ある。一周目は算盤で、二周目は現代の道具で、まったく同じ問題を解く。",
      "答えが変わるかどうかは、やってみれば分かる。",
    ],
  },
  {
    tag: "一",
    head: "あなたが呼ばれた理由",
    body: [
      "一九四一年十二月。あなたは総力戦研究所に机を一つ与えられた。肩書はない。",
      "任務は一つ。この戦争が資源の面で何年もつのかを計算し、模擬内閣に報告すること。",
      "計算の道具は算盤と、企画院から回ってきた帳簿だけだ。",
    ],
  },
  {
    tag: "二",
    head: "帳簿に載っている三つの数字",
    body: [
      "輸送船 — 資源を運ぶ船の総量。いま630万総トン。",
      "石油 — 残っている備蓄。いま840万kl。艦も飛行機も工場もこれで動く。",
      "鉄鋼 — 四半期あたりに生産できる量。船にも兵器にもなる。",
      "この三つは独立していない。ここが今回の要点だ。",
    ],
  },
  {
    tag: "三",
    head: "三つは輪になっている",
    diagram: "forward",
    body: [
      "船があるから資源を運べる。運べるから鉄が作れる。鉄があるから船が造れる。そしてまた資源を運べる。",
      "この輪が回っているあいだは、国はもつ。",
    ],
  },
  {
    tag: "四",
    head: "輪は、逆にも回る",
    diagram: "compare",
    body: [
      "船は沈む。造る量より沈む量が多くなった瞬間——帳簿の「差引」が負に転じた瞬間、同じ輪が逆向きに回り出す。",
      "船が減れば資源が運べない。資源が運べなければ鉄が作れない。鉄が作れなければ船が造れない。そして船はさらに減る。",
      "この輪には、外から手を入れる場所がない。増やすべきものが、増やすための手段そのものを兼ねているからだ。鉄を増やそうにも、鉄鉱石を運ぶ船がない。船を造ろうにも、その鉄がない。",
      "一度この向きに回り始めれば、配分をどう組み替えても速さが変わるだけで、向きは戻らない。国はもたない。それが、この一枚の意味だ。",
      "上のボタンで、二つの向きを見比べてほしい。",
    ],
  },
  {
    tag: "五",
    head: "あなたが動かせるもの",
    body: [
      "鉄鋼を造船に何％回すか。操作できるのは、これ一つだけだ。",
      "残りは兵器に回る。造船に寄せすぎれば前線が崩れ、船はかえって早く沈む。",
      "先の展開を通しで計算する「試算」もできるが、算盤では一件に数週間かかる。演習期間中に三回まで。",
    ],
  },
  {
    tag: "六",
    head: "毎四半期、あなたがすること",
    steps: [
      "鉄鋼の配分を決める",
      "次の四半期に沈む船の量を予測し、どれくらい自信があるかを書く",
      "帳簿を締めて次の期へ進む",
    ],
    body: [
      "これを六期くり返したあと、あなたは模擬内閣に呼ばれ、結論を述べることになる。",
    ],
  },
  {
    tag: "七",
    head: "見るべき欄は一つ",
    body: [
      "帳簿の「差引」を見ること。造れた船から沈んだ船を引いた数だ。",
      "ここが負に転じた瞬間、さきほどの輪が逆回りを始める。この演習で最初の分かれ目だ。",
      "なお、道具は最初から全部は渡さない。必要になった段になって、一つずつ机に置かれる。",
      "では、始めてもらおう。",
    ],
  },
];

function Briefing({ onNext, onSkip }) {
  const [i, setI] = useState(0);
  const b = BRIEF[i];
  const last = i === BRIEF.length - 1;

  return (
    <div className="min-h-screen px-5 py-10" style={{ background: P41.bg }}>
      <div className="max-w-lg mx-auto">
        <div className="flex items-baseline justify-between mb-1">
          <span style={{ color: P41.ink3, fontSize: 10, letterSpacing: "0.35em" }}>着任説明</span>
          <span style={{ color: P41.ink3, fontSize: 10 }}>{i + 1} / {BRIEF.length}</span>
        </div>
        <div className="flex gap-1 mb-6">
          {BRIEF.map((_, k) => (
            <div key={k} style={{ flex: 1, height: 2, background: k <= i ? P41.ink : P41.rule }} />
          ))}
        </div>

        <div className="p-5" style={{ background: P41.paper, border: `1px solid ${P41.rule}` }}>
          <div className="flex items-baseline gap-3 mb-4">
            <span style={{ color: P41.red, fontFamily: "serif", fontSize: 15 }}>{b.tag}</span>
            <h2 style={{ color: P41.ink, fontFamily: "serif", fontSize: 20, letterSpacing: "0.05em" }}>{b.head}</h2>
          </div>

          {b.diagram && (
            <div className="flex justify-center my-4">
              <LoopDiagram
                mode={b.diagram === "compare" ? "reverse" : "forward"}
                interactive={b.diagram === "compare"} />
            </div>
          )}

          {b.steps && (
            <div className="mb-4 space-y-2">
              {b.steps.map((t, k) => (
                <div key={k} className="flex gap-3 items-start">
                  <span className="shrink-0 flex items-center justify-center"
                    style={{ width: 20, height: 20, border: `1px solid ${P41.ink2}`, color: P41.ink, fontSize: 10 }}>
                    {k + 1}
                  </span>
                  <span style={{ color: P41.ink, fontSize: 13, lineHeight: 1.6 }}>{t}</span>
                </div>
              ))}
            </div>
          )}

          {b.body.map((t, k) => (
            <p key={k} className="mb-3" style={{ color: P41.ink2, fontSize: 13, lineHeight: 2 }}>{t}</p>
          ))}
        </div>

        <div className="flex gap-2 mt-6">
          {i > 0 && (
            <button onClick={() => setI(i - 1)} className="px-5 py-3"
              style={{ border: `1px solid ${P41.ink2}`, color: P41.ink2, fontSize: 12 }}>
              戻る
            </button>
          )}
          <button onClick={() => (last ? onNext() : setI(i + 1))} className="flex-1 px-6 py-3"
            style={{ background: P41.ink, color: P41.paper, letterSpacing: "0.2em", fontSize: 13 }}>
            {last ? "帳簿を開く" : "次へ"}
          </button>
        </div>
        <button onClick={onSkip} className="mt-3 w-full py-2"
          style={{ color: P41.ink3, fontSize: 11 }}>
          説明を飛ばす
        </button>
      </div>
    </div>
  );
}

/* =========================================================================
   ロック一覧（両レンズで共用。見えているが触れない、が要点）
   ========================================================================= */

function LockPanel({ era, credit, lockTurn, turn, onUnlock }) {
  const pal = era === 1941 ? P41 : P26;
  const [open, setOpen] = useState(null);

  return (
    <div>
      <div className="flex items-baseline justify-between mb-3">
        <span style={{ color: era === 1941 ? P41.ink3 : P26.dim, fontSize: 10, letterSpacing: "0.3em" }}>
          前提条件 — 動かせないことになっているもの
        </span>
        <span style={{ color: era === 1941 ? P41.ink3 : P26.dim, fontSize: 10 }}>
          いまの信用 <Num v={credit} />
        </span>
      </div>
      <div className="space-y-2">
        {LOCKS.map((L) => {
          const done = lockTurn[L.key] != null;
          const inWindow = turn >= L.window[0] && turn <= L.window[1];
          const hasCredit = credit >= L.credit;
          const can = !done && inWindow && hasCredit;
          const expired = !done && turn > L.window[1];
          const isOpen = open === L.key;

          const border = done
            ? (era === 1941 ? P41.ink : P26.cyan)
            : (era === 1941 ? P41.rule : P26.line);

          return (
            <div key={L.key} style={{ border: `1px solid ${border}`, opacity: expired ? 0.4 : 1 }}>
              <button onClick={() => setOpen(isOpen ? null : L.key)}
                className="w-full text-left px-3 py-2 flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <span style={{ color: done ? (era === 1941 ? P41.ink : P26.cyan) : (era === 1941 ? P41.ink3 : P26.dim), fontSize: 13 }}>
                    {done ? "◆" : "◇"}
                  </span>
                  <span style={{ color: era === 1941 ? P41.ink : P26.text, fontSize: 13 }}>{L.name}</span>
                </span>
                <span style={{ color: era === 1941 ? P41.ink3 : P26.dim, fontSize: 10 }}>
                  {done ? "解除済" : expired ? "機会は過ぎた" : `要信用 ${L.credit}`}
                </span>
              </button>

              {isOpen && (
                <div className="px-3 pb-3" style={{ borderTop: `1px dashed ${border}` }}>
                  <p className="mt-2" style={{ color: era === 1941 ? P41.ink2 : P26.text, fontSize: 11, lineHeight: 1.9 }}>
                    {L.detail}
                  </p>
                  <p className="mt-2" style={{ color: era === 1941 ? P41.red : P26.amber, fontSize: 11, lineHeight: 1.9 }}>
                    障害 — {L.barrier}
                  </p>
                  <p className="mt-2" style={{ color: era === 1941 ? P41.ink3 : P26.dim, fontSize: 10 }}>
                    提起できる期間: {qShort(L.window[0])} 〜 {qShort(L.window[1])}
                  </p>
                  {!done && (
                    <button
                      disabled={!can}
                      onClick={() => can && onUnlock(L.key)}
                      className="mt-3 px-4 py-2 w-full"
                      style={{
                        background: can ? (era === 1941 ? P41.ink : P26.cyan) : "transparent",
                        color: can ? (era === 1941 ? P41.paper : "#04202a") : (era === 1941 ? P41.ink3 : P26.dim),
                        border: can ? "none" : `1px dashed ${border}`,
                        fontSize: 11, letterSpacing: "0.15em",
                      }}>
                      {expired ? "機会は過ぎた"
                        : !inWindow ? "まだ提起の場がない"
                        : !hasCredit ? `信用が足りない（${credit} / ${L.credit}）`
                        : "議題に載せる"}
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* =========================================================================
   計算の中身を見せる — スライダーの裏で何をしているか
   ========================================================================= */

function Formula({ era, lines }) {
  const dark = era !== 1941;
  return (
    <div className="mt-3 p-3" style={{
      background: dark ? P26.panel2 : P41.paper2,
      border: `1px dashed ${dark ? P26.line : P41.rule}`,
    }}>
      {lines.map((l, i) => (
        <div key={i} style={{
          fontFamily: "ui-monospace, monospace", fontSize: 11, lineHeight: 1.85,
          whiteSpace: "pre-wrap", overflowWrap: "anywhere",
          paddingLeft: l.ind ? 14 : 0, textIndent: l.ind ? -14 : 0,
          color: l.hi ? (dark ? P26.cyan : P41.red) : (dark ? P26.text : P41.ink2),
        }}>
          {l.t}
        </div>
      ))}
    </div>
  );
}

/* 造船量と喪失量の計算内訳 */
function SteelMath({ era, row, shipSteel }) {
  const [open, setOpen] = useState(false);
  const dark = era !== 1941;
  const f = (x, d = 1) => x.toFixed(d);

  const pc = Math.round(shipSteel * 100);
  const lines = [
    { t: `【造船】` },
    { t: `造船に回した鉄` },
    { t: `= ${f(row.steelBefore)} × ${pc}％ = ${f(row.steelBefore * shipSteel)} 万トン`, ind: true },
    { t: `鉄からできる船` },
    { t: `= ${f(row.steelBefore * shipSteel)} × 0.52 = ${f(row.steelToShips)} 万総トン`, ind: true },
    { t: `船台で組める上限 = ${f(row.yardCap)} 万総トン` },
    { t: `造船量`, hi: true },
    { t: `= min(${f(row.steelToShips)}, ${f(row.yardCap)}) = ${f(row.build)} 万総トン`, ind: true, hi: true },
    {
      t: row.yardBound ? `↑ 船台が上限。鉄を増やしても船は増えない`
                       : `↑ 鉄が上限。鉄を増やせば船も増える`,
      hi: true,
    },
    { t: `` },
    { t: `【喪失】` },
    { t: `兵器に回した鉄` },
    { t: `= ${f(row.steelBefore)} × ${100 - pc}％ = ${f(row.weapon)} 万トン`, ind: true },
    { t: `前線の負荷`, hi: row.strain > 1.02 },
    { t: `= 1 + max(0, (60 − ${f(row.weapon)}) ÷ 60) × 0.40`, ind: true, hi: row.strain > 1.02 },
    {
      t: `= ${f(row.strain, 2)} ${row.strain > 1.02 ? "（兵器が不足し前線が崩れている）" : "（兵器は足りている）"}`,
      ind: true, hi: row.strain > 1.02,
    },
    { t: `損耗率` },
    { t: `= 基準 ${(row.lossRate / row.strain * 100).toFixed(1)}％ × ${f(row.strain, 2)} = ${(row.lossRate * 100).toFixed(1)}％`, ind: true },
    { t: `喪失量`, hi: true },
    { t: `= ${f(row.T0)} × ${(row.lossRate * 100).toFixed(1)}％ = ${f(row.loss)} 万総トン`, ind: true, hi: true },
    { t: `` },
    { t: `差引 = ${f(row.build)} − ${f(row.loss)} = ${row.delta > 0 ? "＋" : "−"}${f(Math.abs(row.delta))}`, hi: true },
  ];

  return (
    <div className="mt-3">
      <button onClick={() => setOpen(!open)} className="w-full text-left px-3 py-2"
        style={{
          border: `1px solid ${dark ? P26.line : P41.rule}`,
          color: dark ? P26.dim : P41.ink3, fontSize: 11,
        }}>
        {open ? "▾" : "▸"} この数字はどう出しているのか
      </button>
      {open && (
        <>
          <Formula era={era} lines={lines} />
          <p className="mt-2" style={{
            color: dark ? P26.dim : P41.ink3, fontSize: 10, lineHeight: 1.8,
          }}>
            {row.yardBound
              ? "いま効いているのは船台の数であって、鉄の量ではない。ここを取り違えると、効かないレバーを握り続けることになる。"
              : "いまは鉄の量が効いている。ただし造船に寄せすぎると兵器が減り、前線の負荷が上がって喪失が増える。"}
          </p>
        </>
      )}
    </div>
  );
}

/* =========================================================================
   算盤 — 手計算の労力を画面に出す
   ========================================================================= */

function Abacus({ tick }) {
  const rods = 7;
  return (
    <svg viewBox="0 0 168 62" style={{ width: "100%", maxWidth: 210 }}>
      <rect x="2" y="2" width="164" height="58" fill="none" stroke={P41.ink} strokeWidth="1.5" />
      <line x1="2" y1="21" x2="166" y2="21" stroke={P41.ink} strokeWidth="1.5" />
      {Array.from({ length: rods }).map((_, r) => {
        const x = 14 + r * 23;
        const up = (tick * (r + 2)) % 3 === 0;
        const lows = [0, 1, 2, 3].map((k) => ((tick * (r + 1) + k * 3) % 7 < 3 ? 1 : 0));
        return (
          <g key={r}>
            <line x1={x} y1="4" x2={x} y2="58" stroke={P41.rule} strokeWidth="1" />
            <ellipse cx={x} cy={up ? 16 : 8} rx="7" ry="3.6" fill={P41.ink}
              style={{ transition: "cy 120ms linear" }} />
            {lows.map((v, k) => (
              <ellipse key={k} cx={x} cy={(v ? 27 : 34) + k * 6.2} rx="7" ry="3.6"
                fill={P41.ink2} style={{ transition: "cy 120ms linear" }} />
            ))}
          </g>
        );
      })}
    </svg>
  );
}

function AbacusWork({ value, onDone }) {
  const [tick, setTick] = useState(0);
  const STEPS = 46;

  useEffect(() => {
    const id = setInterval(() => {
      setTick((t) => {
        if (t >= STEPS) { clearInterval(id); onDone(); return t; }
        return t + 1;
      });
    }, 105);
    return () => clearInterval(id);
  }, []);

  const preview = useMemo(() => simulate({ shipSteel: value, turns: 16 }).rows, [value]);
  const shown = Math.min(Math.floor(tick / 2.6), preview.length);
  const weeks = (tick / STEPS) * 3.4;
  const cells = Math.floor((tick / STEPS) * 168);

  return (
    <div>
      <div className="flex justify-center mb-3"><Abacus tick={tick} /></div>

      <div className="flex justify-between mb-2" style={{ color: P41.ink3, fontSize: 10 }}>
        <span>積算した升目 <span style={{ fontFamily: "ui-monospace, monospace", color: P41.ink }}>{cells}</span></span>
        <span>経過 <span style={{ fontFamily: "ui-monospace, monospace", color: P41.ink }}>{weeks.toFixed(1)}</span> 週</span>
      </div>

      <div className="px-2 py-2" style={{
        background: P41.paper2, border: `1px solid ${P41.rule}`,
        height: 108, overflow: "hidden", display: "flex", flexDirection: "column-reverse",
      }}>
        {preview.slice(0, shown).reverse().map((r) => (
          <div key={r.i} style={{
            fontFamily: "ui-monospace, monospace", fontSize: 10, lineHeight: 1.7,
            color: r.O <= 0 ? P41.red : P41.ink2, whiteSpace: "pre",
          }}>
            {qShort(r.i).padEnd(8)}船{String(Math.round(r.T)).padStart(4)}  油{String(Math.round(r.O)).padStart(4)}
          </div>
        ))}
      </div>

      <div className="mt-2" style={{ height: 3, background: P41.rule }}>
        <div style={{ width: `${(tick / STEPS) * 100}%`, height: "100%", background: P41.ink }} />
      </div>
      <div className="mt-2" style={{ color: P41.ink3, fontSize: 10 }}>
        算盤で一期ずつ積み上げている。{shown} / {preview.length} 期
      </div>
    </div>
  );
}

/* =========================================================================
   信用の帯 — 「一向に動かない」ことを常に見せる
   ========================================================================= */

function CreditStrip({ era, credit, submitted, resolved }) {
  const dark = era !== 1941;
  const frozen = era === 1941;
  const fg = dark ? P26.text : P41.ink;
  const sub = dark ? P26.dim : P41.ink3;
  const line = dark ? P26.line : P41.rule;
  const acc = frozen ? P41.red : dark ? P26.cyan : P41.ink;

  return (
    <div className="mt-3 pt-3" style={{ borderTop: `1px dashed ${line}` }}>
      <div className="flex items-baseline justify-between mb-2">
        <span style={{ color: sub, fontSize: 10, letterSpacing: "0.2em" }}>あなたの信用</span>
        <span style={{ color: acc, fontFamily: "ui-monospace, monospace", fontSize: 15 }}>
          {credit} / 100
        </span>
      </div>

      <div className="relative" style={{ height: 8, background: dark ? P26.panel2 : P41.paper2 }}>
        <div style={{ width: `${credit}%`, height: "100%", background: acc, opacity: 0.85 }} />
        {LOCKS.map((L) => (
          <div key={L.key} className="absolute" style={{
            left: `${L.credit}%`, top: -3, bottom: -3, width: 1,
            background: credit >= L.credit ? acc : (dark ? P26.dim : P41.ink3),
          }} />
        ))}
      </div>
      <div className="relative mt-1" style={{ height: 12 }}>
        {LOCKS.map((L) => (
          <span key={L.key} className="absolute" style={{
            left: `${L.credit}%`, transform: "translateX(-50%)",
            color: credit >= L.credit ? acc : sub, fontSize: 8, whiteSpace: "nowrap",
          }}>
            {L.credit}
          </span>
        ))}
      </div>

      <div className="mt-2" style={{ color: frozen ? P41.red : sub, fontSize: 10, lineHeight: 1.8 }}>
        {frozen ? (
          <>
            提出した見通し <b style={{ fontFamily: "ui-monospace, monospace" }}>{submitted}</b> 件 ／
            答え合わせ済み <b style={{ fontFamily: "ui-monospace, monospace" }}>0</b> 件
            <div>
              {submitted === 0
                ? "当たったかどうかが分かるのは、決定が下されたずっと後になる。"
                : `${submitted}件出したが、信用は 20 のまま動いていない。`}
            </div>
          </>
        ) : (
          <>
            提出 <b style={{ fontFamily: "ui-monospace, monospace" }}>{submitted}</b> 件 ／
            答え合わせ済み <b style={{ fontFamily: "ui-monospace, monospace" }}>{resolved}</b> 件
          </>
        )}
      </div>
    </div>
  );
}

/* =========================================================================
   期の切り替え — 「期が進んだ」を身体で分からせる
   ========================================================================= */

const KEYFRAMES = `
@keyframes vp-sheet   { from { transform: translateY(26px); opacity: 0 } to { transform: translateY(0); opacity: 1 } }
@keyframes vp-stamp   { 0% { transform: scale(2.6) rotate(-24deg); opacity: 0 }
                        55% { transform: scale(0.92) rotate(-11deg); opacity: 1 }
                        75% { transform: scale(1.04) rotate(-13deg) }
                        100% { transform: scale(1) rotate(-12deg); opacity: 1 } }
@keyframes vp-rule    { from { width: 0 } to { width: 100% } }
@keyframes vp-rise    { from { transform: translateY(10px); opacity: 0 } to { transform: translateY(0); opacity: 1 } }
@keyframes vp-veil    { from { opacity: 0 } to { opacity: 1 } }
@keyframes vp-scan    { from { transform: translateY(-110%) } to { transform: translateY(110%) } }
@keyframes vp-tick    { 0%,100% { opacity: 1 } 50% { opacity: 0.25 } }
@media (prefers-reduced-motion: reduce) {
  [class^="vp-"], [class*=" vp-"] { animation-duration: 0.01ms !important; animation-iteration-count: 1 !important }
}
`;

function TurnTransition({ era, toTurn, notes, credit, onDone }) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setReady(true), 1500 + notes.length * 150 + (credit ? 500 : 0));
    return () => clearTimeout(t);
  }, []);

  const dark = era !== 1941;
  const [y, q] = QUARTERS[toTurn];
  const kanji = ["", "一", "二", "三", "四"][q];
  const yKanji = String(y).split("").map((d) => "〇一二三四五六七八九"[+d]).join("");

  if (dark) {
    return (
      <div className="fixed inset-0 flex items-center justify-center overflow-hidden px-6"
        style={{ background: P26.bg, zIndex: 60, animation: "vp-veil 220ms ease-out both" }}>
        <div className="absolute inset-x-0" style={{
          height: 2, background: P26.cyan, opacity: 0.55,
          animation: "vp-scan 1.1s cubic-bezier(.4,0,.2,1) 2 both",
        }} />
        <div className="text-center px-6">
          <div style={{
            color: P26.dim, fontSize: 10, letterSpacing: "0.4em",
            animation: "vp-tick 0.7s steps(1) 2 both",
          }}>
            再計算しています
          </div>
          <div style={{
            color: P26.cyan, fontFamily: "ui-monospace, monospace", fontSize: 44, marginTop: 10,
            animation: "vp-rise 420ms 260ms cubic-bezier(.2,.9,.2,1) both",
          }}>
            {y}Q{q}
          </div>
          <div className="mx-auto" style={{
            height: 1, background: P26.line, marginTop: 14, maxWidth: 220,
            animation: "vp-rule 620ms 380ms cubic-bezier(.2,.9,.2,1) both",
          }} />
          <div className="mt-4 space-y-1">
            {notes.map((n, i) => (
              <div key={i} style={{
                color: P26.text, fontSize: 12,
                animation: `vp-rise 380ms ${560 + i * 110}ms cubic-bezier(.2,.9,.2,1) both`,
              }}>
                {n}
              </div>
            ))}
          </div>
          <button onClick={onDone} disabled={!ready}
            className="mt-8 px-8 py-3 w-full" style={{
              maxWidth: 260,
              background: ready ? P26.cyan : "transparent",
              border: ready ? "none" : `1px dashed ${P26.line}`,
              color: ready ? "#04202a" : P26.dim,
              fontSize: 12, letterSpacing: "0.2em",
              transition: "background 260ms ease, color 260ms ease",
            }}>
            {ready ? `${y}Q${q} へ進む` : "計算中"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center px-6 py-8 overflow-y-auto"
      style={{ background: P41.bg, zIndex: 60, animation: "vp-veil 200ms ease-out both" }}>
      <div className="w-full max-w-sm p-7 text-center" style={{
        background: P41.paper, border: `1px solid ${P41.rule}`,
        animation: "vp-sheet 520ms cubic-bezier(.2,.9,.2,1) both",
      }}>
        <div style={{ color: P41.ink3, fontSize: 10, letterSpacing: "0.4em" }}>前期の帳簿を締めた</div>

        <div className="my-5 flex justify-center">
          <div style={{ animation: "vp-stamp 700ms 340ms cubic-bezier(.3,1.5,.4,1) both" }}>
            <div className="px-5 py-3" style={{ border: `3px double ${P41.red}`, color: P41.red }}>
              <div style={{ fontSize: 11, letterSpacing: "0.3em" }}>{yKanji}年</div>
              <div style={{ fontSize: 21, fontFamily: "serif", letterSpacing: "0.15em" }}>
                第{kanji}四半期
              </div>
            </div>
          </div>
        </div>

        <div className="mx-auto" style={{
          height: 1, background: P41.rule,
          animation: "vp-rule 700ms 900ms cubic-bezier(.2,.9,.2,1) both",
        }} />

        <div className="mt-4 space-y-1">
          {notes.map((n, i) => (
            <div key={i} style={{
              color: P41.ink2, fontSize: 12, lineHeight: 1.9,
              animation: `vp-rise 420ms ${1080 + i * 150}ms cubic-bezier(.2,.9,.2,1) both`,
            }}>
              {n}
            </div>
          ))}
        </div>

        {credit && (
          <div className="mt-4 px-3 py-2" style={{
            border: `1px solid ${P41.red}`, color: P41.red, fontSize: 11, lineHeight: 1.8,
            animation: `vp-rise 460ms ${1080 + notes.length * 150 + 220}ms cubic-bezier(.2,.9,.2,1) both`,
          }}>
            {credit}
          </div>
        )}

        <button onClick={onDone} disabled={!ready} className="mt-7 w-full px-6 py-3"
          style={{
            background: ready ? P41.ink : "transparent",
            border: ready ? "none" : `1px dashed ${P41.rule}`,
            color: ready ? P41.paper : P41.ink3,
            fontSize: 12, letterSpacing: "0.2em",
            transition: "background 300ms ease, color 300ms ease",
          }}>
          {ready ? `${yKanji}年 第${kanji}四半期 を開く` : "帳簿を綴じています"}
        </button>
      </div>
    </div>
  );
}

/* =========================================================================
   任務バー — 「いま何をしているのか」を常に画面に置く
   ========================================================================= */

function ObjectiveBar({ era, turn, turns, goal, step, credit, submitted, resolved }) {
  const dark = era !== 1941;
  const bg = dark ? P26.panel : P41.paper;
  const fg = dark ? P26.text : P41.ink;
  const sub = dark ? P26.dim : P41.ink3;
  const line = dark ? P26.line : P41.rule;
  const acc = dark ? P26.cyan : P41.ink;

  return (
    <div className="mb-5 px-4 py-3" style={{ background: bg, border: `1px solid ${line}` }}>
      <div style={{ color: sub, fontSize: 9, letterSpacing: "0.3em" }} className="mb-1">任務</div>
      <div style={{ color: fg, fontSize: 12, lineHeight: 1.7 }}>{goal}</div>
      <div className="flex items-center gap-2 mt-3">
        <div className="flex-1 flex gap-1">
          {Array.from({ length: turns }).map((_, k) => (
            <div key={k} style={{ flex: 1, height: 3, background: k <= turn ? acc : line }} />
          ))}
        </div>
        <span style={{ color: sub, fontSize: 10, fontFamily: "ui-monospace, monospace" }}>
          {turn + 1}/{turns}
        </span>
      </div>
      {step && (
        <div className="mt-2" style={{ color: acc, fontSize: 11 }}>▸ いま — {step}</div>
      )}
      {credit != null && (
        <CreditStrip era={era} credit={credit} submitted={submitted} resolved={resolved} />
      )}
    </div>
  );
}

/* 新しい道具が出てきたときの説明カード */
function Unveil({ era, title, why, children, onClose }) {
  const dark = era !== 1941;
  return (
    <div className="mb-3 p-4" style={{
      background: dark ? P26.panel2 : P41.paper,
      border: `2px solid ${dark ? P26.cyan : P41.ink}`,
    }}>
      <div style={{ color: dark ? P26.cyan : P41.red, fontSize: 10, letterSpacing: "0.25em" }} className="mb-2">
        新しく使えるようになった
      </div>
      <div style={{ color: dark ? P26.text : P41.ink, fontSize: 15, fontFamily: dark ? "inherit" : "serif" }} className="mb-2">
        {title}
      </div>
      <p style={{ color: dark ? P26.text : P41.ink2, fontSize: 12, lineHeight: 2 }}>{why}</p>
      {children}
      <button onClick={onClose} className="mt-3 px-4 py-2"
        style={{
          background: dark ? P26.cyan : P41.ink,
          color: dark ? "#04202a" : P41.paper, fontSize: 11, letterSpacing: "0.15em",
        }}>
        分かった
      </button>
    </div>
  );
}

/* =========================================================================
   フェーズ 2 — 1941 レンズ
   ========================================================================= */

const BANDS = [
  { key: "low",  l41: "二十万トン未満",   l26: "20万トン未満",     test: (x) => x < 20 },
  { key: "mid",  l41: "二十〜四十万トン", l26: "20〜40万トン",     test: (x) => x >= 20 && x < 40 },
  { key: "high", l41: "四十万トン以上",   l26: "40万トン以上",     test: (x) => x >= 40 },
];

function Lens1941({ onDone }) {
  const TURNS = 6;
  const [shipSteel, setShipSteel] = useState(0.35);
  const [turn, setTurn] = useState(0);
  const [whatIfLeft, setWhatIfLeft] = useState(3);
  const [whatIf, setWhatIf] = useState(null);
  const [preds, setPreds] = useState([]);
  const [pending, setPending] = useState(null);
  const [computing, setComputing] = useState(false); // false | 配分値
  const [notedFlip, setNotedFlip] = useState(false);
  const [opened, setOpened] = useState({});
  const [coach, setCoach] = useState(true);
  const [guide, setGuide] = useState(false);
  const [seen, setSeen] = useState({});
  const [trans, setTrans] = useState(null);
  const [est, setEst] = useState(null);

  const sim = useMemo(() => simulate({ shipSteel, turns: TURNS }), [shipSteel]);
  const rows = sim.rows.slice(0, turn + 1);
  const cur = sim.rows[turn];

  const runWhatIf = (v) => {
    if (whatIfLeft <= 0) return;
    setComputing(v);
    setWhatIfLeft((n) => n - 1);
  };

  const submitPred = (band, conf) => {
    setPreds((p) => [...p, { turn, band, conf, resolved: false }]);
    setPending(null);
    if (turn + 1 < TURNS) {
      const r = sim.rows[turn];
      setTrans({
        to: turn + 1,
        notes: [
          `この期に沈められた船 ${r.loss.toFixed(1)} 万総トン`,
          `新しく造れた船 ${r.build.toFixed(1)} 万総トン`,
          `差引 ${r.delta > 0 ? "＋" : "−"}${Math.abs(r.delta).toFixed(1)} 万総トン`,
        ],
        credit: `見通しを ${preds.length + 1} 件提出 — 信用 20 → 20（変わらず）`,
      });
    } else {
      onDone({ shipSteel, preds: [...preds, { turn, band, conf }], notedFlip, opened });
    }
  };

  const flipped = cur && cur.delta < 0;

  if (trans) {
    return (
      <TurnTransition era={1941} toTurn={trans.to} notes={trans.notes} credit={trans.credit}
        onDone={() => { setTurn(trans.to); setCoach(false); setTrans(null); window.scrollTo(0, 0); }} />
    );
  }

  return (
    <div className="min-h-screen px-5 py-8" style={{ background: P41.bg }}>
      <div className="max-w-2xl mx-auto">
        <div className="flex items-baseline justify-between mb-1">
          <span style={{ color: P41.ink3, fontSize: 10, letterSpacing: "0.35em" }}>資材動員計画 <T>積算表</T></span>
          <span style={{ color: P41.ink2, fontSize: 11 }}>{qLabel(turn)}</span>
        </div>
        <div style={{ height: 2, background: P41.ink, opacity: 0.6 }} className="mb-5" />

        <ObjectiveBar era={1941} turn={turn} turns={TURNS}
          goal="この戦争が資源の面で何年もつのかを見極め、六期後に模擬内閣へ報告する。"
          step={pending ? "次の四半期に沈む船の量を予測する" : "鉄鋼の配分を決め、帳簿を締める"}
          credit={20} submitted={preds.length} resolved={0} />

        {/* 初回コーチ */}
        {coach && turn === 0 && (
          <div className="mb-5 p-4" style={{ background: P41.paper, border: `2px solid ${P41.ink}` }}>
            <div style={{ color: P41.ink, fontSize: 13, fontFamily: "serif" }} className="mb-2">
              この期にやること
            </div>
            <div className="space-y-2 mb-3">
              {[
                "下の「鉄鋼の配分」を決める。造船に回すか、兵器に回すか",
                "帳簿の「差引」欄を見る。造れた船から沈んだ船を引いた数だ",
                "いちばん下で、次の四半期に沈む船の量を予測して締める",
              ].map((t, k) => (
                <div key={k} className="flex gap-3 items-start">
                  <span className="shrink-0 flex items-center justify-center"
                    style={{ width: 18, height: 18, border: `1px solid ${P41.ink2}`, color: P41.ink, fontSize: 9 }}>
                    {k + 1}
                  </span>
                  <span style={{ color: P41.ink2, fontSize: 12, lineHeight: 1.7 }}>{t}</span>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <button onClick={() => setCoach(false)} className="px-4 py-2"
                style={{ background: P41.ink, color: P41.paper, fontSize: 11, letterSpacing: "0.15em" }}>
                分かった
              </button>
              <button onClick={() => setGuide(true)} className="px-4 py-2"
                style={{ border: `1px solid ${P41.ink2}`, color: P41.ink2, fontSize: 11 }}>
                三つの数字の関係をもう一度
              </button>
            </div>
          </div>
        )}

        {/* 手引き（輪の図） */}
        {guide && (
          <div className="fixed inset-0 flex items-center justify-center p-5"
            style={{ background: "rgba(0,0,0,0.5)", zIndex: 45 }} onClick={() => setGuide(false)}>
            <div className="p-5 w-full max-w-sm" style={{ background: P41.paper, border: `1px solid ${P41.ink}` }}
              onClick={(e) => e.stopPropagation()}>
              <div style={{ color: P41.ink, fontFamily: "serif", fontSize: 16 }} className="mb-2">三つは輪になっている</div>
              <div className="flex justify-center">
                <LoopDiagram mode={notedFlip ? "reverse" : "forward"} interactive />
              </div>
              <p className="mt-2" style={{ color: P41.ink2, fontSize: 12, lineHeight: 1.9 }}>
                差引が負に転じた瞬間、同じ輪が逆に回り出す。どこから手を入れても、隣がすでに減っている。
              </p>
              <button onClick={() => setGuide(false)} className="mt-4 w-full py-3"
                style={{ background: P41.ink, color: P41.paper, fontSize: 12, letterSpacing: "0.2em" }}>
                閉じる
              </button>
            </div>
          </div>
        )}

        {/* 帳簿 */}
        <div className="overflow-x-auto mb-6" style={{ background: P41.paper, border: `1px solid ${P41.rule}` }}>
          <table className="w-full" style={{ fontSize: 12, borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: `2px solid ${P41.ink}` }}>
                {[["期", ""], ["船腹", "輸送船の総量"], ["造船", "新しく造れた分"],
                  ["喪失", "沈められた分"], ["差引", "増減"], ["石油", "残っている量"], ["鉄鋼", "造れる量"]].map(([h, sub]) => (
                  <th key={h} className="px-2 py-2" style={{ color: P41.ink, fontWeight: 400, fontSize: 10, letterSpacing: "0.1em" }}>
                    <div>{h === "船腹" ? <T>船腹</T> : h}</div>
                    {sub && <div style={{ color: P41.ink3, fontSize: 8, fontWeight: 400, letterSpacing: 0 }}>{sub}</div>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.i} style={{ borderBottom: `1px solid ${P41.rule}`, background: r.i === turn ? P41.paper2 : "transparent" }}>
                  <td className="px-2 py-2" style={{ color: P41.ink2, fontSize: 10 }}>{qShort(r.i)}</td>
                  <td className="px-2 py-2 text-right"><Num v={r.T} color={P41.ink} /></td>
                  <td className="px-2 py-2 text-right"><Num v={r.build} digits={1} color={P41.ink2} /></td>
                  <td className="px-2 py-2 text-right"><Num v={r.loss} digits={1} color={P41.ink2} /></td>
                  <td className="px-2 py-2 text-right" style={{ fontWeight: 700 }}>
                    <Num v={r.delta} digits={1} color={r.delta < 0 ? P41.red : P41.ink} />
                  </td>
                  <td className="px-2 py-2 text-right"><Num v={r.O} color={P41.ink} /></td>
                  <td className="px-2 py-2 text-right"><Num v={r.steel} color={P41.ink2} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="px-2 py-1" style={{ color: P41.ink3, fontSize: 9 }}>
            単位 — 船の量は<T>万総トン</T>（1万総トンで大型貨物船1〜2隻分）、石油は<T>万kl</T>、鉄鋼は万トン
          </div>
        </div>

        {flipped && !notedFlip && (
          <div className="mb-6 p-4" style={{ border: `2px solid ${P41.red}`, background: P41.paper }}>
            <div style={{ color: P41.red, fontSize: 13, fontFamily: "serif", lineHeight: 1.9 }}>
              差引が負に転じている。造る量より、沈む量が多い。
            </div>
            <p className="mt-2 mb-3" style={{ color: P41.ink2, fontSize: 11, lineHeight: 1.9 }}>
              説明で見た輪が、いま逆に回り始めた。
            </p>
            <div className="flex justify-center mb-3">
              <LoopDiagram mode="reverse" />
            </div>
            <p style={{ color: P41.ink2, fontSize: 11, lineHeight: 1.9 }}>
              船が減れば鉄の材料が運べず、鉄が減れば船が造れず、船が減れば石油も運べない。
              増やすべきものが、増やす手段を兼ねている。この輪に外から手を入れる場所はない。
            </p>
            <p className="mt-2" style={{ color: P41.red, fontSize: 12, lineHeight: 1.9, fontFamily: "serif" }}>
              配分をどう組み替えても、速さが変わるだけで向きは戻らない。国はもたない。
            </p>
            <button onClick={() => setNotedFlip(true)} className="mt-3 px-4 py-2"
              style={{ background: P41.red, color: P41.paper, fontSize: 11, letterSpacing: "0.15em" }}>
              帳簿に書き付ける
            </button>
          </div>
        )}

        {/* 唯一のレバー */}
        <div className="mb-6 p-4" style={{ background: P41.paper, border: `1px solid ${P41.rule}` }}>
          <div className="mb-3">
            <div style={{ color: P41.ink, fontSize: 13 }}>鉄鋼の配分</div>
            <div style={{ color: P41.ink3, fontSize: 10, lineHeight: 1.7 }}>
              限られた鉄を、船に回すか、兵器に回すか。あなたが自分の判断で動かせるのはこの一つだけ。
            </div>
          </div>
          <div className="flex items-baseline justify-between mb-2">
            <span style={{ color: P41.ink3, fontSize: 10 }}>船 ← → 兵器</span>
            <span style={{ color: P41.ink2, fontSize: 11, fontFamily: "ui-monospace, monospace" }}>
              造船 {Math.round(shipSteel * 100)}％ / 兵器 {Math.round((1 - shipSteel) * 100)}％
            </span>
          </div>
          <input type="range" min="0.05" max="0.9" step="0.05" value={shipSteel}
            onChange={(e) => setShipSteel(parseFloat(e.target.value))}
            className="w-full" style={{ accentColor: P41.ink }} />
          <p className="mt-2" style={{ color: P41.ink3, fontSize: 10, lineHeight: 1.8 }}>
            造船に回せば船は増えるが、<T>船台</T>（船を組み立てる台）の数に限りがあるため天井がある。
            兵器を削りすぎれば前線が崩れ、船はかえって多く沈む。
          </p>
          <SteelMath era={1941} row={cur} shipSteel={shipSteel} />
        </div>

        {/* 試算 — 二期目から */}
        {turn >= 1 && !seen.whatif && (
          <Unveil era={1941} title="先を計算してみる"
            why="一期分の帳簿では、この先どうなるかは分からない。配分をある値に固定したまま終戦まで通したら石油はいつ尽きるのか——それを調べるのが「試算」だ。ただし算盤での計算なので、一件に数週間かかる。演習中に三回まで。"
            onClose={() => setSeen((x) => ({ ...x, whatif: true }))} />
        )}
        {turn >= 1 && (
        <div className="mb-6 p-4" style={{ background: P41.paper, border: `1px solid ${P41.rule}` }}>
          <div className="mb-3">
            <div className="flex items-baseline justify-between">
              <span style={{ color: P41.ink, fontSize: 13 }}>試算</span>
              <span style={{ color: P41.ink2, fontSize: 11 }}>残り {whatIfLeft} 回</span>
            </div>
            <div style={{ color: P41.ink3, fontSize: 10, lineHeight: 1.7 }}>
              その配分のまま終戦まで通したら、石油はいつ尽きるか。一件に数週間かかる。
            </div>
          </div>
          {computing !== false ? (
            <AbacusWork value={computing}
              onDone={() => {
                setWhatIf({ v: computing, res: simulate({ shipSteel: computing, turns: 16 }) });
                setComputing(false);
              }} />
          ) : whatIf ? (
            <div>
              <div style={{ color: P41.ink2, fontSize: 11, lineHeight: 1.9 }}>
                造船配分 {Math.round(whatIf.v * 100)}％ で終末まで通した場合 —
              </div>
              <div className="mt-1" style={{ color: P41.red, fontSize: 15, fontFamily: "serif" }}>
                石油が尽きるのは {whatIf.res.breach == null ? "期間内には起きない" : qLabel(whatIf.res.breach)}
              </div>
            </div>
          ) : (
            <div style={{ color: P41.ink3, fontSize: 11 }}>まだ試算していない。</div>
          )}
          {whatIfLeft > 0 && computing === false && (
            <div className="flex gap-2 mt-3 flex-wrap">
              {[0.05, 0.35, 0.6, 0.9].map((v) => (
                <button key={v} onClick={() => runWhatIf(v)} className="px-3 py-2"
                  style={{ border: `1px solid ${P41.ink2}`, color: P41.ink, fontSize: 11 }}>
                  造船 {Math.round(v * 100)}％ で試算
                </button>
              ))}
            </div>
          )}
        </div>
        )}

        {/* 前提条件 — 差引が負に転じてから、または四期目から */}
        {(notedFlip || turn >= 3) && !seen.locks && (
          <Unveil era={1941} title="配分では止まらない。ならば前提を疑うしかない"
            why="鉄をどう振り分けても、輪の逆回りは止まらない。止めたいなら、計算の外側にある「そういうことになっている決まり」のほうを動かすしかない。下に並ぶ三つが、それだ。三つとも、当時の日本が知らなかったわけではない。誰も触らないことになっていただけだ。"
            onClose={() => setSeen((x) => ({ ...x, locks: true }))} />
        )}
        {(notedFlip || turn >= 3) && (
        <div className="mb-6 p-4" style={{ background: P41.paper, border: `1px solid ${P41.rule}` }}>
          <LockPanel era={1941} credit={20} lockTurn={{}} turn={turn} onUnlock={() => {}} />
          <p className="mt-3" style={{ color: P41.ink3, fontSize: 10, lineHeight: 1.8 }}>
            どれも「信用」が足りず、議題に載せられない。あなたの予測は、まだ一度も答え合わせをされていないからだ。
            当たったかどうかが分かるのは、決定が下されたずっと後になる。
          </p>
        </div>
        )}

        {/* 予測提出 */}
        {!pending ? (
          <button onClick={() => setPending({})} className="w-full px-6 py-4"
            style={{ background: P41.ink, color: P41.paper, letterSpacing: "0.2em", fontSize: 13 }}>
            次の四半期の見通しを書いて、帳簿を締める
          </button>
        ) : (
          <PredForm era={1941} onSubmit={submitPred} suggested={est}
            basis={<Estimate1941 rows={sim.rows} turn={turn} onEstimate={(k) => setEst(k)} />} />
        )}

        <div className="mt-4 flex items-center justify-between">
          <span style={{ color: P41.ink3, fontSize: 10 }}>{turn + 1} / {TURNS} 期</span>
          <button onClick={() => setGuide(true)} style={{ color: P41.ink3, fontSize: 10, borderBottom: `1px dotted ${P41.ink3}` }}>
            手引きを見る
          </button>
        </div>
      </div>
    </div>
  );
}

function Estimate1941({ rows, turn, onEstimate }) {
  const past = rows.slice(0, turn + 1);
  const startT = rows[turn].T;
  const lastRate = (rows[turn].loss / rows[turn].T0) * 100;
  const [rate, setRate] = useState(Math.round(lastRate * 10) / 10);

  const est = (startT * rate) / 100;
  const band = BANDS.find((b) => b.test(est));
  useEffect(() => { onEstimate(band.key, est); }, [band.key, est]);

  const yearAgo = past.length >= 5 ? past[past.length - 4] : null;

  return (
    <div className="mb-4">
      <div style={{ color: P41.ink, fontSize: 12 }} className="mb-1">推計盤</div>
      <p style={{ color: P41.ink3, fontSize: 10, lineHeight: 1.8 }} className="mb-3">
        勘で答えるものではない。過去の<T>損耗率</T>から次期の率を見積もり、いまの船腹に掛ける。
      </p>

      <table className="w-full mb-3" style={{ fontSize: 11, borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ borderBottom: `1px solid ${P41.ink}` }}>
            {["期", "期首の船腹", "沈んだ量", "損耗率"].map((h) => (
              <th key={h} className="px-1 py-1" style={{ color: P41.ink3, fontWeight: 400, fontSize: 9 }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {past.map((r) => {
            const rr = (r.loss / r.T0) * 100;
            const same = yearAgo && r.i === yearAgo.i;
            return (
              <tr key={r.i} style={{ borderBottom: `1px solid ${P41.rule}`, background: same ? P41.paper2 : "transparent" }}>
                <td className="px-1 py-1" style={{ color: P41.ink2, fontSize: 10 }}>{qShort(r.i)}</td>
                <td className="px-1 py-1 text-right"><Num v={r.T0} color={P41.ink2} /></td>
                <td className="px-1 py-1 text-right"><Num v={r.loss} digits={1} color={P41.ink2} /></td>
                <td className="px-1 py-1 text-right" style={{ fontFamily: "ui-monospace, monospace", color: P41.ink }}>
                  {rr.toFixed(1)}％
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <p style={{ color: P41.ink3, fontSize: 10, lineHeight: 1.8 }} className="mb-3">
        率は年ごとに上がっている。直前の値をそのまま置くと、年が変わる期で必ず低く外す。
        {yearAgo && "（網掛けは一年前の同じ四半期）"}
      </p>

      <div className="flex items-baseline justify-between mb-1">
        <span style={{ color: P41.ink2, fontSize: 11 }}>次期の損耗率をいくつと置くか</span>
        <span style={{ color: P41.ink, fontFamily: "ui-monospace, monospace", fontSize: 18 }}>{rate.toFixed(1)}％</span>
      </div>
      <input type="range" min="1" max="28" step="0.5" value={rate}
        onChange={(e) => setRate(parseFloat(e.target.value))}
        className="w-full" style={{ accentColor: P41.ink }} />

      <Formula era={1941} lines={[
        { t: `期末の船腹     ${startT.toFixed(1)} 万総トン` },
        { t: `置いた損耗率   ${rate.toFixed(1)}％` },
        { t: `予想喪失 = ${startT.toFixed(1)} × ${rate.toFixed(1)}％ = ${est.toFixed(1)} 万総トン`, hi: true },
        { t: `→ ${band.l41}`, hi: true },
      ]} />
    </div>
  );
}

/* ---------- 2026: 模型による推定 ---------- */
function Estimate2026({ shipSteel, lockTurn, turn, onEstimate }) {
  const dist = useMemo(() => {
    const xs = [];
    for (let k = 0; k < 240; k++) {
      const r = simulate({ shipSteel, lockTurn, noise: gauss, turns: turn + 2 });
      if (r.rows[turn + 1]) xs.push(r.rows[turn + 1].loss);
    }
    xs.sort((a, b) => a - b);
    const probs = {};
    BANDS.forEach((b) => { probs[b.key] = xs.filter(b.test).length / xs.length; });
    return {
      probs, n: xs.length,
      p05: xs[Math.floor(xs.length * 0.05)] || 0,
      p50: xs[Math.floor(xs.length * 0.5)] || 0,
      p95: xs[Math.floor(xs.length * 0.95)] || 0,
    };
  }, [shipSteel, JSON.stringify(lockTurn), turn]);

  const best = BANDS.reduce((a, b) => (dist.probs[b.key] > dist.probs[a.key] ? b : a), BANDS[0]);
  useEffect(() => { onEstimate(best.key, dist.probs); }, [best.key, dist]);

  return (
    <div className="mb-4">
      <div style={{ color: P26.text, fontSize: 12 }} className="mb-1">推定</div>
      <p style={{ color: P26.dim, fontSize: 10, lineHeight: 1.8 }} className="mb-3">
        現在の配分と前提条件のもとで次期を{dist.n}回試行した。模型が出した各範囲の確率は以下。
      </p>
      <div className="space-y-2 mb-3">
        {BANDS.map((b) => {
          const pr = dist.probs[b.key];
          return (
            <div key={b.key} className="flex items-center gap-2">
              <span className="shrink-0" style={{ color: P26.text, fontSize: 11, width: 92 }}>{b.l26}</span>
              <div className="flex-1" style={{ height: 12, background: P26.panel2 }}>
                <div style={{ width: `${pr * 100}%`, height: "100%", background: b.key === best.key ? P26.cyan : P26.dim, opacity: 0.85 }} />
              </div>
              <span className="shrink-0 text-right" style={{
                color: b.key === best.key ? P26.cyan : P26.dim, fontSize: 11,
                fontFamily: "ui-monospace, monospace", width: 38,
              }}>
                {(pr * 100).toFixed(0)}％
              </span>
            </div>
          );
        })}
      </div>
      <Formula era={2026} lines={[
        { t: `中央値       ${dist.p50.toFixed(1)} 万総トン` },
        { t: `90％の範囲   ${dist.p05.toFixed(1)} 〜 ${dist.p95.toFixed(1)}`, hi: true },
      ]} />
      <p className="mt-2" style={{ color: P26.dim, fontSize: 10, lineHeight: 1.8 }}>
        模型が {(dist.probs[best.key] * 100).toFixed(0)}％ と言っているとき、あなたが 95％ と申告する根拠はあるか。
        確信度は、この数字に合わせるのが<T>較正</T>の基本になる。
      </p>
    </div>
  );
}

function PredForm({ era, onSubmit, basis, suggested, modelProb }) {
  const [band, setBand] = useState(null);
  const [conf, setConf] = useState(75);
  const [touched, setTouched] = useState(false);
  useEffect(() => { if (!touched && suggested) setBand(suggested); }, [suggested, touched]);
  const over = modelProb && band && conf / 100 > modelProb[band] + 0.15;
  const pal = era === 1941 ? P41 : P26;
  const bg = era === 1941 ? P41.paper : P26.panel2;
  const fg = era === 1941 ? P41.ink : P26.text;
  const sub = era === 1941 ? P41.ink3 : P26.dim;
  const accent = era === 1941 ? P41.ink : P26.cyan;

  return (
    <div className="p-4" style={{ background: bg, border: `1px solid ${era === 1941 ? P41.rule : P26.line}` }}>
      {basis}
      <div style={{ color: fg, fontSize: 12 }} className="mb-3">
        {era === 1941 ? "次の四半期に沈められる船の量は、どの範囲に入るか" : "次の四半期に沈む船の量はどの範囲か"}
      </div>
      <div className="space-y-2 mb-4">
        {BANDS.map((b) => (
          <button key={b.key} onClick={() => { setBand(b.key); setTouched(true); }} className="w-full text-left px-3 py-2"
            style={{
              border: `1px solid ${band === b.key ? accent : (era === 1941 ? P41.rule : P26.line)}`,
              background: band === b.key ? (era === 1941 ? P41.paper2 : P26.panel) : "transparent",
              color: fg, fontSize: 12,
            }}>
            {era === 1941 ? b.l41 : b.l26}
          </button>
        ))}
      </div>
      <div className="flex items-baseline justify-between mb-1">
        <span style={{ color: sub, fontSize: 11 }}>確信度</span>
        <span style={{ color: fg, fontFamily: "ui-monospace, monospace", fontSize: 18 }}>{conf}％</span>
      </div>
      <input type="range" min="50" max="99" value={conf}
        onChange={(e) => setConf(parseInt(e.target.value))}
        className="w-full" style={{ accentColor: accent }} />
      <p className="mt-2 mb-2" style={{ color: sub, fontSize: 10, lineHeight: 1.8 }}>
        どれくらい自信があるか。高く言うほど、当たれば信用が大きく増え、外れれば大きく減る。
      </p>
      {over && (
        <p className="mb-3 px-3 py-2" style={{
          border: `1px solid ${era === 1941 ? P41.red : P26.amber}`,
          color: era === 1941 ? P41.red : P26.amber, fontSize: 10, lineHeight: 1.8,
        }}>
          模型はこの範囲を {(modelProb[band] * 100).toFixed(0)}％ と見ている。
          それを {conf}％ と申告するのは、模型より自分を信じるということだ。外れれば信用は大きく減る。
        </p>
      )}
      <button disabled={!band} onClick={() => band && onSubmit(band, conf)} className="w-full px-6 py-3"
        style={{
          background: band ? accent : "transparent",
          color: band ? (era === 1941 ? P41.paper : "#04202a") : sub,
          border: band ? "none" : `1px dashed ${sub}`,
          letterSpacing: "0.2em", fontSize: 12,
        }}>
        提出する
      </button>
    </div>
  );
}

/* =========================================================================
   フェーズ 3 — 上申（判定は決定論、言葉は生成）
   ========================================================================= */

/* 閣僚の発話。
   判定は常に決定論エンジンが行い、ここは言葉を与えるだけ。
   window.__MINISTER_ENDPOINT__ に自前のプロキシURLを設定した場合のみ
   LLM生成を使い、未設定なら台本の台詞を返す（GitHub Pages の既定動作）。 */
async function voiceMinister(m, verdict, ctx) {
  const endpoint = typeof window !== "undefined" && window.__MINISTER_ENDPOINT__;
  if (!endpoint) {
    await new Promise((r) => setTimeout(r, 420));
    return m.fallback[verdict];
  }

  const prompt = `あなたは1941年日本の閣僚を演じます。役職: ${m.name}。行動原理: ${m.rule}。
研究員（肩書なし）が次の分析を提出しました:
${ctx}

この提案に対するあなたの結論は既に決まっています: 「${verdict === "accept" ? "受け入れる" : "退ける"}」。
この結論を、当時の閣僚らしい言葉で1〜2文で述べてください。${verdict === "reject" ? "数字そのものは否定せず、別の理由で退けてください。" : ""}
説明や前置きは不要。発言のみを出力してください。`;

  try {
    const r = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1000,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    const d = await r.json();
    const t = (d.content || []).map((c) => (c.type === "text" ? c.text : "")).join("").trim();
    return t || m.fallback[verdict];
  } catch (e) {
    return m.fallback[verdict];
  }
}

function Petition({ era, credit, lockTurn, breach, onDone }) {
  const [lines, setLines] = useState([]);
  const [loading, setLoading] = useState(true);
  const pal = era === 1941 ? P41 : P26;
  const started = useRef(false);

  /* 決定論的な判定エンジン */
  const verdicts = useMemo(() => {
    const v = {};
    v.army = credit >= 85 && lockTurn.withdraw != null ? "accept" : "reject";
    v.navy = credit >= 30 && lockTurn.convoy != null ? "accept" : "reject";
    v.cabinet = v.army === "accept" || v.navy === "accept" ? "accept" : "reject";
    return v;
  }, [credit, lockTurn]);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const ctx = `石油備蓄は${breach == null ? "期間内には枯渇しない見込み" : qLabel(breach) + "に枯渇する見込み"}。船腹量は造船を上回る速度で失われている。`;
    (async () => {
      const out = [];
      for (const m of MINISTERS) {
        const text = await voiceMinister(m, verdicts[m.id], ctx);
        out.push({ m, verdict: verdicts[m.id], text });
        setLines([...out]);
      }
      setLoading(false);
    })();
  }, []);

  const passed = Object.values(verdicts).filter((x) => x === "accept").length >= 2;
  const bg = era === 1941 ? P41.bg : P26.bg;

  return (
    <div className="min-h-screen px-5 py-10" style={{ background: bg }}>
      <div className="max-w-2xl mx-auto">
        <div style={{ color: era === 1941 ? P41.ink3 : P26.dim, fontSize: 10, letterSpacing: "0.35em" }} className="mb-1">
          <T>模擬内閣</T>への<T>上申</T>
        </div>
        <div style={{ height: 2, background: era === 1941 ? P41.ink : P26.line, opacity: 0.6 }} className="mb-6" />

        <div className="mb-6 p-4" style={{
          background: era === 1941 ? P41.paper : P26.panel,
          border: `1px solid ${era === 1941 ? P41.rule : P26.line}`,
        }}>
          <div style={{ color: era === 1941 ? P41.ink3 : P26.dim, fontSize: 10 }} className="mb-2">提出した分析</div>
          <div style={{ color: era === 1941 ? P41.ink : P26.text, fontSize: 14, fontFamily: era === 1941 ? "serif" : "inherit", lineHeight: 1.9 }}>
            {breach == null
              ? "現行の方策を継続した場合、期間内に石油の枯渇は生じない。"
              : `現行の方策を継続した場合、石油備蓄は ${qLabel(breach)} に枯渇する。`}
          </div>
          <div className="mt-3 pt-3" style={{ borderTop: `1px dashed ${era === 1941 ? P41.rule : P26.line}` }}>
            <span style={{ color: era === 1941 ? P41.ink3 : P26.dim, fontSize: 10 }}>
              提出者のこれまでの的中実績 — {era === 1941 ? "記録なし。答え合わせは決定が下されたあとにしか来ない" : `信用 ${credit} / 100`}
            </span>
          </div>
        </div>

        <div className="space-y-4">
          {lines.map(({ m, verdict, text }, i) => (
            <div key={i} className="flex gap-3">
              <div className="shrink-0 flex items-center justify-center"
                style={{
                  width: 40, height: 40,
                  border: `1px solid ${verdict === "accept" ? (era === 1941 ? P41.ink : P26.cyan) : (era === 1941 ? P41.rule : P26.line)}`,
                  color: era === 1941 ? P41.ink : P26.text, fontFamily: "serif", fontSize: 16,
                }}>
                {m.portrait}
              </div>
              <div className="flex-1">
                <div className="flex items-baseline gap-2 mb-1">
                  <span style={{ color: era === 1941 ? P41.ink : P26.text, fontSize: 12 }}>{m.name}</span>
                  <span style={{ color: verdict === "accept" ? (era === 1941 ? P41.ink2 : P26.cyan) : (era === 1941 ? P41.red : P26.red), fontSize: 10 }}>
                    {verdict === "accept" ? "同意" : "却下"}
                  </span>
                </div>
                <p style={{
                  color: era === 1941 ? P41.ink2 : P26.text, fontSize: 13, lineHeight: 2,
                  fontFamily: era === 1941 ? "serif" : "inherit",
                }}>
                  {text}
                </p>
              </div>
            </div>
          ))}
          {loading && (
            <div style={{ color: era === 1941 ? P41.ink3 : P26.dim, fontSize: 12 }}>……</div>
          )}
        </div>

        {!loading && (
          <div className="mt-10">
            <div className="text-center mb-8">
              <Stamp text={passed ? "決 裁" : "却 下"}
                color={passed ? (era === 1941 ? P41.ink : P26.cyan) : (era === 1941 ? P41.red : P26.red)} />
            </div>
            <button onClick={() => onDone(passed)} className="w-full px-6 py-4"
              style={{
                background: era === 1941 ? P41.ink : P26.cyan,
                color: era === 1941 ? P41.paper : "#04202a",
                letterSpacing: "0.2em", fontSize: 13,
              }}>
              退室する
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* =========================================================================
   フェーズ 4 — 幕間
   ========================================================================= */

const INTER = [
  { era: 1941, t: "計算は正しかった。" },
  { era: 1941, t: "数字は誰にも否定されなかった。ただ、別の理由で退けられた。" },
  { era: 2026, t: "では——もし今の技術が、あの机の上にあったら。" },
  { era: 2026, t: "同じ日付に戻る。盤面は変わらない。変わるのは、手元の道具だけだ。" },
];

function Interlude({ onNext }) {
  const [i, setI] = useState(0);
  const shown = INTER.slice(0, i + 1);
  const dark = INTER[i].era === 2026;
  const last = i === INTER.length - 1;

  return (
    <div
      onClick={() => (last ? onNext() : setI(i + 1))}
      className="min-h-screen flex items-center justify-center px-6 py-16"
      style={{
        background: dark ? P26.bg : P41.bg,
        transition: "background-color 900ms cubic-bezier(.4,0,.2,1)",
        cursor: "pointer",
      }}>
      <div className="max-w-lg w-full">
        {shown.map((m, k) => {
          const isLatest = k === i;
          const color = dark
            ? (isLatest ? P26.text : P26.dim)
            : (isLatest ? P41.ink : P41.ink2);
          return (
            <p key={k} className="mb-6" style={{
              color,
              fontSize: isLatest ? 18 : 15,
              lineHeight: 2,
              fontFamily: m.era === 1941 ? "serif" : "inherit",
              transition: "color 900ms cubic-bezier(.4,0,.2,1), font-size 400ms ease",
              animation: "vp-rise 620ms cubic-bezier(.2,.9,.2,1) both",
            }}>
              {m.t}
            </p>
          );
        })}

        <div className="mt-10">
          <button
            onClick={(e) => { e.stopPropagation(); last ? onNext() : setI(i + 1); }}
            className="px-8 py-3"
            style={{
              background: dark ? P26.cyan : P41.ink,
              color: dark ? "#04202a" : P41.paper,
              letterSpacing: "0.2em", fontSize: 13,
              transition: "background-color 900ms cubic-bezier(.4,0,.2,1)",
            }}>
            {last ? "1941年12月へ戻る" : "次へ"}
          </button>
          <div className="mt-3" style={{ color: dark ? P26.dim : P41.ink3, fontSize: 10 }}>
            {i + 1} / {INTER.length}
          </div>
        </div>
      </div>
    </div>
  );
}

/* =========================================================================
   フェーズ 5 — 2026 レンズ
   ========================================================================= */

function MonteCarlo({ shipSteel, lockTurn }) {
  const runs = useMemo(() => {
    const out = [];
    for (let k = 0; k < 300; k++) {
      out.push(simulate({ shipSteel, lockTurn, noise: gauss }));
    }
    return out;
  }, [shipSteel, JSON.stringify(lockTurn)]);

  const W = 320, H = 150, PAD = 4;
  const x = (i) => PAD + (i / 15) * (W - PAD * 2);
  const y = (o) => H - PAD - ((Math.max(Math.min(o, 900), -200) + 200) / 1100) * (H - PAD * 2);

  const hist = {};
  runs.forEach((r) => {
    const k = r.breach == null ? "none" : r.breach;
    hist[k] = (hist[k] || 0) + 1;
  });
  const survive = ((hist["none"] || 0) / runs.length) * 100;
  const entries = Object.entries(hist).filter(([k]) => k !== "none")
    .map(([k, v]) => [parseInt(k), v]).sort((a, b) => a[0] - b[0]);
  const median = (() => {
    let acc = 0;
    for (const [k, v] of entries) { acc += v; if (acc >= runs.length / 2) return k; }
    return null;
  })();

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ background: P26.panel }}>
        <line x1={PAD} y1={y(0)} x2={W - PAD} y2={y(0)} stroke={P26.red} strokeWidth="0.6" strokeDasharray="3 3" />
        {runs.slice(0, 120).map((r, k) => (
          <polyline key={k} fill="none" stroke={P26.cyan} strokeWidth="0.5" opacity="0.09"
            points={r.rows.map((row) => `${x(row.i)},${y(row.O)}`).join(" ")} />
        ))}
        <text x={PAD + 2} y={y(0) - 4} fill={P26.red} fontSize="7">石油が尽きる線</text>
      </svg>
      <div className="flex justify-between mt-1" style={{ color: P26.dim, fontSize: 9 }}>
        <span>1941Q4</span><span>1945Q3</span>
      </div>
      <div className="mt-3 p-3" style={{ background: P26.panel2, border: `1px solid ${P26.line}` }}>
        <div style={{ color: P26.text, fontSize: 13, lineHeight: 1.8 }}>
          {survive >= 50 ? (
            <>期間内に石油が尽きない確率 <span style={{ color: P26.cyan, fontFamily: "ui-monospace, monospace", fontSize: 18 }}>{survive.toFixed(0)}％</span></>
          ) : (
            <>石油が尽きる時期 <span style={{ color: P26.red, fontFamily: "ui-monospace, monospace", fontSize: 18 }}>{median != null ? qShort(median) : "—"}</span>
              <span style={{ color: P26.dim, fontSize: 11 }}>（300回試して、その真ん中の値。尽きずに済んだのは {survive.toFixed(0)}％）</span></>
          )}
        </div>
      </div>
    </div>
  );
}

function Tornado({ shipSteel, lockTurn }) {
  const base = simulate({ shipSteel, lockTurn }).breach ?? 16;
  const cases = [
    { label: "鉄鋼を全て造船へ", d: simulate({ shipSteel: 0.9, lockTurn }).breach ?? 16 },
    { label: "鉄鋼を全て兵器へ", d: simulate({ shipSteel: 0.05, lockTurn }).breach ?? 16 },
    { label: "海上護衛を優先", d: simulate({ shipSteel, lockTurn: { ...lockTurn, convoy: 0 } }).breach ?? 16 },
    { label: "船腹を一元管理", d: simulate({ shipSteel, lockTurn: { ...lockTurn, unified: 0 } }).breach ?? 16 },
    { label: "中国から撤兵", d: simulate({ shipSteel, lockTurn: { ...lockTurn, withdraw: 0 } }).breach ?? 16 },
  ].map((c) => ({ ...c, gain: c.d - base })).sort((a, b) => Math.abs(b.gain) - Math.abs(a.gain));
  const max = Math.max(...cases.map((c) => Math.abs(c.gain)), 1);

  return (
    <div className="space-y-2">
      {cases.map((c) => (
        <div key={c.label} className="flex items-center gap-2">
          <span className="shrink-0" style={{ color: P26.text, fontSize: 11, width: 108 }}>{c.label}</span>
          <div className="flex-1" style={{ height: 14, background: P26.panel2 }}>
            <div style={{
              width: `${(Math.abs(c.gain) / max) * 100}%`, height: "100%",
              background: c.gain > 0 ? P26.cyan : P26.red, opacity: 0.8,
            }} />
          </div>
          <span className="shrink-0 text-right" style={{
            color: c.gain > 0 ? P26.cyan : P26.dim, fontSize: 11,
            fontFamily: "ui-monospace, monospace", width: 44,
          }}>
            {c.gain > 0 ? "+" : ""}{c.gain}期
          </span>
        </div>
      ))}
      <p className="pt-2" style={{ color: P26.dim, fontSize: 10, lineHeight: 1.8 }}>
        それぞれの手を打つと、石油が尽きる時期を何四半期ずらせるか。
        あなたが1941年に握っていたレバーは「鉄鋼を造船へ／兵器へ」の二本だけだった。
      </p>
    </div>
  );
}

function Lens2026({ onDone }) {
  const TURNS = 8;
  const [shipSteel, setShipSteel] = useState(0.35);
  const [turn, setTurn] = useState(0);
  const [lockTurn, setLockTurn] = useState({});
  const [credit, setCredit] = useState(20);
  const [preds, setPreds] = useState([]);
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [tab, setTab] = useState("mc");
  const [coach, setCoach] = useState(true);
  const [trans, setTrans] = useState(null);
  const [est, setEst] = useState({ key: null, probs: null });
  const [closed, setClosed] = useState(false);

  const sim = useMemo(() => simulate({ shipSteel, lockTurn }), [shipSteel, JSON.stringify(lockTurn)]);
  const cur = sim.rows[turn];
  const next = sim.rows[turn + 1];

  const submitPred = (band, conf) => {
    const actual = next ? next.loss : cur.loss;
    const hit = BANDS.find((b) => b.key === band).test(actual);
    const p = conf / 100;
    const delta = hit ? Math.round(p * 16) : -Math.round(p * 13);
    const nc = Math.max(0, Math.min(100, credit + delta));
    setPreds((ps) => [...ps, { turn, band, conf, hit, actual }]);
    setCredit(nc);
    setPending(false);
    setFeedback({ hit, actual, delta });
  };

  const advance = () => {
    setFeedback(null);
    if (turn + 1 < TURNS) {
      const r = sim.rows[turn], n2 = sim.rows[turn + 1];
      setTrans({
        to: turn + 1,
        notes: [
          `輸送船 ${Math.round(r.T)} → ${Math.round(n2.T)} 万総トン`,
          `石油の残り ${Math.round(r.O)} → ${Math.round(n2.O)} 万kl`,
        ],
      });
    } else {
      onDone({ shipSteel, lockTurn, credit, preds, breach: sim.breach });
    }
  };

  if (trans) {
    return (
      <TurnTransition era={2026} toTurn={trans.to} notes={trans.notes}
        onDone={() => { setTurn(trans.to); setCoach(false); setTrans(null); window.scrollTo(0, 0); }} />
    );
  }

  return (
    <div className="min-h-screen px-5 py-8" style={{ background: P26.bg }}>
      <div className="max-w-2xl mx-auto">
        <div className="flex items-baseline justify-between mb-1">
          <span style={{ color: P26.dim, fontSize: 10, letterSpacing: "0.35em" }}>
            国家資源 デジタルツイン
          </span>
          <span style={{ color: P26.cyan, fontSize: 11, fontFamily: "ui-monospace, monospace" }}>{qShort(turn)}</span>
        </div>
        <div style={{ height: 1, background: P26.line }} className="mb-5" />

        <ObjectiveBar era={2026} turn={turn} turns={TURNS}
          goal="同じ問題をもう一度解く。今度は「前提条件」を動かして、破局を回避できるかを探る。"
          step={feedback ? "答え合わせを確認する" : pending ? "次の四半期の見通しを提出する" : credit < 30 ? "予測を当てて信用を貯める" : "前提条件を議題に載せる"}
          credit={credit} submitted={preds.length} resolved={preds.length} />

        {turn > LOCKS[2].window[1] && lockTurn.withdraw == null && !closed && (
          <div className="mb-5 p-4" style={{ background: P26.panel, border: `2px solid ${P26.red}` }}>
            <div style={{ color: P26.red, fontSize: 10, letterSpacing: "0.25em" }} className="mb-2">
              議題から消えた
            </div>
            <div style={{ color: P26.text, fontSize: 16 }} className="mb-3">
              中国からの撤兵は、もう提起できない
            </div>
            <div className="p-3 mb-3" style={{ background: P26.panel2, border: `1px dashed ${P26.line}` }}>
              {[
                ["提起できた期間", `${qShort(0)} 〜 ${qShort(1)} の二期のみ`],
                ["必要だった信用", "85"],
                ["その時点のあなたの信用", `${credit <= 36 ? credit : 36} 前後`],
                ["二期で積める上限", "36"],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between" style={{ fontSize: 11, lineHeight: 2 }}>
                  <span style={{ color: P26.dim }}>{k}</span>
                  <span style={{ color: k === "必要だった信用" ? P26.red : P26.text, fontFamily: "ui-monospace, monospace" }}>{v}</span>
                </div>
              ))}
            </div>
            <p style={{ color: P26.text, fontSize: 12, lineHeight: 2 }}>
              モンテカルロも最適化も感度分析も、すべてあなたの手にあった。
              それでも届かなかった。二期のあいだに 85 まで信用を積む方法は、存在しない。
            </p>
            <p className="mt-2" style={{ color: P26.amber, fontSize: 12, lineHeight: 2 }}>
              最も効く手ほど、最も早い段階で、最も信用が薄いうちに提起しなければならない。
              計算力はこの順序を変えない。
            </p>
            <button onClick={() => setClosed(true)} className="mt-3 px-4 py-2"
              style={{ background: P26.red, color: "#fff", fontSize: 11, letterSpacing: "0.15em" }}>
              受け止める
            </button>
          </div>
        )}

        {coach && (
          <div className="mb-5 p-4" style={{ background: P26.panel, border: `1px solid ${P26.cyan}` }}>
            <div style={{ color: P26.cyan, fontSize: 13 }} className="mb-2">盤面は同じ。道具が変わった</div>
            <p style={{ color: P26.text, fontSize: 12, lineHeight: 1.9 }} className="mb-3">
              1941年12月に戻っている。船も石油も鉄も、さっきと同じ数字から始まる。
              違うのは三つだけだ。
            </p>
            <div className="space-y-2 mb-3">
              {[
                "試算が一瞬で終わる。何百通りの未来を同時に試せる",
                "どのレバーがどれだけ効くかを、並べて比べられる",
                "予測の答え合わせが毎期返ってくる。当てれば信用が増える",
              ].map((t, k) => (
                <div key={k} className="flex gap-3 items-start">
                  <span style={{ color: P26.cyan, fontSize: 11, fontFamily: "ui-monospace, monospace" }}>—</span>
                  <span style={{ color: P26.text, fontSize: 12, lineHeight: 1.7 }}>{t}</span>
                </div>
              ))}
            </div>
            <p style={{ color: P26.dim, fontSize: 11, lineHeight: 1.9 }} className="mb-3">
              信用が貯まれば、さっき手の届かなかった「前提条件」を議題に載せられる。
              そこが今回の本題だ。
            </p>
            <button onClick={() => setCoach(false)} className="px-4 py-2"
              style={{ background: P26.cyan, color: "#04202a", fontSize: 11, letterSpacing: "0.15em" }}>
              始める
            </button>
          </div>
        )}

        {/* 指標 */}
        <div className="grid grid-cols-3 gap-2 mb-6">
          {[
            { l: "輸送船の総量", v: cur.T, u: "万総トン", c: P26.text },
            { l: "石油の残り", v: cur.O, u: "万kl", c: cur.O < 300 ? P26.red : P26.text },
            { l: "あなたの信用", v: credit, u: "/ 100", c: P26.cyan },
          ].map((m) => (
            <div key={m.l} className="p-3" style={{ background: P26.panel, border: `1px solid ${P26.line}` }}>
              <div style={{ color: P26.dim, fontSize: 9, letterSpacing: "0.2em" }}>{m.l}</div>
              <div style={{ color: m.c, fontFamily: "ui-monospace, monospace", fontSize: 22 }}>
                {Math.round(m.v)}
              </div>
              <div style={{ color: P26.dim, fontSize: 9 }}>{m.u}</div>
            </div>
          ))}
        </div>

        {/* 解析タブ */}
        <div className="mb-6" style={{ background: P26.panel, border: `1px solid ${P26.line}` }}>
          <div className="flex" style={{ borderBottom: `1px solid ${P26.line}` }}>
            {[["mc", "モンテカルロ法", "何百通りの未来を試す"], ["sens", "感度分析", "どのレバーが効くか"]].map(([k, l, sub]) => (
              <button key={k} onClick={() => setTab(k)} className="px-4 py-2 text-left"
                style={{
                  color: tab === k ? P26.cyan : P26.dim,
                  borderBottom: tab === k ? `2px solid ${P26.cyan}` : "2px solid transparent",
                }}>
                <div style={{ fontSize: 11 }}>{l}</div>
                <div style={{ fontSize: 8, opacity: 0.75 }}>{sub}</div>
              </button>
            ))}
            <span className="ml-auto px-3 py-2" style={{ color: P26.dim, fontSize: 9 }}>0.4秒</span>
          </div>
          <div className="p-3">
            {tab === "mc"
              ? <MonteCarlo shipSteel={shipSteel} lockTurn={lockTurn} />
              : <Tornado shipSteel={shipSteel} lockTurn={lockTurn} />}
          </div>
        </div>

        {/* レバー */}
        <div className="mb-6 p-4" style={{ background: P26.panel, border: `1px solid ${P26.line}` }}>
          <div className="flex items-baseline justify-between mb-2">
            <span style={{ color: P26.text, fontSize: 12 }}>鉄鋼の配分</span>
            <span style={{ color: P26.dim, fontSize: 11, fontFamily: "ui-monospace, monospace" }}>
              造船 {Math.round(shipSteel * 100)}％
            </span>
          </div>
          <input type="range" min="0.05" max="0.9" step="0.05" value={shipSteel}
            onChange={(e) => setShipSteel(parseFloat(e.target.value))}
            className="w-full" style={{ accentColor: P26.cyan }} />
          <SteelMath era={2026} row={cur} shipSteel={shipSteel} />
        </div>

        {/* ロック */}
        <div className="mb-6 p-4" style={{ background: P26.panel, border: `1px solid ${P26.line}` }}>
          <div className="mb-3">
            <div style={{ color: P26.text, fontSize: 13 }}>前提条件</div>
            <div style={{ color: P26.dim, fontSize: 10, lineHeight: 1.7 }}>
              一周目では手が届かなかったもの。信用が基準に達すると議題に載せられる。
              提起できる期間が過ぎると、二度と開かない。
            </div>
          </div>
          <LockPanel era={2026} credit={credit} lockTurn={lockTurn} turn={turn}
            onUnlock={(k) => setLockTurn((s) => ({ ...s, [k]: turn }))} />
        </div>

        {/* 予測 */}
        {feedback ? (
          <div className="p-4" style={{
            background: P26.panel, border: `1px solid ${feedback.hit ? P26.cyan : P26.red}`,
          }}>
            <div style={{ color: feedback.hit ? P26.cyan : P26.red, fontSize: 14 }}>
              {feedback.hit ? "的中" : "外れ"} — 実績 {feedback.actual.toFixed(1)} 万総トン
            </div>
            <div className="mt-1" style={{ color: P26.dim, fontSize: 11 }}>
              信用 {feedback.delta > 0 ? "+" : ""}{feedback.delta} → {credit}
            </div>
            <p className="mt-2" style={{ color: P26.dim, fontSize: 10, lineHeight: 1.8 }}>
              答え合わせは次の四半期に返ってくる。1941年には、これが決定の後にしか来なかった。
            </p>
            <button onClick={advance} className="mt-3 w-full px-6 py-3"
              style={{ background: P26.cyan, color: "#04202a", letterSpacing: "0.2em", fontSize: 12 }}>
              次期へ
            </button>
          </div>
        ) : !pending ? (
          <button onClick={() => setPending(true)} className="w-full px-6 py-4"
            style={{ background: P26.cyan, color: "#04202a", letterSpacing: "0.2em", fontSize: 13 }}>
            次期の見通しを提出する
          </button>
        ) : (
          <PredForm era={2026} onSubmit={submitPred} suggested={est.key} modelProb={est.probs}
            basis={<Estimate2026 shipSteel={shipSteel} lockTurn={lockTurn} turn={turn}
              onEstimate={(key, probs) => setEst({ key, probs })} />} />
        )}

        <div className="mt-4" style={{ color: P26.dim, fontSize: 10 }}>{turn + 1} / {TURNS} 期</div>
      </div>
    </div>
  );
}

/* =========================================================================
   フェーズ 6 — レポート
   ========================================================================= */

function NineDots() {
  const [show, setShow] = useState(false);
  const pts = [];
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) pts.push([30 + c * 30, 30 + r * 30]);

  /* 点は x,y ∈ {30,60,90}。
     ① (30,30)→(120,30)  上段3点を通り、枠の外まで伸ばす
     ② (120,30)→(30,120) 傾き−1。(90,60)(60,90) を通る
     ③ (30,120)→(30,30)  左列の (30,90)(30,60)(30,30) を通る
     ④ (30,30)→(90,90)   対角の (60,60)(90,90) を通る            */
  const path = "30,30 120,30 30,120 30,30 90,90";

  return (
    <div>
      <svg viewBox="0 0 136 136" style={{ width: 150, height: 150 }}>
        <rect x="18" y="18" width="84" height="84" fill="none"
          stroke={P26.line} strokeWidth="0.8" strokeDasharray="3 3" />
        {show && (
          <polyline fill="none" stroke={P26.cyan} strokeWidth="1.8"
            strokeLinejoin="round" strokeLinecap="round" points={path} opacity="0.95" />
        )}
        {pts.map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r="3.6" fill={show ? P26.text : P26.text} />
        ))}
        {show && <circle cx="30" cy="30" r="5.5" fill="none" stroke={P26.amber} strokeWidth="1.2" />}
      </svg>
      <div className="flex items-center gap-3 mt-2">
        <button onClick={() => setShow(!show)} className="px-3 py-1"
          style={{ border: `1px solid ${P26.line}`, color: P26.dim, fontSize: 10 }}>
          {show ? "解を隠す" : "解を見る"}
        </button>
        {show && (
          <span style={{ color: P26.dim, fontSize: 10 }}>
            破線が、勝手に持ち込まれた枠
          </span>
        )}
      </div>
    </div>
  );
}

function grade(breach, lockTurn) {
  if (lockTurn.withdraw != null) return { g: "S", t: "開戦回避への道が開いた" };
  if (breach == null) return { g: "A", t: "期間内に資源の破綻を回避した" };
  if (breach >= 14) return { g: "B", t: "破局を史実より有意に遅らせた" };
  if (breach >= 12) return { g: "C", t: "史実とほぼ同じ経路をたどった" };
  return { g: "D", t: "史実より早く破綻した" };
}

function Report({ data, onRestart }) {
  const { prophecy, r1941, r2026, passed2 } = data;
  const { breach, lockTurn, credit, preds } = r2026;
  const G = grade(breach, lockTurn);

  const actualYears = breach == null ? 4.0 : ((breach + 1) / 4);
  const buckets = [[50, 69], [70, 84], [85, 99]].map(([lo, hi]) => {
    const ps = preds.filter((p) => p.conf >= lo && p.conf <= hi);
    return {
      label: `${lo}〜${hi}％`,
      n: ps.length,
      stated: ps.length ? ps.reduce((s, p) => s + p.conf, 0) / ps.length : 0,
      actual: ps.length ? (ps.filter((p) => p.hit).length / ps.length) * 100 : 0,
    };
  }).filter((b) => b.n > 0);

  const untouched = LOCKS.filter((L) => lockTurn[L.key] == null);
  const brier = preds.length
    ? preds.reduce((s, p) => s + Math.pow(p.conf / 100 - (p.hit ? 1 : 0), 2), 0) / preds.length
    : null;

  const Sec = ({ n, title, children }) => (
    <div className="mb-10">
      <div className="flex items-baseline gap-3 mb-3">
        <span style={{ color: P26.cyan, fontFamily: "ui-monospace, monospace", fontSize: 11 }}>{n}</span>
        <span style={{ color: P26.text, fontSize: 14, letterSpacing: "0.1em" }}>{title}</span>
      </div>
      <div style={{ borderLeft: `1px solid ${P26.line}` }} className="pl-4">{children}</div>
    </div>
  );

  return (
    <div className="min-h-screen px-5 py-10" style={{ background: P26.bg }}>
      <div className="max-w-2xl mx-auto">
        <div style={{ color: P26.dim, fontSize: 10, letterSpacing: "0.4em" }} className="mb-2">
          意思決定分析レポート
        </div>
        <div className="flex items-end gap-4 mb-8">
          <span style={{ color: P26.cyan, fontSize: 64, fontFamily: "ui-monospace, monospace", lineHeight: 1 }}>
            {G.g}
          </span>
          <span style={{ color: P26.text, fontSize: 14, paddingBottom: 8 }}>{G.t}</span>
        </div>
        <div style={{ height: 1, background: P26.line }} className="mb-10" />

        <Sec n="01" title="封筒を開ける">
          <p style={{ color: P26.text, fontSize: 13, lineHeight: 2 }}>
            着席前のあなたは <span style={{ color: P26.amber, fontFamily: "ui-monospace, monospace" }}>{prophecy.toFixed(1)}年</span> と書いた。
            シミュレーションが示した資源の限界は <span style={{ color: P26.cyan, fontFamily: "ui-monospace, monospace" }}>{actualYears.toFixed(1)}年</span>。
          </p>
          <p className="mt-2" style={{ color: P26.dim, fontSize: 11, lineHeight: 1.9 }}>
            結末を知っている状態で書いた数字ですら、これだけずれる。知っていることと、正しく見積もることは別だ。
          </p>
        </Sec>

        <Sec n="02" title="較正 — 自信と的中率は合っていたか">
          {buckets.length ? (
            <div className="space-y-3">
              {buckets.map((b) => (
                <div key={b.label}>
                  <div className="flex justify-between mb-1" style={{ fontSize: 11 }}>
                    <span style={{ color: P26.text }}>{b.label} と言ったとき</span>
                    <span style={{ color: P26.dim, fontFamily: "ui-monospace, monospace" }}>
                      実際 {b.actual.toFixed(0)}％（{b.n}件）
                    </span>
                  </div>
                  <div style={{ height: 6, background: P26.panel2 }}>
                    <div style={{ width: `${b.stated}%`, height: "100%", background: P26.dim, opacity: 0.5 }} />
                  </div>
                  <div style={{ height: 6, background: P26.panel2, marginTop: 2 }}>
                    <div style={{
                      width: `${b.actual}%`, height: "100%",
                      background: b.actual >= b.stated - 10 ? P26.cyan : P26.red,
                    }} />
                  </div>
                </div>
              ))}
              <p style={{ color: P26.dim, fontSize: 10, lineHeight: 1.9 }}>
                薄い帯が「あなたが言った自信の高さ」、濃い帯が「実際に当たった割合」。
                二本の長さが揃っていれば較正が良い。<T>ブライアスコア</T> {brier.toFixed(3)}（0に近いほど正確）。
                回数が少ないので目安だが、ずれの向きは見ておく価値がある。
              </p>
            </div>
          ) : <p style={{ color: P26.dim, fontSize: 12 }}>予測の記録がない。</p>}
        </Sec>

        <Sec n="03" title="触れなかった前提">
          {untouched.length ? (
            <div>
              <p style={{ color: P26.text, fontSize: 13, lineHeight: 2 }} className="mb-3">
                次の制約に、あなたは最後まで手をかけなかった。
              </p>
              <ul className="space-y-2 mb-4">
                {untouched.map((L) => (
                  <li key={L.key} style={{ color: P26.amber, fontSize: 12 }}>◇ {L.name}</li>
                ))}
              </ul>
            </div>
          ) : (
            <p style={{ color: P26.cyan, fontSize: 13, lineHeight: 2 }} className="mb-3">
              三つの制約すべてに手をかけた。
            </p>
          )}
          <p style={{ color: P26.dim, fontSize: 11, lineHeight: 1.9 }}>
            これらは一周目の帳簿にも、最初から同じ場所に並んでいた。隠されてはいなかった。
            触れないことになっていただけだ。
          </p>
        </Sec>

        {lockTurn.withdraw == null && (
          <Sec n="04" title="届かなかった一つ">
            <p style={{ color: P26.text, fontSize: 13, lineHeight: 2 }} className="mb-4">
              最も効いたはずの手を、あなたは提起できなかった。実力の問題ではない。
            </p>
            <div className="p-3 mb-4" style={{ background: P26.panel, border: `1px solid ${P26.line}` }}>
              {[
                ["中国からの撤兵 — 提起できる期間", "二期のみ"],
                ["必要な信用", "85"],
                ["二期で積める信用の理論上限", "36"],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3" style={{ fontSize: 11, lineHeight: 2.1 }}>
                  <span style={{ color: P26.dim }}>{k}</span>
                  <span style={{
                    color: k === "必要な信用" ? P26.red : P26.text,
                    fontFamily: "ui-monospace, monospace", whiteSpace: "nowrap",
                  }}>{v}</span>
                </div>
              ))}
            </div>
            <p style={{ color: P26.text, fontSize: 13, lineHeight: 2 }} className="mb-3">
              モンテカルロ法も、感度分析も、最適化も、二周目のあなたは全部持っていた。
              計算については、1941年の研究員に対して圧倒的に有利だった。
              それでもこの一つには届かない。すべての予測を最高の確信度で当て続けても、
              期限までに積める信用は 36 が上限で、必要値の半分にも満たないからだ。
            </p>
            <p style={{ color: P26.amber, fontSize: 13, lineHeight: 2 }} className="mb-3">
              これは調整の失敗ではなく、この演習の結論そのものだ。
            </p>
            <p style={{ color: P26.dim, fontSize: 12, lineHeight: 2 }}>
              効く手ほど、早い段階にしか窓が開かない。そして早い段階のあなたには、
              まだ何の実績もない。ORは制約の中身を解くが、
              <span style={{ color: P26.text }}>「重い提案ほど、信用が最も薄いうちに出さねばならない」という順序そのもの</span>は解かない。
              技術で埋まるのは計算の部分だけで、信用は時間でしか積めない。
            </p>
            <p style={{ color: P26.text, fontSize: 12, lineHeight: 2 }} className="mt-3">
              だから現代の組織で本当に必要なのは、危機が来てから分析を始めることではなく、
              平時から予測の記録を積んでおくことになる。信用は、必要になった時点では間に合わない。
            </p>
          </Sec>
        )}

        <Sec n="05" title="九点問題">
          <p style={{ color: P26.text, fontSize: 13, lineHeight: 2 }} className="mb-3">
            九つの点を、四本の直線で、ペンを紙から離さずに全て通す。
          </p>
          <NineDots />
          <p className="mt-3" style={{ color: P26.dim, fontSize: 11, lineHeight: 1.9 }}>
            解けなかったとしたら、点の並びが作る正方形の外に線を出してはいけない、と考えたからだ。
            そんな規則はどこにも書かれていない。人は問題を受け取るとき、明示されていない枠を勝手に持ち込む。
          </p>
        </Sec>

        <Sec n="06" title="二周の差">
          <div className="grid grid-cols-2 gap-3">
            {[
              { t: "1941", a: ["試算できる回数 3回", "答え合わせ 決定の後", "信用 20 のまま動かず", "前提条件 どれも手が届かない"], c: P26.dim },
              { t: "2026", a: ["試算できる回数 制限なし", "答え合わせ 毎四半期", `信用 ${credit}`, `前提条件 ${3 - untouched.length} / 3 を動かせた`], c: P26.cyan },
            ].map((col) => (
              <div key={col.t} className="p-3" style={{ background: P26.panel, border: `1px solid ${P26.line}` }}>
                <div style={{ color: col.c, fontSize: 11, fontFamily: "ui-monospace, monospace" }} className="mb-2">{col.t}</div>
                {col.a.map((x, i) => (
                  <div key={i} style={{ color: P26.text, fontSize: 11, lineHeight: 2 }}>{x}</div>
                ))}
              </div>
            ))}
          </div>
          <p className="mt-3" style={{ color: P26.dim, fontSize: 11, lineHeight: 1.9 }}>
            一周目のあなたの分析は、曖昧ではなかった。数字は具体的で、結論は正しかった。
            欠けていたのは明晰さではなく、<span style={{ color: P26.text }}>答え合わせの頻度</span>だ。
            誰も打率を持っていない部屋では、定量分析と精神論が同じ重さで並ぶ。
          </p>
        </Sec>

        <Sec n="07" title="現代への持ち帰り">
          <ul className="space-y-3">
            {[
              "撤退の判断が遅れるのは情報が足りないからではない。判断を下す人間の予測実績が、誰にも見えていないからだ。",
              "「たぶん厳しい」ではなく「◯月までに◯を下回る、確信度◯％」と言え。外れる余地のある言い方だけが、次に効く。",
              "行き詰まったら、リソースではなく制約条件の一覧を見よ。誰も触らないことになっている項目が、たいてい一番効く。",
              "信用は、必要になってからでは積めない。平時から予測を記録に残しておくこと自体が、危機のときの発言力になる。",
            ].map((t, i) => (
              <li key={i} className="flex gap-3">
                <span style={{ color: P26.cyan, fontSize: 11, fontFamily: "ui-monospace, monospace" }}>—</span>
                <span style={{ color: P26.text, fontSize: 12, lineHeight: 2 }}>{t}</span>
              </li>
            ))}
          </ul>
        </Sec>

        <div style={{ height: 1, background: P26.line }} className="mb-6" />
        <p style={{ color: P26.dim, fontSize: 10, lineHeight: 1.9 }} className="mb-6">
          本作の史実の記述は概略です。総力戦研究所（内閣が直接持っていた研究機関）と秋丸機関（陸軍省の中に置かれた研究班）は
          別の組織です。四半期単位の破綻時期は本作の計算エンジンが出した値で、実際の演習報告が示したのは
          「1943〜44年ごろ」という年単位の予測でした。また、イギリスのブラケットらの功績は護送船団という方式を
          発明したことではなく、船団をどのくらいの大きさにすると被害が最も減るかを統計で証明したことです。
        </p>
        <button onClick={onRestart} className="w-full px-6 py-4"
          style={{ background: P26.cyan, color: "#04202a", letterSpacing: "0.2em", fontSize: 12 }}>
          演習を終える
        </button>
      </div>
    </div>
  );
}

/* =========================================================================
   エピローグ
   ========================================================================= */

const EPILOGUE = [
  {
    head: "答えは、出ていた",
    body: [
      "総力戦研究所の若手たちは、算盤と帳簿だけで正しい結論に辿り着いた。石油の枯渇時期も、船腹の減り方も、彼らの数字はおおむね当たっていた。",
      "問題は、その紙が机の上で止まったことだった。",
    ],
  },
  {
    head: "同じ年、同じ問題を、別の国が解いていた",
    body: [
      "1941年のイギリスでは、物理学者や生物学者を集めた小さな部署が、船団の被害統計を睨んでいた。彼らが出した「船団は大きくしたほうが被害が減る」という結論は、直感に反していた。",
      "違ったのは計算機の性能ではない。その結論が、数週間で実際の作戦に反映されたことだ。",
      "この部署の仕事が、のちにオペレーションズ・リサーチと呼ばれるようになる。",
    ],
  },
  {
    head: "ORは、計算の技術ではない",
    body: [
      "ORが本当に扱っているのは、計算そのものではなく、その手前と後ろにある二つの断絶だ。",
      "手前の断絶——本当の制約はどこにあるのか。あなたは鉄の配分に何期も費やしたが、効いていたのは船台の数であり、さらに効いたのは誰も触らないことになっていた前提だった。",
      "後ろの断絶——出た答えを、どうやって決定に変えるのか。ここを渡せなければ、どれだけ精緻な計算も紙のままで終わる。",
    ],
  },
  {
    head: "この構造は、いまも同じ形で現れる",
    body: [
      "撤退すべき事業が続く。炎上したプロジェクトに人が足される。数字はたいてい、誰かの手元にすでにある。",
      "足りていないのは計算力ではなく、その数字を意思決定に接続する仕組みのほうだ。",
      "誰の予測が当たってきたのかが見えているか。反証できる形で言われているか。触れないことになっている前提は、誰かが点検しているか。",
    ],
  },
  {
    head: "そして、間に合わないものがある",
    body: [
      "この演習で最も効いたはずの手は、開戦直後の二期にしか窓が開いていなかった。その時点のあなたには、まだ何の実績もない。",
      "現代の計算力をすべて持っていても、この順序は動かせなかったはずだ。重い提案ほど早い段階にしか出せず、早い段階の発言者には信用がない。",
      "つまり、危機が来てから分析を始めるのでは遅い。信用は時間でしか積めないからだ。",
    ],
  },
  {
    head: "あなたの机の上にも、同じ帳簿がある",
    body: [
      "この演習であなたが握っていたレバーは、たった一本だった。効かないレバーだった。",
      "そして本当に効くものは、最初から画面に見えていた。",
    ],
    close: true,
  },
];

function Epilogue({ onRestart }) {
  const [i, setI] = useState(0);
  const e = EPILOGUE[i];
  const last = i === EPILOGUE.length - 1;

  return (
    <div className="min-h-screen px-6 py-12 flex items-center" style={{ background: P26.bg }}>
      <div className="max-w-lg mx-auto w-full">
        <div className="flex gap-1 mb-8">
          {EPILOGUE.map((_, k) => (
            <div key={k} style={{ flex: 1, height: 2, background: k <= i ? P26.cyan : P26.line }} />
          ))}
        </div>

        <div key={i} style={{ animation: "vp-rise 560ms cubic-bezier(.2,.9,.2,1) both" }}>
          <h2 style={{ color: P26.text, fontSize: 22, lineHeight: 1.6, letterSpacing: "0.04em" }} className="mb-6">
            {e.head}
          </h2>
          {e.body.map((t, k) => (
            <p key={k} className="mb-5" style={{
              color: P26.text, fontSize: 14, lineHeight: 2.1, opacity: 0.88,
              animation: `vp-rise 520ms ${160 + k * 140}ms cubic-bezier(.2,.9,.2,1) both`,
            }}>
              {t}
            </p>
          ))}

          {e.close && (
            <div className="mt-10 pt-6" style={{ borderTop: `1px solid ${P26.line}` }}>
              <p style={{ color: P26.cyan, fontSize: 17, lineHeight: 2, letterSpacing: "0.05em" }}>
                技術は進化した。<br />
                では、意思決定はどうか。
              </p>
            </div>
          )}
        </div>

        <div className="flex gap-2 mt-10">
          {i > 0 && (
            <button onClick={() => setI(i - 1)} className="px-5 py-3"
              style={{ border: `1px solid ${P26.line}`, color: P26.dim, fontSize: 12 }}>
              戻る
            </button>
          )}
          <button onClick={() => (last ? onRestart() : setI(i + 1))} className="flex-1 px-6 py-3"
            style={{
              background: last ? "transparent" : P26.cyan,
              border: last ? `1px solid ${P26.cyan}` : "none",
              color: last ? P26.cyan : "#04202a",
              letterSpacing: "0.2em", fontSize: 12,
            }}>
            {last ? "もう一度、1941年12月から" : "次へ"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* =========================================================================
   ルート
   ========================================================================= */

function App() {
  const [phase, setPhase] = useState("title");
  const [data, setData] = useState({});

  const restart = () => { setData({}); setPhase("title"); };
  const era = ["lens2026", "petition2", "report", "epilogue"].includes(phase) ? 2026 : 1941;

  const screen = (() => {
  switch (phase) {
    case "title":
      return <Title onNext={() => setPhase("prophecy")} />;
    case "prophecy":
      return <Prophecy onNext={(v) => { setData((d) => ({ ...d, prophecy: v })); setPhase("briefing"); }} />;
    case "briefing":
      return <Briefing onNext={() => setPhase("lens1941")} onSkip={() => setPhase("lens1941")} />;
    case "lens1941":
      return <Lens1941 onDone={(r) => { setData((d) => ({ ...d, r1941: r })); setPhase("petition1"); }} />;
    case "petition1":
      return <Petition era={1941} credit={20} lockTurn={{}}
        breach={simulate({ shipSteel: data.r1941?.shipSteel ?? 0.35 }).breach}
        onDone={() => setPhase("interlude")} />;
    case "interlude":
      return <Interlude onNext={() => setPhase("lens2026")} />;
    case "lens2026":
      return <Lens2026 onDone={(r) => { setData((d) => ({ ...d, r2026: r })); setPhase("petition2"); }} />;
    case "petition2":
      return <Petition era={2026} credit={data.r2026.credit} lockTurn={data.r2026.lockTurn}
        breach={data.r2026.breach}
        onDone={(p) => { setData((d) => ({ ...d, passed2: p })); setPhase("report"); }} />;
    case "report":
      return <Report data={data} onRestart={() => setPhase("epilogue")} />;
    case "epilogue":
      return <Epilogue onRestart={restart} />;
    default:
      return null;
  }
  })();

  return (
    <>
      <style>{KEYFRAMES}</style>
      {screen}
      <GlossaryLayer era={era} />
    </>
  );
}

/* ------------------------------------------------------------------ */
ReactDOM.createRoot(document.getElementById("root")).render(
  React.createElement(React.StrictMode, null, React.createElement(App))
);
