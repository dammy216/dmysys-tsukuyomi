import { Vector2 } from "three";

/**
 * 「星降る海」演出のタイミング・強度チューニング定数。
 * 旧 Sandbox3D.tsx 冒頭から集約。SceneContents の useFrame がこれらを読む。
 */

/** 色収差のズレ量。強すぎると輪郭が滲んで“ぼやけ”に見えるため控えめにする */
export const ABERRATION_OFFSET = new Vector2(0.0004, 0.0006);

/** 星降る海モードの立ち上がり/収まりにかかる秒数 */
export const STARFALL_FADE_SECONDS = 1.6;

/**
 * ボタンを押してから、魚の大群(StarfallSwarm)と水中フィルター(Underwater)を
 * 立ち上げるまでの遅延秒数。泡(Bubbles)はこの間も出したままだが、見た目だけ
 * 鳥居の発光と同じ「光る玉」にしておき、この秒数が経ってから泡の見た目に
 * 切り替わる(Bubbles.tsx参照)。
 */
export const HEAVY_EFFECTS_DELAY_SECONDS = 20.5;

/**
 * 水中エフェクトの強さ。通常時はOFF(BASE=0)にしておき、星降る海が
 * 始まった瞬間から水に沈んでいくように FULL まで立ち上げる。
 */
export const UNDERWATER_BASE = 0;
export const UNDERWATER_FULL = 1;
/**
 * 転調中に水中フィルターをどれだけ弱めるか(0=そのまま, 1=完全に無効)。
 * このフィルターは赤を落として青緑に寄せるため、強いままだと転調で
 * 増やしたマゼンタ・黄の粒が青側に引き戻されて色が立たない。
 */
export const UNDERWATER_SURGE_RELIEF = 0.65;

/**
 * ホログラムに映る動画がこの時刻(1:22)に達したら転調演出に入る。
 * HEAVY_EFFECTS_DELAY_SECONDSと違い、ボタンを押してからの経過時間ではなく
 * 動画自体の再生位置(currentTime)で判定する(曲の見せ場に同期させるため)。
 * StarfallCamera.tsx の DOLLY_IN_END_SECONDS(カメラがホログラムから離れ始める
 * 時刻)と同じ値。変えるときは両方直すこと。
 */
export const SURGE_START_SECONDS = 82;

/**
 * 転調に入る何秒前から魚を暗くし始めるか。1:13(73秒)から暗くし始めたいので
 * SURGE_START_SECONDS(82秒)との差の9秒にしてある。
 */
export const PRE_SURGE_WINDUP_SECONDS = 9;
/**
 * 暗くなり始め(windupStart)から何秒で最も暗い状態まで達するか。
 * PRE_SURGE_WINDUP_SECONDSより短くすることで、暗くなり始めるタイミングは
 * そのままに、暗くなりきるまでの速さだけ早める。最大まで達したあとは
 * 転調(SURGE_START_SECONDS)まで最も暗い状態を維持し、転調の閃光と
 * 入れ替わりで一気に明るくなる。
 */
export const PRE_SURGE_RAMP_SECONDS = 0.4;
/**
 * 転調直前の暗転で、水面の光・泡をどこまで暗くするか(0=変化なし〜1=真っ暗)。
 * 魚(StarfallSwarm.tsx)側は同じ意図の値をシェーダーの定数として別に持っているので、
 * 見た目の暗さを揃えたい場合はそちらの PRE_SURGE_DARKEN も合わせて変えること。
 */
export const PRE_SURGE_DARKEN = 0.75;
/**
 * 鳥居の発光は魚(PRE_SURGE_DARKEN=0.75)ほどは落とさないが、ホログラム映像
 * (ToriiHologram.tsxのPRE_SURGE_DARKEN=0.3)よりは一段暗くして、暗転で
 * 鳥居のシルエットが浮かないようにする。
 */
export const TORII_PRE_SURGE_DARKEN = 0.5;

/*
  転調(動画1:22)に合わせた盛り上げ演出。参考映像でも同じ時刻で
  白い閃光を挟んでから、それまでの青一色の世界が
  マゼンタ・黄・シアン・緑のネオンが乱舞する画へ切り替わる。
  閃光で「切り替わった」瞬間ははっきり見せつつ、色自体はここでアニメーション的に
  クロスフェードさせる(短すぎると色の変化がコマ送りのように一気に見えてしまう)。
*/
/** 転調の色・光量が切り替わるまでの秒数 */
export const SURGE_FADE_SECONDS = 1.4;
/**
 * 転調の瞬間に一度だけ焚く白い閃光の長さ(秒)。
 * これがあることで色が変わる瞬間が「切り替わった」とはっきり分かる。
 */
export const SURGE_FLASH_SECONDS = 0.5;
/** 閃光のピーク時に足す露出。1.0で通常の倍の明るさになる */
export const SURGE_FLASH_EXPOSURE = 1.15;

/**
 * ホログラムに映る動画がこの時刻(2:18)に達したら、演出をまとめて
 * フェードアウトして星降る海に入る前の見た目へ戻す(曲の終わりの余韻)。
 * 動画・音源は141.8秒でループするので、0秒へ戻ればまた最初から立ち上がる。
 */
export const OUTRO_START_SECONDS = 138;
/**
 * フェードアウトにかける秒数。立ち上がり(STARFALL_FADE_SECONDS=1.6秒)より
 * ゆっくりにして、余韻を残しながら静かに引いていくようにする。
 */
export const OUTRO_FADE_SECONDS = 4;
