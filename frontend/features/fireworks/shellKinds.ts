/**
 * 花火の「型」の定義と、玉1発ぶんの粒を撒く処理。
 *
 * 参考にしたのは日本の競技花火(尺玉)の見た目。動画から拾った型は6つ:
 *
 *   kiku   芯入り菊   金の光条 + 中に色違いの同心円。いちばん華やか
 *   peony  色玉      小さくまとまった単色の丸。数を並べて使う
 *   kamuro 冠菊(しだれ) 長く垂れる金の柳。パチパチと瞬きながら水面まで落ちる
 *   senrin 千輪      大きく開いたあと、粒ひとつひとつが**もう一度**小さく咲く
 *   ring   型物(輪)   粒が輪の上に並んだまま広がる。土星のように傾けて置く
 *   fan    水上の扇   水面から低い角度で扇状に噴き上げる。打ち上げ区間は無い
 *
 * 型の違いは **(1)uniform のプロファイル (2)初速の配り方** の2つだけで、
 * シェーダーは fireworkShader.ts の1本を全型で共有している。
 */

import { Color } from "three";

export type Vec3 = [number, number, number];

/** 花火の型 */
export type FireworkKind =
  | "kiku"
  | "peony"
  | "kamuro"
  | "senrin"
  | "ring"
  | "fan";

/**
 * 型ごとの物理・見た目の定数。そのままシェーダーの uniform になる。
 *
 * 玉の**開く半径はおおよそ `speed / drag`** で決まる(抵抗で止まるところ)。
 * 垂れ下がる速さは `gravity / drag`(終端速度)。この2つを見ながら数値を
 * 決めてある ―― たとえば菊は speed 20 / drag 0.62 → 半径およそ32、
 * 終端 11/s なので消えるころに 25 ほど垂れる。
 */
export type FireworkProfile = {
  /** 打ち上げ(ロケットが昇る)秒数。0 なら最初から開いている(水上の扇) */
  rise: number;
  /** 開いてから消えるまでの秒数 */
  life: number;
  drag: number;
  gravity: number;
  /** 尾が何秒ぶんの残像か */
  trailSpan: number;
  /** 尾を何点で描くか。1粒あたりの頂点数がこれ倍になる */
  trailSteps: number;
  /** ちらつきの強さ(0〜1) */
  glitter: number;
  /** 開いた瞬間の閃光の強さ */
  flash: number;
  /** 粒の初速の基準値。ShellPlan.scale はこれに掛かる */
  speed: number;
};

export const FIREWORK_PROFILES: Record<FireworkKind, FireworkProfile> = {
  // 光条をまっすぐ長く見せたいので抵抗は弱め、尾は長め
  kiku: {
    rise: 1.05,
    life: 3.6,
    drag: 0.62,
    gravity: 7,
    trailSpan: 0.42,
    trailSteps: 18,
    glitter: 0.25,
    flash: 0.9,
    speed: 20,
  },
  // 丸くまとまったまま消える。抵抗を強くして早く止める
  peony: {
    rise: 1.0,
    life: 2.3,
    drag: 1.7,
    gravity: 8,
    trailSpan: 0.16,
    trailSteps: 5,
    glitter: 0.15,
    flash: 0.8,
    speed: 22,
  },
  // 柳。終端 15.7/s でだらだら落ち続ける。尾がいちばん長い型
  kamuro: {
    rise: 1.15,
    life: 5.0,
    drag: 0.7,
    gravity: 11,
    trailSpan: 0.9,
    trailSteps: 20,
    glitter: 0.75,
    flash: 0.7,
    speed: 16,
  },
  // 大きく開いて止まり、そこから子玉が咲く。二段目は同じ drag で飛ぶので小さい
  senrin: {
    rise: 1.1,
    life: 4.2,
    drag: 1.15,
    gravity: 5.5,
    trailSpan: 0.3,
    trailSteps: 10,
    glitter: 0.55,
    flash: 0.85,
    speed: 26,
  },
  // 輪の形を保たせたいので抵抗を強く・重力を弱く。尾はほぼ無し(点で並ぶ)
  ring: {
    rise: 1.0,
    life: 3.0,
    drag: 1.9,
    gravity: 2.2,
    trailSpan: 0.06,
    trailSteps: 3,
    glitter: 0.1,
    flash: 0.6,
    speed: 46,
  },
  /*
    水面から噴き上げる。rise 0 = 打ち上げ区間なしで、その場でいきなり開く。
    てっぺんが天守(高さ約36)と同じくらいになるよう speed/gravity を取った
    ―― これより低いと水面に張り付いた「生け垣」に見えてしまう。
  */
  fan: {
    rise: 0,
    life: 3.0,
    drag: 0.55,
    gravity: 10,
    trailSpan: 0.5,
    trailSteps: 16,
    glitter: 0.5,
    flash: 0.4,
    speed: 42,
  },
};

/**
 * 玉1発の指定。**「いつ・どこで・どれくらい」だけ**を持ち、粒の撒き方は
 * 型(FireworkKind)側が決める。
 */
export type ShellPlan = {
  /** 開く時刻(秒。曲の再生位置) */
  at: number;
  /** 打ち上げ位置(地上)。fan では扇の中心 */
  from: Vec3;
  /** 開く位置(空)。fan では from と同じで構わない */
  to: Vec3;
  /** 玉の大きさ。プロファイルの speed に掛かる */
  scale?: number;
  /** 乱数の種。同じ種なら毎周まったく同じ形に開く */
  seed?: number;
  /** 色の指定(省略時は型ごとの既定色) */
  colors?: readonly string[];
};

/** 粒1つ。これを trailSteps 個の頂点に展開して描く */
export type FireworkParticle = {
  launch: number;
  origin: Vec3;
  burst: Vec3;
  vel: Vec3;
  /** 二段目(分裂後)の初速 */
  breakVel: Vec3;
  /** 分裂までの秒数。負なら分裂しない */
  breakAt: number;
  size: number;
  seed: number;
  color: Color;
  tint: Color;
};

/**
 * 決定的な擬似乱数。Math.random() だと再マウントのたびに形が変わり
 * 「同じ曲なのに毎回違う花火」になってしまうので、種から決まる値にする。
 */
export function hash(n: number) {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/**
 * フィボナッチ球。単なる乱数で向きを配ると粒が固まって「団子」になるが、
 * こちらは球面にほぼ等間隔で並ぶので、**縁のそろった丸い玉**になる。
 * 動画の菊のように光条がきれいに放射状へ伸びるのはこれのおかげ。
 */
function fibonacciDir(i: number, n: number): Vec3 {
  const y = 1 - (2 * i + 1) / n;
  const r = Math.sqrt(Math.max(1 - y * y, 0));
  // 黄金角
  const phi = i * 2.399963229728653;
  return [Math.cos(phi) * r, y, Math.sin(phi) * r];
}

/** ベクトル v に垂直な正規直交基底を作る(型物の輪を傾けて置くのに使う) */
function basisFrom(axis: Vec3): [Vec3, Vec3] {
  const [ax, ay, az] = axis;
  // axis と平行になりにくい方の軸を選んでから外積を取る
  const helper: Vec3 = Math.abs(ay) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  let ux = ay * helper[2] - az * helper[1];
  let uy = az * helper[0] - ax * helper[2];
  let uz = ax * helper[1] - ay * helper[0];
  const ul = Math.hypot(ux, uy, uz) || 1;
  ux /= ul;
  uy /= ul;
  uz /= ul;
  const vx = ay * uz - az * uy;
  const vy = az * ux - ax * uz;
  const vz = ax * uy - ay * ux;
  return [
    [ux, uy, uz],
    [vx, vy, vz],
  ];
}

/* ------------------------------------------------------------------ *
 * 既定の色。動画(競技花火)から拾った配色。
 * ------------------------------------------------------------------ */

/** 菊の外殻。金 */
const KIKU_SHELL = "#ffd9a0";
/** 菊の芯。青白 / 緑 を玉ごとに替える(動画では緑の芯が印象的だった) */
const KIKU_CORES = ["#8fd8ff", "#6bff9e", "#b9c4ff"] as const;
/** 消え際に落ちる色。金は橙へ、青白はそのまま暗く */
const KIKU_TINT = "#ff9a4a";

const PEONY_COLORS = ["#ffe27a", "#7aa8ff", "#ff6a72", "#72ffa8"] as const;

const KAMURO_COLOR = "#ffcb72";
/** 柳の熾火。消え際にここまで落とすと「燃え尽きる」感じが出る */
const KAMURO_TINT = "#ff5418";

const SENRIN_PARENT = "#ffe0a8";
const SENRIN_SUBS = ["#7dff9c", "#ffd98a", "#ff7ad0", "#9fd4ff"] as const;

const RING_COLORS = [
  "#4fd8ff",
  "#ff5fc8",
  "#a8ff5f",
  "#ffc24a",
  "#5f7dff",
] as const;

const FAN_COLOR = "#ffe0a0";
const FAN_TINT = "#ff8a3d";

/* ------------------------------------------------------------------ *
 * 型ごとの粒の撒き方。
 * ------------------------------------------------------------------ */

/** 1発あたりの粒の数(型によって違う) */
const KIKU_OUTER = 170;
const KIKU_CORE = 72;
const PEONY_COUNT = 150;
const KAMURO_COUNT = 130;
/** 千輪の親玉(=あとで咲く子玉)の数と、子玉1つが撒く粒の数 */
const SENRIN_PARENTS = 64;
const SENRIN_SUBS_PER_PARENT = 8;
const RING_COUNT = 64;
/** 型物の中心に入れる小さな芯 */
const RING_PISTIL = 22;
const FAN_JETS = 9;
const FAN_PER_JET = 34;

const NO_BREAK: Vec3 = [0, 0, 0];

function push(
  out: FireworkParticle[],
  p: Omit<FireworkParticle, "breakVel" | "breakAt"> &
    Partial<Pick<FireworkParticle, "breakVel" | "breakAt">>,
) {
  out.push({ breakVel: NO_BREAK, breakAt: -1, ...p });
}

/**
 * 芯入り菊。外殻(金の光条)と芯(色違いの同心円)の二重構造。
 * 外殻の初速をほぼ揃えるのがコツで、揃っているほど縁が立って
 * 「まっすぐな光条が放射状に伸びる」動画の見た目になる。
 */
function emitKiku(plan: ShellPlan, out: FireworkParticle[]) {
  const prof = FIREWORK_PROFILES.kiku;
  const { at, from, to, seed = 0, scale = 1 } = plan;
  const launch = at - prof.rise;
  const base = prof.speed * scale;
  const shellColor = new Color(plan.colors?.[0] ?? KIKU_SHELL);
  const coreColor = new Color(
    plan.colors?.[1] ??
      KIKU_CORES[Math.floor(hash(seed * 3.7) * KIKU_CORES.length)],
  );
  const tint = new Color(KIKU_TINT);

  for (let i = 0; i < KIKU_OUTER; i++) {
    const d = fibonacciDir(i, KIKU_OUTER);
    // ±5% だけばらす。これ以上ばらすと縁がぼやけて光条が消える
    const s = base * (0.95 + hash(seed * 11.3 + i) * 0.1);
    push(out, {
      launch,
      origin: from,
      burst: to,
      vel: [d[0] * s, d[1] * s, d[2] * s],
      size: 1.3 + hash(seed * 5.1 + i * 1.7) * 1.0,
      seed: hash(seed * 2.3 + i * 0.31),
      color: shellColor,
      tint,
    });
  }

  for (let i = 0; i < KIKU_CORE; i++) {
    const d = fibonacciDir(i, KIKU_CORE);
    // 外殻の 0.42 倍。内側にもう一回り小さい玉が浮いて見える
    const s = base * 0.42 * (0.93 + hash(seed * 7.9 + i) * 0.14);
    push(out, {
      launch,
      origin: from,
      burst: to,
      vel: [d[0] * s, d[1] * s, d[2] * s],
      size: 1.2 + hash(seed * 6.7 + i * 2.1) * 0.9,
      seed: hash(seed * 4.4 + i * 0.53),
      color: coreColor,
      // 芯は色を保ったまま暗くする(金へ寄せると二重に見えなくなる)
      tint: coreColor,
    });
  }
}

/** 単色の色玉。小さく丸く、数を並べて使う */
function emitPeony(plan: ShellPlan, out: FireworkParticle[]) {
  const prof = FIREWORK_PROFILES.peony;
  const { at, from, to, seed = 0, scale = 1 } = plan;
  const launch = at - prof.rise;
  const base = prof.speed * scale;
  const color = new Color(
    plan.colors?.[0] ??
      PEONY_COLORS[Math.floor(hash(seed * 13.1) * PEONY_COLORS.length)],
  );

  for (let i = 0; i < PEONY_COUNT; i++) {
    const d = fibonacciDir(i, PEONY_COUNT);
    const s = base * (0.92 + hash(seed * 9.3 + i) * 0.16);
    push(out, {
      launch,
      origin: from,
      burst: to,
      vel: [d[0] * s, d[1] * s, d[2] * s],
      size: 1.6 + hash(seed * 3.3 + i * 1.1) * 1.1,
      seed: hash(seed * 8.1 + i * 0.27),
      color,
      tint: color,
    });
  }
}

/**
 * 冠菊(しだれ柳)。初速をばらして重力で垂らす。
 * 尾がいちばん長く、ちらつきも強い ―― 動画で水面まで落ちていく金の筋。
 */
function emitKamuro(plan: ShellPlan, out: FireworkParticle[]) {
  const prof = FIREWORK_PROFILES.kamuro;
  const { at, from, to, seed = 0, scale = 1 } = plan;
  const launch = at - prof.rise;
  const base = prof.speed * scale;
  const color = new Color(plan.colors?.[0] ?? KAMURO_COLOR);
  const tint = new Color(plan.colors?.[1] ?? KAMURO_TINT);

  for (let i = 0; i < KAMURO_COUNT; i++) {
    const d = fibonacciDir(i, KAMURO_COUNT);
    /*
      柳は縁をそろえない。初速を 0.8〜1.15 とばらして「垂れ始める高さ」を
      粒ごとに変えると、falling の筋がそろわずに束になる。
    */
    const s = base * (0.8 + hash(seed * 17.7 + i) * 0.35);
    push(out, {
      launch,
      origin: from,
      burst: to,
      vel: [d[0] * s, d[1] * s, d[2] * s],
      size: 1.8 + hash(seed * 5.9 + i * 1.3) * 1.1,
      seed: hash(seed * 12.7 + i * 0.41),
      color,
      tint,
    });
  }
}

/**
 * 千輪。親玉が大きく開いて止まったところで、粒ひとつひとつが
 * **もう一度**小さく咲く。兄弟の粒は分裂までまったく同じ軌道を通るので、
 * それまでは1つの明るい子玉に見える(=動画の、点がパッと花になる瞬間)。
 */
function emitSenrin(plan: ShellPlan, out: FireworkParticle[]) {
  const prof = FIREWORK_PROFILES.senrin;
  const { at, from, to, seed = 0, scale = 1 } = plan;
  const launch = at - prof.rise;
  const base = prof.speed * scale;
  const parentColor = new Color(plan.colors?.[0] ?? SENRIN_PARENT);

  for (let k = 0; k < SENRIN_PARENTS; k++) {
    const d = fibonacciDir(k, SENRIN_PARENTS);
    const s = base * (0.9 + hash(seed * 21.1 + k) * 0.2);
    const vel: Vec3 = [d[0] * s, d[1] * s, d[2] * s];
    // 咲くタイミングを少しずらす。そろっていると一斉すぎて機械的に見える
    const breakAt = 0.5 + hash(seed * 6.1 + k * 3.3) * 0.16;
    const subColor = new Color(
      SENRIN_SUBS[Math.floor(hash(seed * 15.5 + k * 1.9) * SENRIN_SUBS.length)],
    );

    for (let i = 0; i < SENRIN_SUBS_PER_PARENT; i++) {
      const sd = fibonacciDir(i, SENRIN_SUBS_PER_PARENT);
      // 子玉は小さく。同じ drag で飛ぶので半径はおよそ 4/1.15 ≒ 3.5
      const ss = 4 * scale * (0.7 + hash(seed * 3.1 + k * 7 + i) * 0.6);
      push(out, {
        launch,
        origin: from,
        burst: to,
        vel,
        breakVel: [sd[0] * ss, sd[1] * ss, sd[2] * ss],
        breakAt,
        size: 1.3 + hash(seed * 9.7 + k * 5 + i) * 0.9,
        seed: hash(seed * 2.9 + k * 11 + i * 0.7),
        // 分裂前は親の金、分裂後(=寿命の後半)は子玉の色へ移る
        color: parentColor,
        tint: subColor,
      });
    }
  }
}

/**
 * 型物(輪)。粒を1つの平面上の円周に並べ、その向きへ等速で飛ばす。
 * 抵抗が強いのですぐ止まり、傾いた輪が空に残る(動画の土星型)。
 */
function emitRing(plan: ShellPlan, out: FireworkParticle[]) {
  const prof = FIREWORK_PROFILES.ring;
  const { at, from, to, seed = 0, scale = 1 } = plan;
  const launch = at - prof.rise;
  const base = prof.speed * scale;
  const palette = (plan.colors ?? RING_COLORS).map((c) => new Color(c));

  // 輪の傾き。真横を向くと線に潰れるので、法線が手前寄りになる範囲で振る
  const tilt = (hash(seed * 4.9) - 0.5) * 1.1;
  const spin = hash(seed * 8.3) * Math.PI * 2;
  const axis: Vec3 = [
    Math.sin(tilt) * Math.cos(spin),
    Math.sin(tilt) * Math.sin(spin) + 0.25,
    Math.cos(tilt),
  ];
  const al = Math.hypot(axis[0], axis[1], axis[2]) || 1;
  const unitAxis: Vec3 = [axis[0] / al, axis[1] / al, axis[2] / al];
  const [u, v] = basisFrom(unitAxis);

  for (let i = 0; i < RING_COUNT; i++) {
    const ang = (i / RING_COUNT) * Math.PI * 2;
    const c = Math.cos(ang);
    const s = Math.sin(ang);
    // 速度をきっちり揃える。ばらすと輪が滲んで型物に見えない
    const dir: Vec3 = [
      u[0] * c + v[0] * s,
      u[1] * c + v[1] * s,
      u[2] * c + v[2] * s,
    ];
    // 色は輪に沿って何色かが繰り返す(動画の多色の輪)
    const color = palette[i % palette.length];
    push(out, {
      launch,
      origin: from,
      burst: to,
      vel: [dir[0] * base, dir[1] * base, dir[2] * base],
      size: 3.0 + hash(seed * 7.1 + i) * 1.2,
      seed: hash(seed * 1.9 + i * 0.83),
      color,
      tint: color,
    });
  }

  // 中心の芯。輪だけだと真ん中が寂しいので小さな玉を入れる
  const pistil = palette[Math.floor(hash(seed * 19.3) * palette.length)];
  for (let i = 0; i < RING_PISTIL; i++) {
    const d = fibonacciDir(i, RING_PISTIL);
    const s = base * 0.12;
    push(out, {
      launch,
      origin: from,
      burst: to,
      vel: [d[0] * s, d[1] * s, d[2] * s],
      size: 2.4 + hash(seed * 22.1 + i) * 0.9,
      seed: hash(seed * 5.7 + i * 1.13),
      color: pistil,
      tint: pistil,
    });
  }
}

/**
 * 水上の扇。水面(y=0)に並べた噴出口から、低い角度で外へ噴き上げる。
 * 打ち上げ区間が無い(rise=0)ので、その場でいきなり開く。
 * 水面が MeshReflectorMaterial なので、映り込みは勝手に出る。
 */
function emitFan(plan: ShellPlan, out: FireworkParticle[]) {
  const prof = FIREWORK_PROFILES.fan;
  const { at, from, seed = 0, scale = 1 } = plan;
  const base = prof.speed * scale;
  const color = new Color(plan.colors?.[0] ?? FAN_COLOR);
  const tint = new Color(plan.colors?.[1] ?? FAN_TINT);

  // 噴出口を並べる向き。plan.to - plan.from の水平成分があればそれに沿わせる
  const dx = plan.to[0] - from[0];
  const dz = plan.to[2] - from[2];
  const len = Math.hypot(dx, dz);
  const rowX = len > 0.001 ? dx / len : 1;
  const rowZ = len > 0.001 ? dz / len : 0;
  // 列の全長。to を指定しなければ既定の 90 を使う
  const span = len > 0.001 ? len : 90;

  for (let j = 0; j < FAN_JETS; j++) {
    // -0.5〜0.5 に並べる
    const t = j / (FAN_JETS - 1) - 0.5;
    const ox = from[0] + rowX * span * t;
    const oz = from[2] + rowZ * span * t;
    const origin: Vec3 = [ox, from[1], oz];

    for (let i = 0; i < FAN_PER_JET; i++) {
      /*
        扇。列の向きに ±1 まで開き、上向き成分と合わせて斜めに飛ばす。
        中央ほど立ち、端ほど寝るようにすると動画の「末広がり」になる。
      */
      const f = (i / (FAN_PER_JET - 1)) * 2 - 1;
      const spread = f * (0.75 + hash(seed * 3.7 + j) * 0.25);
      const up = Math.sqrt(Math.max(1 - spread * spread * 0.55, 0.15));
      // 列に直交する向きへも少しだけ散らして、板に見えないようにする
      const side = (hash(seed * 11.9 + j * 31 + i) - 0.5) * 0.18;
      const dir: Vec3 = [
        rowX * spread - rowZ * side,
        up,
        rowZ * spread + rowX * side,
      ];
      const s = base * (0.82 + hash(seed * 6.3 + j * 17 + i) * 0.3);
      push(out, {
        launch: at,
        origin,
        burst: origin,
        vel: [dir[0] * s, dir[1] * s, dir[2] * s],
        size: 1.7 + hash(seed * 14.3 + j * 23 + i) * 1.2,
        seed: hash(seed * 4.1 + j * 13 + i * 0.61),
        color,
        tint,
      });
    }
  }
}

const EMITTERS: Record<
  FireworkKind,
  (plan: ShellPlan, out: FireworkParticle[]) => void
> = {
  kiku: emitKiku,
  peony: emitPeony,
  kamuro: emitKamuro,
  senrin: emitSenrin,
  ring: emitRing,
  fan: emitFan,
};

/** 指定の型で、玉のリストぶんの粒をまとめて撒く */
export function emitShells(
  kind: FireworkKind,
  plans: readonly ShellPlan[],
): FireworkParticle[] {
  const out: FireworkParticle[] = [];
  const emit = EMITTERS[kind];
  for (const plan of plans) emit(plan, out);
  return out;
}
