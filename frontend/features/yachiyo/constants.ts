/** ヤチヨ（Rive キャラクター）の設定 */

/**
 * public/ に置く .riv ファイルのパス（Rive エディタからエクスポートして配置）。
 * web専用のYachiyo.rivは廃止し、mobileと共通のAIYachiyo(aiyachiyo.riv)に統一した。
 */
export const RIV_SRC = "/Charactors/aiyachiyo.riv";

/** .riv 内のステートマシン名（これを指定しないと Luau スクリプトが動かない） */
export const STATE_MACHINE = "State Machine 1";

/**
 * .riv 内のアートボード名。"web copy"用に書き出すと、Riveの書き出しはその時点で
 * アクティブなアートボード1つしか.rivに含めないため、mobile用の"ベース"が
 * 一緒に書き出せず動かなくなる問題があった。そのためwebもmobileと同じ
 * "ベース"(1025x1025の正方形)アートボードをそのまま使う。
 */
export const ARTBOARD = "ベース";

/**
 * リップシンク用に React → Rive へ渡す ViewModel の Number プロパティ名。
 * Rive エディタ側で CharacterAnim ViewModel にこの名前で追加し、
 * Luau スクリプト（advance）が値を読んで口パク・笑顔・弾む動きに変換する。
 */
export const VM_SING_AMPLITUDE = "singAmplitude";

/** 振幅をこの閾値以上で「歌っている」表示にする */
export const SINGING_THRESHOLD = 0.12;
