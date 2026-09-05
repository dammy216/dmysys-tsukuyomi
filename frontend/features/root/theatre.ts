"use client";

import { getProject } from "@theatre/core";
import type { IStudio } from "@theatre/studio";

/**
 * Theatre.js のプロジェクト。シーン全体でこれ1つだけをモジュールスコープで
 * 生成し、各 feature はここから `sheet("フィーチャー名")` を切って使う。
 *
 * 命名規則: project="Scene" → sheet はfeature名(例 "Reply" "Starfall Sea") →
 * object はそのfeature内の具体的な対象名(例 "Drone Path" "Path")。
 * Studio パネルには `Scene > <feature名> > <object名>` の階層で並ぶ。
 *
 * 新しい feature へ広げる場合はこの sceneProject を import し、
 * `sceneProject.sheet("フィーチャー名").object("対象名", {...})` を作るだけでよい。
 * getProject/sheet/object はどちらも「同じ名前なら同じインスタンスを返す」
 * ため、モジュールが複数回evalされない限り重複生成の心配はない。
 */
export const sceneProject = getProject("Scene");

/**
 * @theatre/studio の Studio パネルは開発時のみ起動する(公開サイトに
 * 編集UIを含めないため)。SceneContents から**1箇所だけ**呼ぶ想定だが、
 * React の StrictMode 等で effect が2回走っても studio.initialize() を
 * 二重に呼ばないよう、モジュールスコープのフラグで一度きりに絞る。
 *
 * 何もレンダリングしない副作用のみの関数。呼び出し側で useEffect(() => {
 * initTheatreStudio(); }, []) のように1回だけ呼ぶ。
 *
 * Studio のパネルは起動直後は**非表示**にしておく。表示したままだと
 * 常時左上のDMYSYSヘッダー・右上のFPS統計パネル(SceneStats)と
 * 位置が被る(Studio側にUIの初期位置・z-indexを変えるオプションが無い
 * ため、こちらの見た目を動かすのではなく「使うときだけ出す」方で解決する)。
 * Lキーで studio.ui.hide()/restore() をトグルして必要なときだけ呼び出す。
 */
let studioInitialized = false;

/**
 * 初期化が終わった studio インスタンス。各featureの「コードから
 * キーフレームを打つ」シード処理(下の exposeDevSeed 参照)がここから
 * studio.transaction を呼ぶ。初期化前(dynamic import解決前)は null。
 */
let studioInstance: IStudio | null = null;

/** 初期化済みの studio インスタンスを返す(未初期化なら null)。 */
export function getStudio(): IStudio | null {
  return studioInstance;
}

export function initTheatreStudio() {
  if (process.env.NODE_ENV !== "development") return;
  if (studioInitialized) return;
  studioInitialized = true;
  import("@theatre/studio").then((studioModule) => {
    const studio = studioModule.default;
    studioInstance = studio;
    studio.initialize();
    studio.ui.hide();
    window.addEventListener("keydown", (e) => {
      if (e.key !== "l" && e.key !== "L") return;
      if (studio.ui.isHidden) {
        studio.ui.restore();
      } else {
        studio.ui.hide();
      }
    });
  });
}

/**
 * 開発時のみ、`window.<name>()` として呼べる関数を登録する。
 * コードに残っている手組みのキーフレーム値(DRONE_PATH/PATH等)を
 * `studio.transaction` で実際のTheatre.jsキーフレームへ一括投入する、
 * 一度きりの移行スクリプトをブラウザのコンソールから呼ぶために使う。
 * 本番ビルドには含まれない。
 */
export function exposeDevSeed(name: string, fn: () => void) {
  if (process.env.NODE_ENV !== "development") return;
  (globalThis as unknown as Record<string, () => void>)[name] = fn;
}
