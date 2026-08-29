"use client";

import { useEffect } from "react";
import { addEffect, addAfterEffect } from "@react-three/fiber";
import StatsImpl from "stats.js";
import styles from "./SceneStats.module.css";

/**
 * drei の <Stats>（stats.js）相当のパフォーマンスパネル。
 * ただし stats.js 本来の「クリックで FPS→MS→MB を1枚ずつ切替」ではなく、
 * 既定は FPS のみ表示 / クリックで MS・MB をその下にドロップダウン展開する。
 * 各項目の意味: FPS=毎秒フレーム数, MS=1フレームの描画ミリ秒, MB=JSヒープ使用量(Chrome系のみ)。
 */
export function SceneStats() {
  useEffect(() => {
    const stats = new StatsImpl();
    const dom = stats.dom;
    dom.classList.add(...styles.stats.split(" ").filter(Boolean));

    // 子要素は fpsPanel / msPanel /（Chrome系なら）memPanel の <canvas>
    const panels = Array.from(dom.children) as HTMLElement[];
    let expanded = false;
    const apply = () => {
      panels.forEach((el, i) => {
        el.style.display = expanded || i === 0 ? "block" : "none";
      });
    };
    apply();

    /*
      stats.js 標準の「クリックで巡回」ハンドラ(コンストラクタで bubble 登録済み)を
      capture フェーズで止め、展開トグルに差し替える。
    */
    const onClick = (e: Event) => {
      e.stopImmediatePropagation();
      e.preventDefault();
      expanded = !expanded;
      apply();
    };
    dom.addEventListener("click", onClick, true);

    document.body.appendChild(dom);
    const unsubBegin = addEffect(() => stats.begin());
    const unsubEnd = addAfterEffect(() => stats.end());

    return () => {
      dom.removeEventListener("click", onClick, true);
      unsubBegin();
      unsubEnd();
      dom.remove();
    };
  }, []);

  return null;
}
