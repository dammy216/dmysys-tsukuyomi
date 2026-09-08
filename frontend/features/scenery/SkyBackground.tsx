"use client";

import { useEffect, useMemo } from "react";
import { useTexture } from "@react-three/drei";
import {
  CanvasTexture,
  EquirectangularReflectionMapping,
  SRGBColorSpace,
} from "three";

/**
 * 空の見た目パターン。黄昏時(dusk)・星降る海の夜(night)・Replyの夜(reply)。
 * dusk / night は equirect 画像を貼る。reply だけは画像をやめて、
 * Canvas で描いた「滞のグラデーション + まばらな星」の夜空にしてある
 * (天の川の写真だと絵がうるさく、参照(なだらかな紺のグラデ)と違うため)。
 */
export type SkyVariant = "dusk" | "night" | "reply";

const SKY_PATHS: Record<"dusk" | "night", string> = {
  dusk: "/images/sky-vertical.png",
  night: "/images/aurora-vertical.png",
};

/* ------------------------------------------------------------------ *
 * dusk / night: equirect 画像をそのまま空に貼る(反射(水面)にも映り込む)
 * ------------------------------------------------------------------ */

function ImageSky({ path }: { path: string }) {
  const loaded = useTexture(path);
  const texture = useMemo(() => {
    const clone = loaded.clone();
    clone.mapping = EquirectangularReflectionMapping;
    clone.colorSpace = SRGBColorSpace;
    clone.needsUpdate = true;
    return clone;
  }, [loaded]);
  return (
    <>
      <primitive object={texture} attach="background" />
      <primitive object={texture} attach="environment" />
    </>
  );
}

/* ------------------------------------------------------------------ *
 * reply: 天の川の写真ではなく、縦グラデーション + まばらな星を Canvas で描く
 * ------------------------------------------------------------------ */

/** 決定的な擬似乱数(mulberry32)。星をシードから毎回同じ位置に置く */
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const REPLY_SKY_SEED = 20260908;

/** Reply の空に描く月。向き(高度/方位)は reply/constants.ts の REPLY_MOON_* */
export type ReplyMoonConfig = {
  /** 高度(ラジアン。水平=0) */
  altitude: number;
  /** 方位(ラジアン。北=0、東=π/2)。North=-Z / East=+X */
  azimuth: number;
  /** 見かけの直径(テクスチャ高さに対する割合) */
  size: number;
};

/**
 * 月を equirect 位置へ描く。**星と同じレイヤー(この Canvas)に置く**ので、
 * 3D メッシュやポスプロの合成の癖に一切左右されない。
 * equirect: u = atan2(z,x)/2π + 0.5 / v = asin(y)/π + 0.5(three の equirectUv)。
 * flipY のぶん canvas_y = (1 - v) * h(画像上端が天頂)。
 */
function drawMoon(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  moon: ReplyMoonConfig,
) {
  const dx = Math.cos(moon.altitude) * Math.sin(moon.azimuth);
  const dy = Math.sin(moon.altitude);
  const dz = -Math.cos(moon.altitude) * Math.cos(moon.azimuth);
  const u = Math.atan2(dz, dx) / (Math.PI * 2) + 0.5;
  const v = Math.asin(dy) / Math.PI + 0.5;
  const mx = u * w;
  const my = (1 - v) * h;
  const r = (moon.size * h) / 2;

  // ハロー(月のまわりの淡いにじみ)
  const halo = ctx.createRadialGradient(mx, my, r * 0.5, mx, my, r * 4);
  halo.addColorStop(0, "rgba(214, 226, 255, 0.5)");
  halo.addColorStop(0.32, "rgba(160, 186, 240, 0.12)");
  halo.addColorStop(1, "rgba(160, 186, 240, 0)");
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, w, h);

  // 月本体(縁をほんの少しぼかす)
  const body = ctx.createRadialGradient(mx, my, r * 0.62, mx, my, r);
  body.addColorStop(0, "#fdfdff");
  body.addColorStop(0.88, "#eef2fc");
  body.addColorStop(1, "rgba(238, 242, 252, 0)");
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.arc(mx, my, r, 0, Math.PI * 2);
  ctx.fill();

  // 海(まだら)。円盤にクリップして薄い青灰で軽く暗く
  ctx.save();
  ctx.beginPath();
  ctx.arc(mx, my, r * 0.97, 0, Math.PI * 2);
  ctx.clip();
  const maria: [number, number, number, number][] = [
    [mx - r * 0.3, my - r * 0.24, r * 0.44, 0.17],
    [mx + r * 0.22, my - r * 0.02, r * 0.3, 0.13],
    [mx - r * 0.02, my + r * 0.32, r * 0.34, 0.11],
  ];
  for (const [cx, cy, cr, ca] of maria) {
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, cr);
    g.addColorStop(0, `rgba(122, 140, 180, ${ca})`);
    g.addColorStop(1, "rgba(122, 140, 180, 0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }
  ctx.restore();
}

/**
 * equirect の夜空を Canvas で描く。**Reply は月夜のイメージ**なので、
 * 真っ暗にはせず、天頂まで少し明るさを残した柔らかい紺にする。
 *  - 縦グラデ: 画像上端=天頂(月夜の柔らかい紺) → 中央=水平線(いちばん明るい青) →
 *    下端=天底(暗い。水面下・反射用)
 *  - 細かい星。上空側(画像の上)ほど密になるよう分布を寄せる
 *  - 満月(moon 指定時)。星と同じレイヤーに描く
 * これ1枚で background / environment / 水面の反射をまかなう(画像と同じ扱い)。
 */
function useReplySkyTexture(moon?: ReplyMoonConfig): CanvasTexture | null {
  return useMemo(() => {
    if (typeof document === "undefined") return null;
    const w = 2048;
    const h = 1024;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    /*
      **上半分(天頂→水平線)の暗くなり方をゆるく**する(月夜なので天頂を
      黒く落とさない)。水平線と下半分は据え置き ―― 全体を明るくするのでは
      なく、天頂の暗さだけ持ち上げる。
    */
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0.0, "#182d52"); // 天頂(月夜。水平線に近い明るさまで持ち上げる)
    grad.addColorStop(0.3, "#1b3459");
    grad.addColorStop(0.5, "#1d3a5e"); // 水平線: いちばん明るい青
    grad.addColorStop(0.58, "#0f2038");
    grad.addColorStop(1.0, "#05080f"); // 天底
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    const rand = mulberry32(REPLY_SKY_SEED);
    const STAR_COUNT = 640;
    for (let i = 0; i < STAR_COUNT; i++) {
      const x = rand() * w;
      // 上空(y小)ほど密。水平線より下にはほぼ置かない
      const y = Math.pow(rand(), 1.6) * h * 0.6;
      // 小さめ。ほとんどは 1px 前後、ごく一部だけ 1.6px ほど
      const r = 0.45 + Math.pow(rand(), 3) * 1.1;
      const a = 0.3 + rand() * 0.55;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(248, 250, 255, ${a})`;
      ctx.fill();
      // いちばん明るい星だけ、ごく淡いにじみ
      if (r > 1.35) {
        ctx.beginPath();
        ctx.arc(x, y, r * 2.4, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(190, 215, 255, ${a * 0.08})`;
        ctx.fill();
      }
    }

    // 星のあとに月(星が月の上に乗らないよう最後)
    if (moon) drawMoon(ctx, w, h, moon);

    const tex = new CanvasTexture(canvas);
    tex.mapping = EquirectangularReflectionMapping;
    tex.colorSpace = SRGBColorSpace;
    tex.needsUpdate = true;
    return tex;
  }, [moon]);
}

function ReplySky({ moon }: { moon?: ReplyMoonConfig }) {
  const texture = useReplySkyTexture(moon);
  useEffect(() => () => texture?.dispose(), [texture]);
  if (!texture) return null;
  return (
    <>
      <primitive object={texture} attach="background" />
      <primitive object={texture} attach="environment" />
    </>
  );
}

export function SkyBackground({
  variant,
  replyMoon,
}: {
  variant: SkyVariant;
  /** reply の空に描く満月。変えないなら安定した参照を渡すこと(毎回新 obj だと再生成) */
  replyMoon?: ReplyMoonConfig;
}) {
  if (variant === "reply") return <ReplySky moon={replyMoon} />;
  return <ImageSky path={SKY_PATHS[variant]} />;
}

useTexture.preload(SKY_PATHS.dusk);
useTexture.preload(SKY_PATHS.night);
