import type { DroneKey } from "./dronePathType";

/**
 * 「Reply」のドローン航路。**曲の頭(0秒)から最後まで1本**で持つ。時刻は
 * 曲の構成の境界そのものなので、触るときは TRACK_NOTES.md §3 の表と
 * 突き合わせること。
 *
 * - 0〜11秒: 天守の**組み上げ周回**。旧 `BUILD_ORBIT_DEFAULTS` の
 *   parametric な3段周回(静止 → ドリーイン → 周回しながら1周)を
 *   1秒間隔で標本化してキーフレーム化したもの。導入時点の動きに
 *   合わせてあるが、以後はここを直接いじって調整する。
 * - 11秒以降: 引きの全景からのドローン飛行。`turn` は 0〜11秒で1周
 *   まわっているぶん +1.0 されている(11秒 = turn 1.0 が正面)。
 *
 * 半径の下限に注意: 天守は高さ約36・底面の半径約14.9あるので、
 * **y が 38 より低いキーでは radius を 20 以上**にしないと石垣に潜る
 * (0〜11秒の周回だけは例外。天守がまだ組み上がっていないので詰められる)。
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
  { t: 0, turn: 0, radius: 70, y: 2, lookY: 5, fov: 68, note: "0〜11秒: 組み上げ周回(旧 BUILD_ORBIT を1秒間隔で標本化)。ここは静止" },
  { t: 1, turn: 0, radius: 70, y: 2, lookY: 7.72, fov: 68 },
  { t: 2, turn: 0, radius: 70, y: 2, lookY: 10.45, fov: 68, note: "ここまで正面で静止(旧 holdSeconds=2.5)" },
  { t: 3, turn: 0, radius: 68.46, y: 2.52, lookY: 13.17, fov: 68, note: "ドリーイン開始: まっすぐ前進(まだ回らない)" },
  { t: 4, turn: 0, radius: 58.55, y: 6.01, lookY: 15.89, fov: 68 },
  { t: 5, turn: 0, radius: 44.91, y: 11.14, lookY: 18.61, fov: 68 },
  { t: 6, turn: 0, radius: 34, y: 16, lookY: 21.34, fov: 68, note: "ドリーイン終わり=周回開始(旧 mid)。ここから回り込みながら寄る" },
  { t: 7, turn: 0.1, radius: 26.93, y: 20.8, lookY: 24.06, fov: 68 },
  { t: 8, turn: 0.35, radius: 20.76, y: 26.32, lookY: 26.78, fov: 68 },
  { t: 9, turn: 0.65, radius: 15.87, y: 31.54, lookY: 29.51, fov: 68 },
  { t: 10, turn: 0.9, radius: 12.66, y: 35.43, lookY: 32.23, fov: 68 },
  { t: 11, turn: 1, radius: 11.5, y: 36.95, lookY: 34.95, fov: 68, note: "組み上げ完了・周回の終点(ちょうど1周。正面)" },
  { t: 11.5, turn: 1.02, radius: 53, y: 46, lookY: 34.95, fov: 68, note: "引きの着地点。真後ろへ引きつつ回転はごく僅かに続ける(1.0のまま止めると11秒で旋回が完全に停まって見える)" },
  { t: 15, turn: 1.09, radius: 45, y: 52, lookY: 43, fov: 66, note: "イントロ2: 上昇しながら寄る" },
  { t: 19, turn: 1.2, radius: 37, y: 60, lookY: 37, fov: 64 },
  { t: 23, turn: 1.28, radius: 34, y: 65, lookY: 35, fov: 64, note: "歌前の間: 最高高度でホバリング。会場を見下ろす" },
  { t: 27.5, turn: 1.32, radius: 33, y: 64, lookY: 36, fov: 66, note: "Aメロ: ゆっくり降りながら、見下ろし→水平へ" },
  { t: 33.5, turn: 1.43, radius: 32, y: 57, lookY: 40, fov: 66 },
  { t: 39, turn: 1.54, radius: 31, y: 50, lookY: 44, fov: 66 },
  { t: 45, turn: 1.66, radius: 29, y: 44, lookY: 45, fov: 66 },
  { t: 49.5, turn: 1.76, radius: 27, y: 40, lookY: 45, fov: 68, note: "Bメロ: 螺旋で降りながら詰める。旋回が速くなってバンクが付き始める" },
  { t: 55, turn: 1.96, radius: 24, y: 35, lookY: 45, fov: 70 },
  { t: 59, turn: 2.14, radius: 22, y: 31, lookY: 44, fov: 72 },
  { t: 62, turn: 2.28, radius: 21, y: 28, lookY: 45, fov: 76, note: "サビ: 最も低く近い煽り。広角で誇張する" },
  { t: 67.5, turn: 2.62, radius: 30, y: 40, lookY: 45, fov: 72, note: "サビ中: 一気に開けて大きく回る(10.5秒で0.64周=最速。バンクが深く出る)" },
  { t: 72.5, turn: 2.92, radius: 42, y: 54, lookY: 43, fov: 68 },
  { t: 78.5, turn: 3.28, radius: 34, y: 60, lookY: 39, fov: 68 },
  { t: 83, turn: 3.52, radius: 25, y: 45, lookY: 45, fov: 74, note: "後半: 振り戻して寄る" },
  { t: 90, turn: 3.92, radius: 46, y: 38, lookY: 42, fov: 70, note: "フライバイ: 外へ抜けてから低く戻る" },
  { t: 96, turn: 4.22, radius: 31, y: 31, lookY: 44, fov: 72 },
  { t: 101, turn: 4.48, radius: 23, y: 33, lookY: 45, fov: 76, note: "至近をかすめる。最後の歌詞へ向けて上昇に転じる" },
  { t: 106, turn: 4.76, radius: 31, y: 48, lookY: 45, fov: 70 },
  { t: 107, turn: 4.82, radius: 35, y: 51, lookY: 45, fov: 68, note: "アウトロ: 望遠に寄せながら引き上げていく" },
  { t: 114, turn: 5.02, radius: 62, y: 60, lookY: 44, fov: 62 },
  { t: 121.3, turn: 5.18, radius: 88, y: 68, lookY: 42, fov: 56, note: "フェード: 圧縮した望遠で静かに離脱する" },
  { t: 127.5, turn: 5.28, radius: 108, y: 74, lookY: 40, fov: 52 },
] as const;
