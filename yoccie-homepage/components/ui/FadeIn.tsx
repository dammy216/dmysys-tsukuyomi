"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import styles from "./FadeIn.module.css";

type FadeInProps = {
  children: ReactNode;
  className?: string;
};

/** ビューポートに入ったらふわっと表示するラッパー */
export function FadeIn({ children, className }: FadeInProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setShown(true);
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.1 },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={`${styles.fade} ${shown ? styles.show : ""} ${className ?? ""}`}
    >
      {children}
    </div>
  );
}
