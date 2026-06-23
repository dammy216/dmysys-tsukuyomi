/** BGM 関連の定数 */

export type TrackId = "part1" | "part2" | "lastChorus";

export const TRACKS: { id: TrackId; label: string; src: string }[] = [
  { id: "part1", label: "🎵 1パート", src: "/music/music1.opus" },
  { id: "part2", label: "🎵 2パート", src: "/music/music2.opus" },
  { id: "lastChorus", label: "🎵 ラスサビ", src: "/music/music3.opus" },
];

/** 「全部」ボタンで流す YouTube 動画 ID */
export const YOUTUBE_VIDEO_ID = "bx4lbDvsVW4";

export const DEFAULT_VOLUME = 0.5;

/** localStorage キー（ページ間で再生状態を引き継ぐ） */
export const STORAGE_KEYS = {
  type: "tsukuyomi_bgm_type",
  src: "tsukuyomi_bgm_src",
  time: "tsukuyomi_bgm_time",
  volume: "tsukuyomi_volume",
} as const;
