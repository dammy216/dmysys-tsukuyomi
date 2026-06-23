"use client";

import { useState } from "react";
import Image from "next/image";
import { FadeIn } from "@/components/ui/FadeIn";
import type { ImageInfo, SnsLink } from "../data/members";
import styles from "./members.module.css";

type MemberCardProps = {
  name: string;
  intro: string;
  /** 名前の色クラス（styles.subName / styles.modName）。鯖主は rainbow を使用 */
  nameClassName?: string;
  rainbow?: boolean;
  /** 鯖主の立ち絵 */
  illust?: ImageInfo;
  /** 鯖主の丸アイコン */
  icon?: ImageInfo;
  /** 副官の丸アイコン */
  miniIcon?: ImageInfo;
  sns?: SnsLink[];
  etc?: string;
};

/** 自己紹介を開閉できるメンバーカード（鯖主・副官・モデレーター共通） */
export function MemberCard({
  name,
  intro,
  nameClassName,
  rainbow,
  illust,
  icon,
  miniIcon,
  sns,
  etc,
}: MemberCardProps) {
  const [open, setOpen] = useState(false);

  return (
    <FadeIn className={styles.member}>
      {illust && (
        <Image
          className={styles.square}
          src={illust.src}
          width={illust.width}
          height={illust.height}
          alt={`${name}のイラスト`}
          sizes="(max-width: 768px) 100vw, 650px"
        />
      )}
      {icon && (
        <Image
          className={styles.icon}
          src={icon.src}
          width={icon.width}
          height={icon.height}
          alt={`${name}のアイコン`}
          sizes="120px"
        />
      )}
      {miniIcon && (
        <Image
          className={styles.miniIcon}
          src={miniIcon.src}
          width={miniIcon.width}
          height={miniIcon.height}
          alt={`${name}のアイコン`}
          sizes="88px"
        />
      )}

      <div className={`${styles.name} ${nameClassName ?? ""}`}>
        <button
          type="button"
          className={`${styles.nameButton} ${rainbow ? "rainbow-text" : ""}`}
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
        >
          {name}
          <span className={`${styles.arrow} ${open ? styles.arrowOpen : ""}`}>
            ▼
          </span>
        </button>
      </div>

      <div className={`${styles.introBox} ${open ? styles.introBoxOpen : ""}`}>
        <div className={styles.introContent}>{intro}</div>
      </div>

      {sns && sns.length > 0 && (
        <div className={styles.sns}>
          {sns.map((link) => (
            <a
              key={link.type}
              className={`${styles.snsButton} ${styles[link.type]}`}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
            >
              {link.label}
            </a>
          ))}
        </div>
      )}

      {etc && <div className={styles.etc}>{etc}</div>}
    </FadeIn>
  );
}
