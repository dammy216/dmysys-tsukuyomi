import type { DroneKey } from "./dronePathType";

/**
 * 「Reply」11秒以降のドローン航路。**時刻は曲の構成の境界そのもの**なので、
 * ここを触るときは TRACK_NOTES.md §3 の表と突き合わせること。
 *
 * 半径の下限に注意: 天守は高さ約36・底面の半径約14.9あるので、
 * **y が 38 より低いキーでは radius を 20 以上**にしないと石垣に潜る。
 *
 * ここが実行時に使われる唯一の正データ(ビルド後もこのまま)。編集モードの
 * Details パネルでブラウザ上から一時的に調整できるが、その調整はページを
 * 開き直すと消える下書きにすぎない。
 *
 * **このファイルは編集モードの「コードとしてコピー」の貼り付け先。**
 * コピーした内容をこのファイルへ全選択→貼り付けするだけで確定できるよう、
 * ここには DRONE_PATH の定義だけを置く(型・補間関数は dronePathType.ts、
 * 実行時に触る可変コピーは dronePathStore.ts)。
 */
export const DRONE_PATH: readonly DroneKey[] = [
  { t: 11.0, turn: 0.0, radius: 53, y: 46, lookY: 45, fov: 68, note: "11秒: 引きの着地点。ここは従来の引きと同じ間合いに合わせてある" },
  { t: 15.0, turn: 0.09, radius: 45, y: 52, lookY: 43, fov: 66, note: "イントロ2: 上昇しながら寄る" },
  { t: 19.0, turn: 0.2, radius: 37, y: 60, lookY: 37, fov: 64 },
  { t: 23.0, turn: 0.28, radius: 34, y: 65, lookY: 35, fov: 64, note: "歌前の間: 最高高度でホバリング。会場を見下ろす" },
  { t: 27.5, turn: 0.32, radius: 33, y: 64, lookY: 36, fov: 66, note: "Aメロ: ゆっくり降りながら、見下ろし→水平へ" },
  { t: 33.5, turn: 0.43, radius: 32, y: 57, lookY: 40, fov: 66 },
  { t: 39.0, turn: 0.54, radius: 31, y: 50, lookY: 44, fov: 66 },
  { t: 45.0, turn: 0.66, radius: 29, y: 44, lookY: 45, fov: 66 },
  { t: 49.5, turn: 0.76, radius: 27, y: 40, lookY: 45, fov: 68, note: "Bメロ: 螺旋で降りながら詰める。旋回が速くなってバンクが付き始める" },
  { t: 55.0, turn: 0.96, radius: 24, y: 35, lookY: 45, fov: 70 },
  { t: 59.0, turn: 1.14, radius: 22, y: 31, lookY: 44, fov: 72 },
  { t: 62.0, turn: 1.28, radius: 21, y: 28, lookY: 45, fov: 76, note: "サビ: 最も低く近い煽り。広角で誇張する" },
  { t: 67.5, turn: 1.62, radius: 30, y: 40, lookY: 45, fov: 72, note: "サビ中: 一気に開けて大きく回る(10.5秒で0.64周=最速。バンクが深く出る)" },
  { t: 72.5, turn: 1.92, radius: 42, y: 54, lookY: 43, fov: 68 },
  { t: 78.5, turn: 2.28, radius: 34, y: 60, lookY: 39, fov: 68 },
  { t: 83.0, turn: 2.52, radius: 25, y: 45, lookY: 45, fov: 74, note: "後半: 振り戻して寄る" },
  { t: 90.0, turn: 2.92, radius: 46, y: 38, lookY: 42, fov: 70, note: "フライバイ: 外へ抜けてから低く戻る" },
  { t: 96.0, turn: 3.22, radius: 31, y: 31, lookY: 44, fov: 72 },
  { t: 101.0, turn: 3.48, radius: 23, y: 33, lookY: 45, fov: 76, note: "至近をかすめる。最後の歌詞へ向けて上昇に転じる" },
  { t: 106.0, turn: 3.76, radius: 31, y: 48, lookY: 45, fov: 70 },
  { t: 107.0, turn: 3.82, radius: 35, y: 51, lookY: 45, fov: 68, note: "アウトロ: 望遠に寄せながら引き上げていく" },
  { t: 114.0, turn: 4.02, radius: 62, y: 60, lookY: 44, fov: 62 },
  { t: 121.3, turn: 4.18, radius: 88, y: 68, lookY: 42, fov: 56, note: "フェード: 圧縮した望遠で静かに離脱する" },
  { t: 127.5, turn: 4.28, radius: 108, y: 74, lookY: 40, fov: 52 },
] as const;
