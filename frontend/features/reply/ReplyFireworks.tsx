"use client";

import { useEffect, useMemo, useRef, type RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  ShaderMaterial,
} from "three";
import {
  BEAM_COLORS,
  CASTLE_TOP_Y,
  REPLY_BAR_ORIGIN,
  REPLY_BAR_SECONDS,
  REPLY_BASE_POSITION,
  REPLY_GLOW_COLOR,
} from "./constants";

/* ------------------------------------------------------------------ *
 * 打ち上げ花火。**曲の小節グリッドに乗せて**、Bメロ後半〜サビ〜後半だけ上げる。
 *
 * TRACK_NOTES.md §4.3 の通り、元映像の編集はビートに同期していない。なので
 * 「拍ごとにパッパッと弾ける」花火にはしない。2小節(2.82秒)に1発という
 * ゆったりした間隔で上げ、弾けたあとは物理で流して落とす = 連続量で見せる。
 * ------------------------------------------------------------------ */

/** 1発あたりの粒の数 */
const PARTICLES_PER_SHELL = 110;
/** 打ち上げ(ロケットが昇る)にかける秒数 */
const RISE_SECONDS = 1.05;
/** 弾けてから消えるまでの秒数 */
const LIFE_SECONDS = 2.6;
/** 何小節ごとに1発上げるか。サビ/後半はこの間隔 */
const SHELL_INTERVAL_BARS = 2;
/** Bメロ後半の「溜め」で上げる間隔(小節)。サビより疎にして差を作る */
const BUILD_INTERVAL_BARS = 4;

/**
 * 花火を上げる区間(秒)。TRACK_NOTES.md §3 のセクション境界に合わせてある。
 * - Bメロ後半(55〜62): サビへの溜め。疎に上げる
 * - サビ(62〜83) / 後半(83〜106.5): 本番。2小節に1発
 * アウトロ(107〜)以降は上げない。音が引くところで絵だけ残ると浮くため。
 */
const BUILD_FROM = 55.0;
const BUILD_TO = 62.0;
const MAIN_FROM = 62.0;
const MAIN_TO = 106.5;

/**
 * 大玉を上げる位置(秒)。曲の山に合わせた指定。
 * 62.0 サビ頭 / 83.0 後半頭 / 106.0 最後の「キラめいてうたおう」
 */
const FINALE_TIMES = [62.0, 83.0, 106.0] as const;
/** 大玉の粒の初速の倍率。通常の玉より大きく開く */
const FINALE_SPEED_SCALE = 1.5;

/** 打ち上げ位置の塔の中心からの距離(ワールド単位) */
const ORIGIN_RADIUS_MIN = 45;
const ORIGIN_RADIUS_MAX = 105;
/** 弾ける高さ。天守の頂部より上、ホログラムと同じくらいの空 */
const BURST_Y_MIN = CASTLE_TOP_Y + 14;
const BURST_Y_MAX = CASTLE_TOP_Y + 58;
/** 粒の初速(ワールド単位/秒)。玉の開く大きさ */
const BURST_SPEED_MIN = 11;
const BURST_SPEED_MAX = 17;

/** 粒の大きさ(点スプライトの基準サイズ) */
const PARTICLE_SIZE_MIN = 1.6;
const PARTICLE_SIZE_MAX = 3.2;

/**
 * 決定的な擬似乱数。Math.random() を使うと再マウントのたびに配置が変わり、
 * 「同じ曲なのに毎回違う花火」になってしまう。曲に固定で紐づけたいので
 * 添字から決まる値にする。
 */
function hash(n: number) {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/**
 * 玉と玉の最小間隔(秒)。これより近いものは捨てる。
 *
 * 大玉(FINALE_TIMES)を先に置いてから小節グリッドを重ねるので、大玉の
 * すぐ脇に定期の玉が来ることがある(例: 62.0 の大玉と 62.84 の定期玉)。
 * 1秒足らずの間隔で2発上がると「狙って上げた」ではなく「ズレた」に見えるため、
 * 2小節間隔(2.82秒)より十分小さく、かつ大玉の脇を吸収できる値にしてある。
 */
const MIN_SHELL_GAP = 1.2;

/** 花火を上げる時刻(=弾ける時刻)を小節グリッドから組み立てる */
function buildBurstTimes(): number[] {
  const times: number[] = [];
  const push = (t: number) => {
    // 大玉の脇や同じ小節で二重に上がらないよう、近すぎるものは捨てる
    if (!times.some((v) => Math.abs(v - t) < MIN_SHELL_GAP)) times.push(t);
  };

  for (const t of FINALE_TIMES) push(t);

  // 小節頭を走査して、区間ごとの間隔で拾う
  const totalBars = Math.ceil((MAIN_TO - REPLY_BAR_ORIGIN) / REPLY_BAR_SECONDS);
  for (let bar = 0; bar <= totalBars; bar++) {
    const t = REPLY_BAR_ORIGIN + bar * REPLY_BAR_SECONDS;
    if (t >= BUILD_FROM && t < BUILD_TO) {
      if (bar % BUILD_INTERVAL_BARS === 0) push(t);
    } else if (t >= MAIN_FROM && t <= MAIN_TO) {
      if (bar % SHELL_INTERVAL_BARS === 0) push(t);
    }
  }

  return times.sort((a, b) => a - b);
}

const VERTEX = /* glsl */ `
  uniform float uTime;
  uniform float uOpacity;

  attribute float aLaunch;
  attribute vec3 aOrigin;
  attribute vec3 aBurst;
  attribute vec3 aDir;
  attribute float aSpeed;
  attribute float aSize;
  attribute float aSeed;
  attribute vec3 aColor;

  varying float vAlpha;
  varying vec3 vColor;

  const float RISE = ${RISE_SECONDS.toFixed(3)};
  const float LIFE = ${LIFE_SECONDS.toFixed(3)};
  /** 空気抵抗。大きいほど早く失速して、ふわりと垂れる */
  const float DRAG = 1.15;
  /** 重力。実寸ではなく見栄えで決めた値 */
  const float G = 9.0;

  void main() {
    float age = uTime - aLaunch;
    vec3 p = aBurst;
    float alpha = 0.0;
    float sizeScale = 1.0;

    if (age >= 0.0 && age <= RISE + LIFE) {
      if (age < RISE) {
        /*
          打ち上げ。粒は1点に集まったままイーズアウトで昇るので、
          尾を引く1つの光点(ロケット)に見える。
        */
        float k = age / RISE;
        p = mix(aOrigin, aBurst, 1.0 - pow(1.0 - k, 2.0));
        p += aDir * 0.25;
        alpha = 0.9 * smoothstep(0.0, 0.08, k);
        sizeScale = 0.45;
      } else {
        /*
          弾けたあと。線形抵抗つき放物運動の解析解で流す。
            v' = -DRAG*v + g
            x(t) = x0 + (v0 - g/DRAG)*(1-e^-DRAG*t)/DRAG + (g/DRAG)*t
          等速の放射だと「ウニ」のまま消えるが、これだと外周が失速して
          尾が垂れ下がるので花火らしくなる。
        */
        float u = age - RISE;
        vec3 g = vec3(0.0, -G, 0.0);
        vec3 v0 = aDir * aSpeed;
        p = aBurst + (v0 - g / DRAG) * (1.0 - exp(-DRAG * u)) / DRAG
          + (g / DRAG) * u;

        float life = u / LIFE;
        alpha = (1.0 - life) * (1.0 - life);
        // ちらつき。粒ごとに位相をずらして、消え際をざらつかせる
        alpha *= 0.65 + 0.35 * sin(u * 26.0 + aSeed * 40.0);
      }
    }

    vAlpha = alpha * uOpacity;
    vColor = aColor;

    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = aSize * sizeScale * (300.0 / max(-mv.z, 1.0));
  }
`;

const FRAGMENT = /* glsl */ `
  varying float vAlpha;
  varying vec3 vColor;

  void main() {
    if (vAlpha <= 0.002) discard;
    vec2 d = gl_PointCoord - 0.5;
    float r2 = dot(d, d);
    if (r2 > 0.25) discard;
    // 芯が明るく縁が落ちる丸。加算合成なので中心が白く飛ぶ
    float f = 1.0 - r2 * 4.0;
    gl_FragColor = vec4(vColor * (0.6 + 0.4 * f), vAlpha * f * f);
  }
`;

/** シェーダーへ毎フレーム書く uniform。曲の再生位置と全体の濃さだけ */
type FireworkUniforms = {
  uTime: { value: number };
  uOpacity: { value: number };
};

type ReplyFireworksProps = {
  /** 曲(=ホログラム映像)の再生位置(秒)を持つ ref */
  songTimeRef: RefObject<number>;
  /**
   * 演出強度(0〜1)。サビで濃く、静かな所で薄くする。
   * ここに曲のフェードも掛かった値を渡す(SceneContents 側で合成する)。
   */
  intensityRef: RefObject<number>;
};

/**
 * 曲の小節グリッドに乗せて上がる打ち上げ花火。
 *
 * 玉の配置・色・弾ける高さは添字から決まる決定的な値なので、
 * 何周しても毎回同じ位置に同じ花火が上がる(曲に紐づいた演出になる)。
 */
export function ReplyFireworks({
  songTimeRef,
  intensityRef,
}: ReplyFireworksProps) {
  const { geometry, material } = useMemo(() => {
    const bursts = buildBurstTimes();
    const shellCount = bursts.length;
    const total = shellCount * PARTICLES_PER_SHELL;

    const launch = new Float32Array(total);
    const origin = new Float32Array(total * 3);
    const burst = new Float32Array(total * 3);
    const dir = new Float32Array(total * 3);
    const speed = new Float32Array(total);
    const size = new Float32Array(total);
    const seed = new Float32Array(total);
    const color = new Float32Array(total * 3);

    const palette = [...BEAM_COLORS, REPLY_GLOW_COLOR].map((c) => new Color(c));
    const tint = new Color();

    for (let s = 0; s < shellCount; s++) {
      const burstAt = bursts[s];
      const isFinale = FINALE_TIMES.some((t) => Math.abs(t - burstAt) < 0.4);

      /*
        玉ごとの配置。添字から決まるので毎周同じ場所に上がる。
        塔(REPLY_BASE_POSITION)を中心に取り囲ませる。このコンポーネントは
        group に入れずワールド座標へ直接置くので、ここで基準位置を足しておく。
      */
      const angle = hash(s * 3.1) * Math.PI * 2;
      const radius =
        ORIGIN_RADIUS_MIN +
        hash(s * 7.7) * (ORIGIN_RADIUS_MAX - ORIGIN_RADIUS_MIN);
      const ox = REPLY_BASE_POSITION[0] + Math.sin(angle) * radius;
      const oz = REPLY_BASE_POSITION[2] + Math.cos(angle) * radius;
      const by = BURST_Y_MIN + hash(s * 5.3) * (BURST_Y_MAX - BURST_Y_MIN);
      const shellSpeed =
        (BURST_SPEED_MIN + hash(s * 2.9) * (BURST_SPEED_MAX - BURST_SPEED_MIN)) *
        (isFinale ? FINALE_SPEED_SCALE : 1);

      tint.copy(palette[Math.floor(hash(s * 11.3) * palette.length) % palette.length]);

      for (let i = 0; i < PARTICLES_PER_SHELL; i++) {
        const p = s * PARTICLES_PER_SHELL + i;
        const n = p * 3;

        // 打ち上げ時刻は「弾ける時刻」から昇る時間を引いたもの
        launch[p] = burstAt - RISE_SECONDS;

        origin[n] = ox;
        origin[n + 1] = 0;
        origin[n + 2] = oz;

        burst[n] = ox;
        burst[n + 1] = by;
        burst[n + 2] = oz;

        /*
          球面上に一様分布させる。緯度を acos(1-2u) で取らないと
          極に粒が溜まって「団子」になる。
        */
        const u = hash(p * 1.7);
        const v = hash(p * 4.1);
        const theta = v * Math.PI * 2;
        const phi = Math.acos(1 - 2 * u);
        const sinPhi = Math.sin(phi);
        dir[n] = sinPhi * Math.cos(theta);
        dir[n + 1] = Math.cos(phi);
        dir[n + 2] = sinPhi * Math.sin(theta);

        // 粒ごとに初速をばらして、球殻ではなく厚みのある玉にする
        speed[p] = shellSpeed * (0.55 + hash(p * 9.2) * 0.45);
        size[p] =
          PARTICLE_SIZE_MIN +
          hash(p * 6.4) * (PARTICLE_SIZE_MAX - PARTICLE_SIZE_MIN);
        seed[p] = hash(p * 8.8);

        color[n] = tint.r;
        color[n + 1] = tint.g;
        color[n + 2] = tint.b;
      }
    }

    const geo = new BufferGeometry();
    // position は使わないが、無いと three が描画をスキップするので置く
    geo.setAttribute("position", new BufferAttribute(burst.slice(), 3));
    geo.setAttribute("aLaunch", new BufferAttribute(launch, 1));
    geo.setAttribute("aOrigin", new BufferAttribute(origin, 3));
    geo.setAttribute("aBurst", new BufferAttribute(burst, 3));
    geo.setAttribute("aDir", new BufferAttribute(dir, 3));
    geo.setAttribute("aSpeed", new BufferAttribute(speed, 1));
    geo.setAttribute("aSize", new BufferAttribute(size, 1));
    geo.setAttribute("aSeed", new BufferAttribute(seed, 1));
    geo.setAttribute("aColor", new BufferAttribute(color, 3));

    const mat = new ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uOpacity: { value: 0 },
      },
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
    });

    return { geometry: geo, material: mat };
  }, []);

  /*
    useFrame 内で useMemo の戻り値を直接触ると react-hooks/immutability に
    引っかかるため ref 経由で書く(CornerTowers / EdoCastle と同じ手当て)。
  */
  const uniformsRef = useRef<FireworkUniforms | null>(null);

  /*
    あわせて GPU 資源の破棄もここで行う。geometry / material は useMemo で
    自前に作ったものなので、R3F の自動破棄には乗らない。
  */
  useEffect(() => {
    uniformsRef.current = material.uniforms as FireworkUniforms;
    return () => {
      geometry.dispose();
      material.dispose();
    };
  }, [geometry, material]);

  useFrame(() => {
    const uniforms = uniformsRef.current;
    if (!uniforms) return;
    uniforms.uTime.value = songTimeRef.current ?? 0;
    uniforms.uOpacity.value = Math.max(intensityRef.current ?? 0, 0);
  });

  return (
    /*
      位置はすべて頂点シェーダーで作るので、three の持つ境界球は当てにならない
      (原点の位置しか入っていない)。frustumCulled を切らないと、カメラが
      振れた拍子に玉ごと消える。
    */
    <points geometry={geometry} material={material} frustumCulled={false} />
  );
}
