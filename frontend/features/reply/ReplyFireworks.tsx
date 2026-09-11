"use client";

import type { RefObject } from "react";

import {
  KamuroShell,
  KikuShell,
  PeonyShell,
  RingShell,
  SenrinShell,
  WaterFan,
  fireworkHash as hash,
  type FireworkKind,
  type ShellPlan,
  type Vec3,
} from "@/features/fireworks";

import {
  CASTLE_TOP_Y,
  REPLY_BAR_ORIGIN,
  REPLY_BAR_SECONDS,
  REPLY_BASE_POSITION,
} from "./constants";

/* ------------------------------------------------------------------ *
 * 打ち上げ花火。**曲の小節グリッドに乗せて**、サビ〜後半だけ上げる。
 * 例外は HUSH_BARRAGE_*(Bメロのリザーの静けさ〜サビ頭)―― ライトが消える
 * タイミングで大量に打ち上げ、着弾がサビ頭にまたがるようにしてある
 * (ユーザー指定)。
 *
 * TRACK_NOTES.md §4.3 の通り、元映像の編集はビートに同期していない。なので
 * 「拍ごとにパッパッと弾ける」花火にはしない。2小節(2.82秒)に1発という
 * ゆったりした間隔で上げ、弾けたあとは物理で流して落とす = 連続量で見せる
 * (HUSH_BARRAGEはこの限りでなく、意図的に密集させている)。
 *
 * **玉の中身は features/fireworks/ の型(菊・千輪・冠菊・型物・色玉・水上の扇)
 * に載せ替えてある。** このファイルが持つのは「いつ・どこで・どの型を」と
 * いう曲との対応づけだけで、見た目と物理は features/fireworks/ 側にある。
 * ------------------------------------------------------------------ */

/** 何小節ごとに1発上げるか。サビ/後半はこの間隔 */
const SHELL_INTERVAL_BARS = 2;

/**
 * 花火を上げる区間(秒)。TRACK_NOTES.md §3 のセクション境界に合わせてある。
 * サビ(62〜83) / 後半(83〜106.5) だけ、2小節に1発。
 * **サビ頭から上げる**(以前は Bメロ後半 55〜62 も「溜め」で疎に上げていたが、
 * ユーザー指定でサビからに変更)。アウトロ(107〜)以降は上げない
 * ―― 音が引くところで絵だけ残ると浮くため。
 */
const MAIN_FROM = 62.0;
const MAIN_TO = 106.5;

/**
 * 大玉を上げる位置(秒)。曲の山に合わせた指定。
 * 62.0 サビ頭 / 83.0 後半頭 / 106.0 最後の「キラめいてうたおう」
 */
const FINALE_TIMES = [62.0, 83.0, 106.0] as const;
/** 大玉の玉の大きさ。通常の玉より大きく開く */
const FINALE_SCALE = 1.45;

/**
 * リザーの静けさ(ライトが消えるタイミング)からサビ頭で一斉に上げる
 * 「バラージ」花火。ユーザー指定「Bメロでからフル捕まえようさぁでライトが
 * 消えるタイミングで大量の花火を上げて、サビに入ったら爆発させて」→
 * 「今ばらばらに上がっているから全部同じタイミングで上げて。そして爆発も
 * 同じタイミングで」。通常運行(MAIN_FROM=サビ以降の2小節に1発)とは別枠。
 *
 * 全発が同じ burst 時刻(=MAIN_FROM。サビ頭そのもの)を持ち、**型も菊で
 * そろえてある**。型ごとに打ち上げ秒数(rise)が違うので、混ぜると
 * launch(= burst - rise)がずれて「同じタイミングで上げて」の指定から
 * 外れてしまう ―― 揃えることが指定の要件そのもの。
 * 玉ごとの打ち上げ位置(角度・半径)は添字から決まるハッシュ値なので、
 * 同時刻でも城の周りのバラバラの場所から上がる。
 */
const HUSH_BARRAGE_BURST_AT = MAIN_FROM;
/** バラージで打ち上げる本数。「大量」の指定にふさわしい本数にしてある */
const HUSH_BARRAGE_COUNT = 10;
/** バラージの型。上のコメントの通り、混ぜずに1種でそろえる */
const HUSH_BARRAGE_KIND: FireworkKind = "kiku";

/**
 * 打ち上げ位置の塔の中心からの距離(ワールド単位)。
 * カメラ(ドローン航路)が天守にかなり寄るので、外へ散らしすぎると
 * 上がった玉が画角の外で開いて見えない。塔寄りに固めてある。
 */
const ORIGIN_RADIUS_MIN = 38;
const ORIGIN_RADIUS_MAX = 92;
/** 弾ける高さ。天守の頂部より上、ホログラムと同じくらいの空 */
const BURST_Y_MIN = CASTLE_TOP_Y + 14;
const BURST_Y_MAX = CASTLE_TOP_Y + 58;
/**
 * 冠菊(しだれ柳)だけ開く高さを底上げする。寿命5秒ぶん垂れ続ける型なので、
 * 他と同じ高さで開くと落ちきる前に水面へ刺さって尻切れになる。
 */
const KAMURO_Y_LIFT = 26;

/**
 * 玉と玉の最小間隔(秒)。これより近いものは捨てる。
 *
 * 大玉(FINALE_TIMES)を先に置いてから小節グリッドを重ねるので、大玉の
 * すぐ脇に定期の玉が来ることがある(例: 62.0 の大玉と 62.84 の定期玉)。
 * 1秒足らずの間隔で2発上がると「狙って上げた」ではなく「ズレた」に見えるため、
 * 2小節間隔(2.82秒)より十分小さく、かつ大玉の脇を吸収できる値にしてある。
 */
const MIN_SHELL_GAP = 1.2;

/**
 * 定期の玉に配る型の並び。添字を順に舐めるだけの決定的な割り当て。
 *
 * 菊と冠菊(=動画でいちばん目を引く2つ)を多めに、型物と色玉は
 * アクセントとして疎に入れてある。長さを 2小節グリッドの本数(16前後)と
 * 互いに素にすると、周回しても同じ並びが続かない。
 */
const GRID_KINDS: readonly FireworkKind[] = [
  "kiku",
  "kamuro",
  "senrin",
  "kiku",
  "ring",
  "kamuro",
  "kiku",
  "peony",
  "senrin",
  "kamuro",
  "kiku",
];

/**
 * 水上の扇を噴き上げる時刻。曲の山と同じ3点。動画では大玉の下に必ず
 * 水面の低い扇が並んでいて、それが「空の玉」と「水面の映り込み」を
 * つないでいる。水面は MeshReflectorMaterial なので映り込みは自動で出る。
 */
const WATER_FAN_TIMES = [62.0, 83.0, 106.0] as const;
/** 扇の列を置く位置(塔の中心からの Z オフセット)と、列の全長 */
const WATER_FAN_Z_OFFSET = 82;
const WATER_FAN_SPAN = 190;

type ScheduledShell = ShellPlan & { kind: FireworkKind };

/**
 * 玉1発の打ち上げ位置と開く位置。添字から決まるので毎周同じ場所に上がる。
 * 塔(REPLY_BASE_POSITION)を中心に取り囲ませる。このコンポーネントは
 * group に入れずワールド座標へ直接置くので、ここで基準位置を足しておく。
 */
function placeShell(index: number, kind: FireworkKind) {
  const angle = hash(index * 3.1) * Math.PI * 2;
  const radius =
    ORIGIN_RADIUS_MIN + hash(index * 7.7) * (ORIGIN_RADIUS_MAX - ORIGIN_RADIUS_MIN);
  const x = REPLY_BASE_POSITION[0] + Math.sin(angle) * radius;
  const z = REPLY_BASE_POSITION[2] + Math.cos(angle) * radius;
  const lift = kind === "kamuro" ? KAMURO_Y_LIFT : 0;
  const y = BURST_Y_MIN + lift + hash(index * 5.3) * (BURST_Y_MAX - BURST_Y_MIN);
  const from: Vec3 = [x, 0, z];
  const to: Vec3 = [x, y, z];
  return { from, to };
}

/**
 * 上げる玉をぜんぶ組み立てる。時刻(=弾ける時刻)は小節グリッドから、
 * 型は GRID_KINDS から、位置は添字のハッシュから決まる。
 */
function buildShells(): ScheduledShell[] {
  const times: { at: number; kind: FireworkKind; scale: number }[] = [];
  // 大玉の脇や同じ小節で二重に上がらないよう、近すぎるものは捨てる
  const push = (at: number, kind: FireworkKind, scale: number) => {
    if (times.some((v) => Math.abs(v.at - at) < MIN_SHELL_GAP)) return false;
    times.push({ at, kind, scale });
    return true;
  };

  /*
    大玉。サビ頭(62.0)はバラージと重なる瞬間なので、そちらに任せて
    ここでは置かない ―― 同じ場所で大玉とバラージが二重に開くと、
    「一斉に開いた」というバラージの狙いが潰れる。後半頭は千輪(二段咲きで
    間が持つ)、最後の一発は菊の大玉にしてある。
  */
  push(FINALE_TIMES[1], "senrin", FINALE_SCALE);
  push(FINALE_TIMES[2], "kiku", FINALE_SCALE);

  // 小節頭を走査して、2小節ごとに拾う(サビ〜後半だけ)
  const totalBars = Math.ceil((MAIN_TO - REPLY_BAR_ORIGIN) / REPLY_BAR_SECONDS);
  let gridIndex = 0;
  for (let bar = 0; bar <= totalBars; bar++) {
    const t = REPLY_BAR_ORIGIN + bar * REPLY_BAR_SECONDS;
    if (t < MAIN_FROM || t > MAIN_TO || bar % SHELL_INTERVAL_BARS !== 0) continue;
    /*
      **採用された玉だけ**が型の並びを1つ進める。大玉の脇で捨てられた枠でも
      進めてしまうと、そこに割り当たっていた型(色玉)が一度も出ないまま
      飛ばされる ―― 疎にしか入れない型ほどこれで消えやすい。
    */
    const kind = GRID_KINDS[gridIndex % GRID_KINDS.length];
    if (push(t, kind, 0.85 + hash(bar * 1.7) * 0.3)) gridIndex++;
  }

  const shells: ScheduledShell[] = times.map((entry, i) => ({
    at: entry.at,
    kind: entry.kind,
    scale: entry.scale,
    seed: i + 1,
    ...placeShell(i + 1, entry.kind),
  }));

  /*
    リザーの静けさ〜サビ頭のバラージ(HUSH_BARRAGE_* のコメント参照)。
    全発が同じ burst 時刻を持つ ―― push() の重複除外は「同じ瞬間に何発も
    上げない」ための仕組みなので、ここでは意図的に通さず直接積む。
  */
  for (let i = 0; i < HUSH_BARRAGE_COUNT; i++) {
    const seed = 100 + i;
    shells.push({
      at: HUSH_BARRAGE_BURST_AT,
      kind: HUSH_BARRAGE_KIND,
      // 一斉に開くので1発ずつは控えめに。全部が大玉だと画面が白く潰れる
      scale: 0.9 + hash(seed * 2.7) * 0.35,
      seed,
      ...placeShell(seed, HUSH_BARRAGE_KIND),
    });
  }

  return shells;
}

/**
 * 玉のリストを型ごとに仕分ける。**モジュール読み込み時に1回だけ**作る
 * ―― 中身は添字から決まる決定的な値しか持たないので、再マウントしても
 * 作り直す必要がない(参照が変わらないので下流の useMemo も効き続ける)。
 */
const ALL_SHELLS = buildShells();

function shellsOf(kind: FireworkKind): ShellPlan[] {
  return ALL_SHELLS.filter((s) => s.kind === kind);
}

const KIKU_SHELLS = shellsOf("kiku");
const KAMURO_SHELLS = shellsOf("kamuro");
const SENRIN_SHELLS = shellsOf("senrin");
const RING_SHELLS = shellsOf("ring");
const PEONY_SHELLS = shellsOf("peony");

/** 水上の扇。列の向きと全長は from→to の水平ベクトルで決まる */
const FAN_SHELLS: ShellPlan[] = WATER_FAN_TIMES.map((at, i) => ({
  at,
  from: [
    REPLY_BASE_POSITION[0] - WATER_FAN_SPAN / 2,
    0,
    REPLY_BASE_POSITION[2] + WATER_FAN_Z_OFFSET,
  ] as Vec3,
  to: [
    REPLY_BASE_POSITION[0] + WATER_FAN_SPAN / 2,
    0,
    REPLY_BASE_POSITION[2] + WATER_FAN_Z_OFFSET,
  ] as Vec3,
  seed: 200 + i,
  scale: 1,
}));

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
 * 型ごとに1つずつコンポーネントを並べる = points 6回の描画。玉を増やしても
 * 描画回数は増えない(1つの points に全発ぶんの粒が入っている)。
 * 玉の配置・色・弾ける高さは添字から決まる決定的な値なので、何周しても
 * 毎回同じ位置に同じ花火が上がる(曲に紐づいた演出になる)。
 */
export function ReplyFireworks({
  songTimeRef,
  intensityRef,
}: ReplyFireworksProps) {
  const common = { songTimeRef, intensityRef };
  return (
    <>
      <KikuShell shells={KIKU_SHELLS} {...common} />
      <KamuroShell shells={KAMURO_SHELLS} {...common} />
      <SenrinShell shells={SENRIN_SHELLS} {...common} />
      <RingShell shells={RING_SHELLS} {...common} />
      <PeonyShell shells={PEONY_SHELLS} {...common} />
      <WaterFan shells={FAN_SHELLS} {...common} />
    </>
  );
}
