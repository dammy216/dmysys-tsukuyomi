/** かぐや（Rive キャラクター）の設定 */

/** public/ に置いた .riv ファイルのパス（Rive エディタからエクスポートして配置） */
export const RIV_SRC = "/Charactors/webkaguya.riv";

/**
 * .riv 内のステートマシン名。ヤチヨ側の命名慣例（"State Machine 1"）からの仮値。
 * 実際のRiveエディタ上のステートマシン名と一致しない場合はここを修正すること。
 */
export const STATE_MACHINE = "State Machine 1";

/**
 * 歌唱モード用に React → Rive へ渡す ViewModel の Number プロパティ名（0〜1の音量振幅）。
 * webKaguya.lua の advance() がこの値から自動で母音を選び口パクさせる。
 */
export const VM_SING_AMPLITUDE = "singAmplitude";

/**
 * 歌唱モード中の横振りの周期（秒、1往復にかかる時間）を上書きする ViewModel プロパティ名。
 * webKaguya.lua 側は 0.05 秒以下 or 未バインドならデフォルト値(SING_GRAB_PERIOD=2.4秒)を使う。
 */
export const VM_SING_GRAB_PERIOD = "singGrabPeriod";

/** たばこモードのオン/オフ用 ViewModel プロパティ名（0.5より大きいとON扱い） */
export const VM_SMOKING = "smoking";

/** スマイルモードのオン/オフ用 ViewModel プロパティ名（0.5より大きいとON扱い。目だけ笑顔になる） */
export const VM_SMILE = "smile";
