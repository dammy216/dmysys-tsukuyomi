/** 動画書き出しの解像度/fpsプリセット(ExportPanel のプルダウン) */

export type ResolutionPreset = {
  label: string;
  width: number;
  height: number;
};

/**
 * 3Dビューポート自体の縦横比(EditorAspectRatioMenuの「画面比率」)とは
 * 無関係に、書き出しは常にこの固定解像度リストから選ぶ。
 *
 * 21:9(ウルトラワイド)は実在するモニタの標準解像度(UWQHD/5K2K)をそのまま
 * 使う。1440p/4Kと縦の解像度(=映像の情報量)を揃えてあるので、同じ「1440p
 * クラス」「4Kクラス」として選びやすい。
 */
export const RESOLUTION_PRESETS: readonly ResolutionPreset[] = [
  { label: "1080p", width: 1920, height: 1080 },
  { label: "1440p", width: 2560, height: 1440 },
  { label: "4K", width: 3840, height: 2160 },
  { label: "1440p ウルトラワイド(21:9)", width: 3440, height: 1440 },
  /*
   * 21:9そのまま(5120×2160)は avc(H.264) のレベルが 6.0 相当になり、
   * ほとんどの環境(ソフトウェア/ハードウェアエンコーダ問わず)で
   * "not supported in this environment" と拒否される(ユーザー実機で確認)。
   * 横幅は動作実績のある「4K」プリセットと同じ 3840 に抑え、21:9 相当の
   * 縦幅(3840÷21×9)を当てる。
   */
  { label: "4K ウルトラワイド(21:9相当)", width: 3840, height: 1640 },
];

export type FpsPreset = {
  label: string;
  fps: number;
  /** 重い組み合わせ(4K×120fpsなど)への注記。無ければ表示しない */
  note?: string;
};

export const FPS_PRESETS: readonly FpsPreset[] = [
  { label: "30fps", fps: 30 },
  { label: "60fps", fps: 60 },
  { label: "120fps", fps: 120, note: "書き出しに時間がかかります" },
];
