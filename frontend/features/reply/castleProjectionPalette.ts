import { Color } from "three";
import {
  REPLY_SECTIONS,
  replySectionIndexAt,
  type ReplySectionName,
} from "./songStructure";

/*
  プロジェクションマッピングのセクション別配色。

  castleBuildShader の投影は当初「シアン/バイオレット/月白 + サビの一撃で金」
  固定だったが、曲のセクションで3色パレット(uProjA / uProjB / uProjC)を
  差し替える。castleBeamRig の CUES と同じく **section.ramp 秒かけて前セクション
  から RGB クロスフェード**する(段差のまま切り替えると境界のフレームで色が飛ぶ)。

  - Aメロ    = 寒色・電子(シアン / バイオレット / 月白)。ユーザーが「この感触」と
               決めた基準。B / breath / fade はこの寒色寄りの派生。
  - イントロ2 = **エンバー(白熱 → 琥珀 → 深い残り火)**。11.05秒は天守が
               組み上がりきる瞬間 + ベース入り(曲で一番の「バーン」)なので、
               組み上げの熱の連続性は残しつつパンチが要る。純赤(#ff3d1a)は
               彩度が高すぎて警告色に寄る、というユーザー指摘で、多数派を
               白熱+琥珀にしてパンチを出し、深い残り火の赤は少数派の差し色に
               留める。そこから breath で寒色へ冷える。
               アウトロ(イントロ2再現)も同じエンバー。
  - サビ     = 暖色パーティー(マゼンタ / 金 / 熱白。ユーザー指定)。寒色の歌
               パートと対比させて曲の山と色温度を一致させる。元映像の
               「ピンク×金」を *クライマックスの色* としてだけ使う。
               後半(LATTER)はその少し彩度落とし。
               → 全体の弧: エンバー(点火) → 寒色(歌) → 暖色(サビ) → エンバー(再現)。

  金の一撃(uProjHit / castleBeamRig の castleHitAt)はこの表とは独立
  ―― サビ・後半の頭でだけ、点灯中パネルの一部が金へフラッシュする。

  3色は castleBuildShader 側でパネルの ~45% / ~40% / ~15% に配られる
  (uProjC = 少数派。2色のあいだに抜けを作る枠)。
*/

/** 1セクションぶんの3色。並び順 = パネルへの配り分け(多数派 → 少数派) */
type ProjectionTriple = readonly [string, string, string];

const PROJECTION_PALETTE: Record<ReplySectionName, ProjectionTriple> = {
  // 11秒より手前は投影が点いていないが、intro-B へのクロスフェード元として参照される
  "intro-A": ["#ffe6d4", "#ffab3d", "#b83a1e"],
  // イントロ2: エンバー。白熱 + 琥珀を多数派に、深い残り火の赤は差し色
  "intro-B": ["#ffe6d4", "#ffab3d", "#b83a1e"],
  // 歌前の間: 曲中で一番静か。ほぼ単色の月白まで色を抜く
  breath: ["#dce6ff", "#dce6ff", "#eef4ff"],
  // Aメロ: 寒色・電子。ユーザーが決めた基準
  A: ["#3ee0ff", "#8b6cff", "#dce6ff"],
  // Bメロ: 寒色のまま、少数派にピンクを忍ばせてサビへ寄せる
  B: ["#3ee0ff", "#8b6cff", "#ff3d86"],
  // サビ: 暖色パーティー。マゼンタ / 金 / 熱白
  SABI: ["#ff3d86", "#ffab3d", "#fff2e0"],
  // 後半: サビの熱を保ちつつ少し彩度を落とす
  LATTER: ["#f0559a", "#f0a850", "#fff2e0"],
  // アウトロ = イントロ2再現。同じエンバー
  outro: ["#ffe6d4", "#ffab3d", "#b83a1e"],
  // フェード: 月白のまま消えていく
  fade: ["#dce6ff", "#dce6ff", "#dce6ff"],
};

/*
  表の hex を Color にパースして持つ(毎フレーム new しない)。three の
  Color コンストラクタは sRGB 文字列を作業空間へ変換するので、既存の
  PROJECTION_COLOR_* を new Color したものと同じ扱いになる。
*/
const PARSED = {} as Record<ReplySectionName, readonly [Color, Color, Color]>;
for (const name of Object.keys(PROJECTION_PALETTE) as ReplySectionName[]) {
  const [a, b, c] = PROJECTION_PALETTE[name];
  PARSED[name] = [new Color(a), new Color(b), new Color(c)];
}

function smoothstep(x: number): number {
  const k = x < 0 ? 0 : x > 1 ? 1 : x;
  return k * k * (3 - 2 * k);
}

/**
 * 曲の再生位置 t(秒)の投影3色を out{A,B,C} へ書く。EdoCastle / CornerTowers が
 * 毎フレーム自分の uProjA/B/C.value(建物ごとに clone 済みの Color)を渡して
 * 呼ぶ ―― 戻り値を new しないための in-place 書き込み。
 * セクション境界は section.ramp 秒でひとつ前からクロスフェードする。
 */
export function sampleCastleProjection(
  t: number,
  outA: Color,
  outB: Color,
  outC: Color,
): void {
  const time = Number.isFinite(t) ? t : 0;
  const si = replySectionIndexAt(time);
  const section = REPLY_SECTIONS[si];
  const cur = PARSED[section.name];
  const prev = PARSED[REPLY_SECTIONS[Math.max(si - 1, 0)].name];
  const k =
    section.ramp > 0 ? smoothstep((time - section.start) / section.ramp) : 1;
  outA.lerpColors(prev[0], cur[0], k);
  outB.lerpColors(prev[1], cur[1], k);
  outC.lerpColors(prev[2], cur[2], k);
}
