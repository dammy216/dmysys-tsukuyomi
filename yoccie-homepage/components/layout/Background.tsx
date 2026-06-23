"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./Background.module.css";

const IMAGES = ["/images/bg1.png", "/images/bg2.png", "/images/bg3.png"];
const INTERVAL_MS = 5000;
const FADE_MS = 500;

/** 5秒ごとにふわっと切り替わる固定背景 */
export function Background() {
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(true);
  const indexRef = useRef(0);

  useEffect(() => {
    const id = setInterval(() => {
      setVisible(false); // フェードアウト
      setTimeout(() => {
        indexRef.current = (indexRef.current + 1) % IMAGES.length;
        setIndex(indexRef.current);
        setVisible(true); // 次の画像をフェードイン
      }, FADE_MS);
    }, INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  return (
    <div
      className={styles.bg}
      style={{
        backgroundImage: `url(${IMAGES[index]})`,
        opacity: visible ? 1 : 0,
      }}
    />
  );
}
