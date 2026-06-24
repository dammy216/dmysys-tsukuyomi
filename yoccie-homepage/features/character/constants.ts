/** ヤチヨ（Rive キャラクター）の設定 */

/** public/ に置く .riv ファイルのパス（Rive エディタからエクスポートして配置） */
export const RIV_SRC = "/Yachiyo.riv";

/** .riv 内のステートマシン名（これを指定しないと Luau スクリプトが動かない） */
export const STATE_MACHINE = "State Machine 1";

/**
 * リップシンク用に React → Rive へ渡す ViewModel の Number プロパティ名。
 * Rive エディタ側で CharacterAnim ViewModel にこの名前で追加し、
 * Luau スクリプト（advance）が値を読んで口パク・笑顔・弾む動きに変換する。
 */
export const VM_SING_AMPLITUDE = "singAmplitude";

/** 振幅をこの閾値以上で「歌っている」表示にする */
export const SINGING_THRESHOLD = 0.12;
