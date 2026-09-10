import { Color } from "three";
import {
  REPLY_INTRO2_LASER_HIGH,
  REPLY_INTRO2_LASER_LOW,
  REPLY_INTRO2_LASER_MID,
} from "./constants";
import {
  REPLY_SECTIONS,
  replySectionIndexAt,
  type ReplySectionName,
} from "./songStructure";

/*
  BeamLight(軒下ビーム80本)/ WashLight(破風ウォッシュ16本。castleBeamRig.ts の
  リグを共有)と、Searchlight(足元12本。別リグ)のセクション別配色。

  castleProjectionPalette.ts(天守のプロジェクションマッピング)と「セクション
  ごとの配色コンセプト」は合わせるが、**hex値はここで独立にチューニングする**
  (ユーザー指定)。理由: あちらは天守の面に貼るプロジェクションで彩度が
  そのまま見えるが、こちらは加算合成のビーム/サーチライトなので同じ彩度だと
  白飛び・彩度飽和しやすく、面のプロジェクションよりも少し絞った値が要る。

  セクション別の気分(castleProjectionPalette.ts の解説コメントと対応させてある):
    - breath  : 曲中で一番静か。ほぼ単色の寒色に絞る
    - A       : 寒色・電子(シアン/バイオレット系)
    - B       : 寒色のままピンクを少数派の差し色に忍ばせる(サビへの布石)
    - SABI    : 暖色パーティー(マゼンタ/金/熱白)
    - LATTER  : サビの熱を保ちつつ彩度を落とす
    - outro   : エンバー(白熱 → 琥珀 → 深い残り火の赤)
    - fade    : 月白のまま消えていく
    - intro-A / intro-B: **プロジェクションと同じく、既存の
      REPLY_INTRO2_LASER_LOW/MID/HIGH をそのまま流用する**(ユーザー指定。
      すでにプロジェクションのイントロ2エンバーと整合が取れているため、
      ここだけは新規チューニングしない)。なお BeamLight のレーザーモード
      (isIntro2)・Searchlight の INTRO2_SOLO はこのテーブルを見ずに
      REPLY_INTRO2_LASER_* を直接使い続けるので、実際にはこの2エントリは
      「breath への ramp のクロスフェード元」としてだけ参照される。

  **並び順が意味を持つ。** BeamLight/WashLight用の5色は取り付け高さの低い方
  から高い方(既存の CASTLE_BEAM_PALETTE と同じ「寒色→暖色」の配り方)、
  Searchlight用の3色は鏡像ペアの片側→もう片側→残り(既存の BEAM_COLORS と
  同じ配り方)の並びを踏襲している。
*/

/** BeamLight/WashLight用。取り付け高さの低い方から高い方の5色 */
type BeamPaletteRow = readonly [string, string, string, string, string];
/** Searchlight用の3色 */
type SearchlightPaletteRow = readonly [string, string, string];

const BEAM_SECTION_PALETTE: Record<ReplySectionName, BeamPaletteRow> = {
  // 11秒より手前は描画されないが、intro-B へのクロスフェード元として参照される
  "intro-A": [
    REPLY_INTRO2_LASER_LOW,
    REPLY_INTRO2_LASER_LOW,
    REPLY_INTRO2_LASER_MID,
    REPLY_INTRO2_LASER_MID,
    REPLY_INTRO2_LASER_HIGH,
  ],
  // イントロ2: 実際の描画は BeamLight の isIntro2 分岐が INTRO2_LASER_COLORS を
  // 直接使う(このテーブルは breath へ抜けるときの ramp の元にしかならない)
  "intro-B": [
    REPLY_INTRO2_LASER_LOW,
    REPLY_INTRO2_LASER_LOW,
    REPLY_INTRO2_LASER_MID,
    REPLY_INTRO2_LASER_MID,
    REPLY_INTRO2_LASER_HIGH,
  ],
  // 歌前の間。曲中で一番静かなので、ほぼ単色の寒色まで色を絞る
  breath: ["#c7d6ff", "#bdd0ff", "#b3caff", "#a8c4ff", "#9ebfff"],
  // Aメロ。寒色・電子(シアン→バイオレット)
  A: ["#2fe4ff", "#54cdff", "#7ea6ff", "#8b6cff", "#b18bff"],
  // Bメロ。寒色のまま、一番上(取り付け高さの高い側)だけピンクを差し色にして
  // サビへ寄せる(少数派 = 5枠中1枠)
  B: ["#3ee0ff", "#54c8ff", "#7288ff", "#8b6cff", "#ff3d86"],
  // サビ。暖色パーティー(マゼンタ→金→熱白)
  SABI: ["#ff3d86", "#ff6aa8", "#ffab3d", "#ffd28a", "#fff2e0"],
  // 後半。サビと同じ並びのまま彩度を落とす
  LATTER: ["#e0559a", "#e58ab0", "#f0a850", "#f0c98a", "#fdf0df"],
  // アウトロ。エンバー(白熱→琥珀→深い残り火の赤)。REPLY_INTRO2_LASER_* とは
  // 別に新規チューニングした値(ユーザー指定: プロジェクションのhexをそのまま
  // 使い回さない)
  outro: ["#ffe9c7", "#ffab3d", "#e2661f", "#c9431c", "#8f2e18"],
  // フェード。月白のまま消えていく
  fade: ["#d7e2ff", "#cddcff", "#c2d6ff", "#b8d0ff", "#adc9ff"],
};

const SEARCHLIGHT_SECTION_PALETTE: Record<ReplySectionName, SearchlightPaletteRow> = {
  "intro-A": [REPLY_INTRO2_LASER_LOW, REPLY_INTRO2_LASER_MID, REPLY_INTRO2_LASER_HIGH],
  // イントロ2: 実際の描画は Searchlight の INTRO2_SOLO が REPLY_INTRO2_LASER_* を
  // 直接使う(このテーブルは breath へ抜けるときの ramp の元にしかならない)
  "intro-B": [REPLY_INTRO2_LASER_LOW, REPLY_INTRO2_LASER_MID, REPLY_INTRO2_LASER_HIGH],
  breath: ["#c7d6ff", "#b3caff", "#9ebfff"],
  A: ["#3ee0ff", "#8b6cff", "#c9b6ff"],
  B: ["#3ee0ff", "#8b6cff", "#ff3d86"],
  SABI: ["#ff3d86", "#ffab3d", "#fff2e0"],
  LATTER: ["#e0559a", "#f0a850", "#fdf0df"],
  outro: ["#ffe9c7", "#c9431c", "#8f2e18"],
  fade: ["#cddcff", "#c2d6ff", "#adc9ff"],
};

/*
  hex を Color にパースして持つ(毎フレーム new しない。castleProjectionPalette.ts
  の PARSED と同じ考え方)。
*/
function parseSectionPalette<T extends readonly string[]>(
  table: Record<ReplySectionName, T>,
): Record<ReplySectionName, readonly Color[]> {
  const parsed = {} as Record<ReplySectionName, readonly Color[]>;
  for (const name of Object.keys(table) as ReplySectionName[]) {
    parsed[name] = table[name].map((hex) => new Color(hex));
  }
  return parsed;
}

const PARSED_BEAM = parseSectionPalette(BEAM_SECTION_PALETTE);
const PARSED_SEARCHLIGHT = parseSectionPalette(SEARCHLIGHT_SECTION_PALETTE);

function smoothstep(x: number): number {
  const k = x < 0 ? 0 : x > 1 ? 1 : x;
  return k * k * (3 - 2 * k);
}

/**
 * 曲の再生位置 t(秒)のセクション別配色を out[] へ書く(in-place)。
 *
 * out は呼び出し側が createBeamPaletteBuffer / createSearchlightPaletteBuffer で
 * 一度だけ作った配列を毎フレーム使い回すこと(useFrame内でnewしないため)。
 * castleProjectionPalette.sampleCastleProjection と同じ考え方 ―― 添字ごとに
 * 前セクションから section.ramp 秒かけて RGB クロスフェードする。
 */
function sampleSectionPalette(
  parsed: Record<ReplySectionName, readonly Color[]>,
  t: number,
  out: readonly Color[],
): void {
  const time = Number.isFinite(t) ? t : 0;
  const si = replySectionIndexAt(time);
  const section = REPLY_SECTIONS[si];
  const cur = parsed[section.name];
  const prev = parsed[REPLY_SECTIONS[Math.max(si - 1, 0)].name];
  const k =
    section.ramp > 0 ? smoothstep((time - section.start) / section.ramp) : 1;
  for (let i = 0; i < out.length; i++) {
    out[i].lerpColors(prev[i], cur[i], k);
  }
}

/**
 * BeamLight/WashLight が useMemo で一度だけ作り、useFrame から
 * sampleBeamSectionPalette で毎フレーム上書きして使い回すバッファ。
 */
export function createBeamPaletteBuffer(): Color[] {
  return Array.from({ length: 5 }, () => new Color());
}

/** Searchlight 用の同種バッファ(3色) */
export function createSearchlightPaletteBuffer(): Color[] {
  return Array.from({ length: 3 }, () => new Color());
}

/**
 * BeamLight.tsx と WashLight.tsx の両方が、それぞれの useFrame から**同じ
 * songTime を渡して**この関数を呼ぶ。この関数自体は時刻だけの純粋な計算
 * (castleBeamRig.sampleCastleRig と同じ性質)なので、2箇所から独立に呼んでも
 * 結果は必ず一致し、2つのリグの色は揃って動く。
 */
export function sampleBeamSectionPalette(t: number, out: readonly Color[]): void {
  sampleSectionPalette(PARSED_BEAM, t, out);
}

/** Searchlight.tsx 用。上と同じ考え方(3色版) */
export function sampleSearchlightSectionPalette(
  t: number,
  out: readonly Color[],
): void {
  sampleSectionPalette(PARSED_SEARCHLIGHT, t, out);
}
