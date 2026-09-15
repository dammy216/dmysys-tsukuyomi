import timelineData from "./mouthVowelTimeline.json";

/**
 * Reply の歌詞(かな読み)をモーラ分解し、track-timeline.json の行タイミング
 * (耳取りで検証済み)で行内を均等割りして作った母音タイムライン。
 * JSON は歌詞の行ごとに区切って見やすくしてある({line: かな読み, moras: [...]})。
 * 1モーラ = {t: 開始秒(vocals基準), vowel: 0〜5}。vowel=0 は「ん」用の特別値で、
 * webKaguya.lua 側はこれを受けると母音を出さず default_mouth(閉じ口)に譲る。
 * 生成手順は `/graphify` 等のツール群とは別で、映像のカラオケテロップを解析して
 * 作った一回きりのデータ(再生成用スクリプトはリポジトリに含めていない)。
 */
type MouthVowelEntry = { t: number; vowel: number };
type MouthVowelLine = { line: string; moras: MouthVowelEntry[] };

// 行ごとの構造は読みやすさのためだけのもの。参照は全モーラを1本に平らにした配列で行う
// (行をまたいでも t は昇順なので、そのまま二分探索できる)。
const TIMELINE: MouthVowelEntry[] = (timelineData as MouthVowelLine[]).flatMap(
  (l) => l.moras,
);

/**
 * 曲の再生位置(秒)から、そのとき発声しているモーラの母音(1=あ〜5=お)を返す。
 * 二分探索で「t 以下で最後のエントリ」を探す(タイムラインは t 昇順)。
 */
export function getMouthVowelAt(songTime: number): number {
  if (TIMELINE.length === 0) return 1;
  if (songTime < TIMELINE[0].t) return TIMELINE[0].vowel;

  let lo = 0;
  let hi = TIMELINE.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (TIMELINE[mid].t <= songTime) {
      lo = mid;
    } else {
      hi = mid - 1;
    }
  }
  return TIMELINE[lo].vowel;
}
