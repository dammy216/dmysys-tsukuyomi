import { sampleTimeline, type TimelineKey } from "./timelineType";

/**
 * Reply の演出タイムラインの「型・トラックの仕様・標本化関数」。
 * 値そのもの(キーフレーム配列)は replyTimelineData.ts の REPLY_TIMELINE に置き、
 * 実行時に編集パネルから書き換わる可変コピーは replyTimelineStore.ts が持つ。
 * (cameraFeelParams.ts と cameraFeelDefaults.ts の関係と同じ分け方。
 *  「コードとしてコピー」が値のファイル1つを丸ごと貼り替えられるようにするため)
 *
 * **トラック = 編集モードの Outline に並ぶオブジェクト1つ。**
 * 1つのキーがそのトラックの全チャンネルの値を持ち、タイムライン上では
 * チャンネルごとに行が並ぶが菱形(キー)の時刻は行をまたいで共通
 * (ドローン航路と同じ作り。timelineType.ts のコメント参照)。
 * 時刻を別々に打ちたい値は、チャンネルではなく別トラックに分けてある
 * ―― energy と fade を1つにまとめていない理由がこれ。
 */

/** 各トラックが持つチャンネル。標本化するとき舐める順に並べる */
const CASTLE_CHANNELS = ["build", "assembly"] as const;
const LEVEL_CHANNELS = ["level"] as const;
const GATHER_CHANNELS = ["gather"] as const;
const VALUE_CHANNELS = ["value"] as const;

export type CastleChannel = (typeof CASTLE_CHANNELS)[number];
export type LevelChannel = (typeof LEVEL_CHANNELS)[number];
export type GatherChannel = (typeof GATHER_CHANNELS)[number];
export type ValueChannel = (typeof VALUE_CHANNELS)[number];

/** REPLY_TIMELINE(replyTimelineData.ts)のデータ形 */
export type ReplyTimelineKeys = {
  castle: TimelineKey<CastleChannel>[];
  lights: TimelineKey<LevelChannel>[];
  stage: TimelineKey<LevelChannel>[];
  lanterns: TimelineKey<GatherChannel>[];
  fireworks: TimelineKey<LevelChannel>[];
  flash: TimelineKey<LevelChannel>[];
  energy: TimelineKey<ValueChannel>[];
  fade: TimelineKey<ValueChannel>[];
};

export type ReplyTrackId = keyof ReplyTimelineKeys;

/**
 * トラック1つぶんの仕様。編集モードの Outline / Timeline / Details は
 * この配列を舐めて描く(オブジェクトを増やすときはここに1件足す)。
 */
export type ReplyTrackSpec = {
  id: ReplyTrackId;
  /** Outline に出す名前 */
  label: string;
  /** Outline の補足文 */
  hint: string;
  /** タイムラインの行・Details の入力欄になるチャンネル */
  channels: readonly { key: string; label: string; step: number }[];
  /**
   * そのトラックが何を担っているかの説明。**「コードとしてコピー」で
   * replyTimelineData.ts を丸ごと書き出すときに、該当トラックの直前へ
   * ブロックコメントとして出す。** 全選択→貼り付けでファイルを置き換えても
   * 説明が消えないようにするための持ち方(ParamSpec.comment と同じ考え方)。
   */
  comment: string;
};

/**
 * トラック表。**Outline の並び順そのもの。**
 * step は編集パネルのドラッグ1pxあたりの変化量。進行度(0〜1)は 0.01、
 * 秒や角度のような大きい値を持つトラックを足すときは合わせて変える。
 */
export const REPLY_TRACKS: readonly ReplyTrackSpec[] = [
  {
    id: "castle",
    label: "Castle",
    hint: "天守の組み上げ(本体 / 周辺・隅櫓)",
    channels: [
      { key: "build", label: "build(天守本体)", step: 0.01 },
      { key: "assembly", label: "assembly(周辺・隅櫓)", step: 0.01 },
    ],
    comment: `天守の組み上げ。0秒から11秒かけて 0→1。
    2点だけの区間はちょうど直線になり、最後のキーより後ろは端の値で頭打ち。
      build    … 天守本体。EdoCastle のシェーダーと CastleAssembly の天守ぶん
      assembly … 隅櫓・飛来ブロック・レンズ効果など「11秒を基準にする」周り一式
    もとは天守本体だけ0.8秒早く終わらせていた時期があり、そのために別々の
    進行度に分けてある(今は同じ値だが、片方だけ早めたいときはここで差を付ける)。`,
  },
  {
    id: "lights",
    label: "Stage Lights",
    hint: "投影光・ビーム・サーチライトの点灯",
    channels: [{ key: "level", label: "level(点灯)", step: 0.01 }],
    comment: `ステージ照明の点灯具合。投影光・ビーム・ウォッシュ・サーチライトを
    これ1本で一斉に点ける。11秒から0.45秒で素早く上げる ―― 組み上げ中の
    光る帯が消えるのと入れ違いにするため。ここを緩めると天守が数秒真っ黒に沈む。`,
  },
  {
    id: "stage",
    label: "Stage",
    hint: "ステージ・鳥居・ホログラムの出具合",
    channels: [{ key: "level", label: "level(出具合)", step: 0.01 }],
    comment: `ステージ・鳥居・ホログラムの出具合。照明と同じ 11〜11.45秒だが、
    載る瞬間にポップしないよう S字で入れる(前後を平らなキーで挟んであるので
    この区間はちょうど smoothstep になる)。`,
  },
  {
    id: "lanterns",
    label: "Lanterns",
    hint: "灯籠が天守のまわりへ集まる",
    channels: [{ key: "gather", label: "gather(集合)", step: 0.01 }],
    comment: `灯籠が天守のまわりへ集まる進み具合。11秒に向けて集まるので
    組み上げと同じ立ち上がり。**止めたときのゆっくりした戻りはタイムラインでは
    なく SceneContents 側に残してある** ―― あれは曲の再生位置ではなく
    「再生を止めた/曲が終わった」という状態から来る動きのため。`,
  },
  {
    id: "fireworks",
    label: "Fireworks",
    hint: "花火の濃さ",
    channels: [{ key: "level", label: "level(濃さ)", step: 0.01 }],
    comment: `花火の濃さ。11秒の点灯と同時に上がり、曲の終わりは実測のフェード
    曲線(TRACK_NOTES.md §2.3)をなぞって落とす。独立したトラックなので、
    花火だけ別の落とし方にもできる。`,
  },
  {
    id: "flash",
    label: "Flash",
    hint: "11秒の点灯で焚く閃光",
    channels: [{ key: "level", label: "level(閃光)", step: 0.01 }],
    comment: `11秒の点灯の瞬間だけ焚く閃光。露出とブルームを一段持ち上げて
    「会場の照明が一斉に入った」瞬間を立たせる。使う側で REPLY_FLASH_EXPOSURE を
    掛けるので、ここは 0〜1 の形だけ持つ。11秒で 0→1 へ跳ね上げるため直前に
    0のキーを置いてある(PCHIP は山になるキーで接線を0にするので1を超えない)。
    曲の再生位置で決まるので、ループや巻き戻しでも何度でも焚ける。`,
  },
  {
    id: "energy",
    label: "Energy",
    hint: "曲の演出強度(カメラ速度・レンズ効果)",
    channels: [{ key: "value", label: "value(強度)", step: 0.01 }],
    comment: `曲の演出強度。カメラの巡航速度・レンズ効果・花火の量をこれ1本で振る。
    キーは「セクションの開始=前の段の値」「開始+ramp=新しい段の値」の2点ずつ。
    段の間は同じ値のキーが並ぶので平らになり、セクションのクロスフェードと
    同じ形になる。セクションの区切り自体(名前・開始時刻・ramp)は
    songStructure.ts に残してある ―― 照明のキュー表がセクション名で引くため。`,
  },
  {
    id: "fade",
    label: "Fade",
    hint: "曲の終わりのフェード(実測曲線)",
    channels: [{ key: "value", label: "value(ゲイン)", step: 0.01 }],
    comment: `曲の終わりのフェード(reply.mp4 の音声からの実測。TRACK_NOTES.md §2.3)。
    前半ゆるやか・124.0〜125.5 で急降下という形。等速フェードで代用すると
    音より先に絵が消えるので、実測値をそのまま持つ。`,
  },
];

/** トラック id から仕様を引く */
export function replyTrackSpec(id: ReplyTrackId): ReplyTrackSpec {
  // REPLY_TRACKS は ReplyTrackId を網羅しているので必ず見つかる
  return REPLY_TRACKS.find((track) => track.id === id) as ReplyTrackSpec;
}

/**
 * 編集モードの「コードとしてコピー」が出す replyTimelineData.ts の中身。
 * **貼り付け先のファイルを全選択→貼り付けで丸ごと置き換えられる形**にする
 * (先頭の import 文とファイル冒頭の説明まで含める。dronePathData.ts の
 * 「コードとしてコピー」と同じ運用)。
 *
 * 各トラックの説明(ReplyTrackSpec.comment)と各キーの注記(note)も一緒に
 * 書き出すので、丸ごと貼り替えても説明が消えない。
 */
export function replyTimelineToCode(tracks: ReplyTimelineKeys): string {
  const body = REPLY_TRACKS.map((spec) => {
    const keys = tracks[spec.id] as readonly TimelineKey<string>[];
    const rows = keys
      .map((key) => {
        const note = key.note ? `    // ${key.note}\n` : "";
        const fields = spec.channels
          .map((channel) => `${channel.key}: ${key[channel.key]}`)
          .join(", ");
        return `${note}    { t: ${key.t}, ${fields} },`;
      })
      .join("\n");
    return `  /*\n    ${spec.comment}\n  */\n  ${spec.id}: [\n${rows}\n  ],`;
  }).join("\n\n");

  return (
    'import type { ReplyTimelineKeys } from "./replyTimeline";\n\n' +
    "/**\n" +
    " * Reply の演出タイムライン。**曲の再生位置(秒)→ 各オブジェクトの状態**を\n" +
    " * オブジェクトごとのキーフレーム配列で持つ。ドローン航路(DRONE_PATH)と\n" +
    " * 同じ考え方を、天守・照明・ステージ・灯籠・花火などへ広げたもの。\n" +
    " *\n" +
    " * ここが実行時に使われる唯一の正データ(ビルド後もこのまま)。編集モードの\n" +
    " * Details パネルでブラウザ上から一時的に調整できるが、その調整はページを\n" +
    " * 開き直すと消える下書きにすぎない。\n" +
    " *\n" +
    " * **このファイルは編集モードの「コードとしてコピー」の貼り付け先。**\n" +
    " * 型・トラックの仕様・補間関数は replyTimeline.ts / timelineType.ts、\n" +
    " * 実行時に触る可変コピーは replyTimelineStore.ts。\n" +
    " *\n" +
    " * 補間は単調3次エルミート(PCHIP)。**2点だけの区間はちょうど直線**になり、\n" +
    " * **前後が平らなキーに挟まれた区間はちょうど smoothstep** になる。\n" +
    " * キーを足し引きするとカーブの形も変わるので注意。\n" +
    " */\n" +
    `export const REPLY_TIMELINE: ReplyTimelineKeys = {\n${body}\n};\n`
  );
}

/**
 * 標本化の結果。SceneContents はこれを毎フレーム埋めて、各コンポーネントへ
 * 配っている ref へ流す。
 */
export type ReplyTimelineSample = {
  /** 天守本体の組み上げ 0〜1 */
  castleBuild: number;
  /** 隅櫓・飛来ブロック・レンズ効果など周り一式の組み上げ 0〜1 */
  assemblyBuild: number;
  /** ステージ照明の点灯 0〜1 */
  lights: number;
  /** ステージ・鳥居・ホログラムの出具合 0〜1 */
  stage: number;
  /** 灯籠の集合 0〜1 */
  lanterns: number;
  /** 花火の濃さ 0〜1 */
  fireworks: number;
  /** 11秒の閃光 0〜1(使う側で REPLY_FLASH_EXPOSURE を掛ける) */
  flash: number;
  /** 曲の演出強度 0〜1 */
  energy: number;
  /** 曲の終わりのフェードゲイン 0〜1 */
  fade: number;
};

export function createReplyTimelineSample(): ReplyTimelineSample {
  return {
    castleBuild: 0,
    assemblyBuild: 0,
    lights: 0,
    stage: 0,
    lanterns: 0,
    fireworks: 0,
    flash: 0,
    energy: 0,
    fade: 1,
  };
}

/*
  標本化の作業用。useFrame の中で毎フレーム new しないよう、モジュール
  スコープで1つだけ持つ(R3F のパフォーマンス規約。frontend/CLAUDE.md 参照)。
  sampleReplyTimeline は同期的に使い切るので使い回して問題ない。
*/
const castleScratch: Record<CastleChannel, number> = { build: 0, assembly: 0 };
const levelScratch: Record<LevelChannel, number> = { level: 0 };
const gatherScratch: Record<GatherChannel, number> = { gather: 0 };
const valueScratch: Record<ValueChannel, number> = { value: 0 };

/**
 * タイムライン全体を時刻 t(秒) で標本化して out へ破壊的に書く。
 *
 * tracks は呼び出し側から渡す(通常は replyTimelineStore の現在値。編集
 * パネルで調整中の値をそのまま反映させるため、REPLY_TIMELINE を直接
 * 参照しない ―― ReplyCamera が dronePathStore を読むのと同じ形)。
 */
export function sampleReplyTimeline(
  tracks: ReplyTimelineKeys,
  t: number,
  out: ReplyTimelineSample,
) {
  sampleTimeline(tracks.castle, CASTLE_CHANNELS, t, castleScratch);
  out.castleBuild = castleScratch.build;
  out.assemblyBuild = castleScratch.assembly;

  sampleTimeline(tracks.lights, LEVEL_CHANNELS, t, levelScratch);
  out.lights = levelScratch.level;

  sampleTimeline(tracks.stage, LEVEL_CHANNELS, t, levelScratch);
  out.stage = levelScratch.level;

  sampleTimeline(tracks.lanterns, GATHER_CHANNELS, t, gatherScratch);
  out.lanterns = gatherScratch.gather;

  sampleTimeline(tracks.fireworks, LEVEL_CHANNELS, t, levelScratch);
  out.fireworks = levelScratch.level;

  sampleTimeline(tracks.flash, LEVEL_CHANNELS, t, levelScratch);
  out.flash = levelScratch.level;

  sampleTimeline(tracks.energy, VALUE_CHANNELS, t, valueScratch);
  out.energy = valueScratch.value;

  sampleTimeline(tracks.fade, VALUE_CHANNELS, t, valueScratch);
  out.fade = valueScratch.value;
}
