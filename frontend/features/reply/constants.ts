/**
 * 「Reply」演出モードのメディア・配置・タイミング定数。
 * 星降る海(features/root/timings.ts)と同じ役割のものをこちらへまとめてある。
 */

/**
 * ホログラムに映すライブ映像(CPK - Reply (Anime ver.))。
 * 元ファイルは音声トラックを持たないので、音は必ずステム側から鳴らす。
 * 長さ 130.03秒 / 1920x818(≒2.35:1 のシネスコ)。
 */
export const REPLY_VIDEO_SRC = "/videos/Reply.mp4";
/** ボーカルのみのステム。かぐやの口パクの振幅はここから取る */
export const REPLY_VOCALS_SRC = encodeURI(
  "/sounds/Reply-vocals-C major-170bpm-440hz.m4a",
);
/** 伴奏のステム。ボーカルと同時に鳴らして1曲になる */
export const REPLY_OTHER_SRC = encodeURI(
  "/sounds/Reply-other-C major-170bpm-440hz.m4a",
);

/**
 * 音は星降る海と同じく、Reply ボタンを押したらすぐ 3つ(映像＋ステム2本)
 * まとめて 0 秒から流れる。ステム(269.3秒)は映像(130.0秒)より139秒長いので、
 * 映像の ended でまとめて頭出しするとき、超えた分は鳴らないままカットされる。
 */

/**
 * 映像・音が終わってから、次の周を頭出し再生するまでの余白(秒)。
 * 星降る海(useStarfallSong の LOOP_GAP_SECONDS)と同じ意図。
 */
export const REPLY_LOOP_GAP_SECONDS = 0.6;

/**
 * 曲の終わりの何秒前から演出をフェードアウトさせるか。
 * 映像は130.03秒なので、そこから REPLY_OUTRO_LEAD_SECONDS 手前が起点になる
 * (星降る海の OUTRO_START_SECONDS は絶対秒だが、こちらは映像長から逆算する)。
 */
export const REPLY_OUTRO_LEAD_SECONDS = 6;

/** Reply モードの立ち上がり/収まりにかかる秒数 */
export const REPLY_FADE_SECONDS = 1.6;
/** アウトロのフェードアウト。立ち上がりよりゆっくり引かせて余韻を残す */
export const REPLY_OUTRO_FADE_SECONDS = 4;

/* ------------------------------------------------------------------ *
 * 配置。江戸城 → ステージ → 宮島の鳥居 → ホログラム、と縦に積む。
 * 数値はすべて scene.gltf の POSITION アクセサから実測した値で計算している。
 * ------------------------------------------------------------------ */

/** 塔の中心。星降る海の TORII_POSITION と同じ場所に立てる */
export const REPLY_BASE_POSITION: [number, number, number] = [0, 0, -2];

/**
 * 江戸城モデルのローカル高さ(実測)。ノード行列で Z-up→Y-up される結果、
 * 底面がちょうど y=0、頂部が y=0.5992 になる。
 */
const CASTLE_MODEL_HEIGHT = 0.5992;
/** 江戸城の拡大率。高さ約15.6、底面約12.9×11.5 になる */
export const CASTLE_SCALE = 26;
/** 江戸城の頂部(屋根の頂点)のワールドY */
export const CASTLE_TOP_Y = CASTLE_MODEL_HEIGHT * CASTLE_SCALE;
/**
 * 江戸城の底面の広がり(ワールド単位の半径)。scene.gltf の POSITION 実測
 * x∈[-0.2376, 0.2475] / z∈[-0.2202, 0.2203] に拡大率を掛けたもの。
 * 組み上げアニメ(CastleAssembly)がブロックを撒く範囲に使う。
 */
export const CASTLE_HALF_WIDTH = 0.2475 * CASTLE_SCALE;
export const CASTLE_HALF_DEPTH = 0.2203 * CASTLE_SCALE;

/* ------------------------------------------------------------------ *
 * 組み上げアニメーション。Reply を押すと、無数の直方体ブロックが四方から
 * 飛来して収束し、天守が下から積み上がって現れる
 * (Porter Robinson & Madeon "Shelter" 1:21〜 の街が生成されるカットが指定)。
 * ------------------------------------------------------------------ */

/**
 * 天守が組み上がりきる再生位置(秒)。押してからの経過ではなく
 * **曲(=映像)の再生位置**で決める。ここまでは組み上げと天守まわりの周回
 * カメラ、ここを過ぎたらカメラが引いて塔の全景へ移る。
 */
export const REPLY_BUILD_END_SECONDS = 11;
/** 11秒を過ぎてから、周回カメラが PATH(引きの全景)へ移りきるまでの秒数 */
export const REPLY_PULLBACK_SECONDS = 2.2;
/**
 * 11秒でステージ照明(投影光・ビーム・ステージ・鳥居・ホログラム)が
 * 点きあがるまでの秒数。カメラの引き(REPLY_PULLBACK_SECONDS)とは分ける。
 *
 * 組み上げ中の光る帯は build=1(=ちょうど11秒)で消えるので、照明を
 * カメラと同じ 2.2 秒かけて上げると、その間だけ天守が真っ黒に沈む
 * "暗転バグ" になる。照明は帯が消えるのに合わせてパッと点ける。
 */
export const REPLY_LIGHTS_FADE_SECONDS = 0.45;
/**
 * 11秒の点灯の瞬間だけ焚く白い閃光の長さ(秒)。
 * 星降る海の転調(SURGE_FLASH_SECONDS)と同じ役割で、
 * 「会場の照明が一斉に入った」瞬間をはっきり見せる。
 */
export const REPLY_FLASH_SECONDS = 0.45;
/** 閃光のピーク時に足す露出。1.0で通常の倍の明るさ */
export const REPLY_FLASH_EXPOSURE = 0.75;
/**
 * 組み上げの「面」をブロック単位で刻むためのセルの一辺(ワールド単位)。
 *
 * 大きいほど1個1個が大きな石として現れる。11秒かけて組み上げるので、
 * 粗いと「1個生えるまでの間」が長く空いて曲のテンポから浮く。
 * 細かく刻んで、常にどこかで石が埋まっている状態にする。
 */
export const BUILD_CELL_SIZE = 0.4;
/**
 * セルごとに出現高さをどれだけばらすか(ワールド単位)。
 * 0だと水平にスパッと切れた面が上がるだけになるので、ここで境界を荒らして
 * 「まだ埋まっていない穴」と「先に生えたブロック」を作る。
 * セルを細かくしたぶん、ばらつきも詰めて面が散らばりすぎないようにする。
 */
export const BUILD_EDGE_JITTER = 1.1;
/** 組み上がり面で光る帯の厚み(ワールド単位) */
export const BUILD_EDGE_GLOW = 1.1;

/** ステージの甲板の高さ。屋根の頂点から少しだけ浮かせて宙に張り出させる */
export const STAGE_Y = CASTLE_TOP_Y + 0.3;
/**
 * ステージ(円形の甲板)の半径。鳥居(この縮尺で幅5.5)を載せられる最小限に留める。
 * 大きくすると天守の屋根(頂部は下端よりかなり細い)から甲板だけが大きく
 * せり出して、城の上に載っているように見えなくなる。
 */
export const STAGE_RADIUS = 6;
/** 甲板の厚み */
export const STAGE_THICKNESS = 0.6;

/**
 * ステージに載せる宮島の鳥居の拡大率。地上の鳥居と同じ0.18。
 * ローカル bbox が y ∈ [-3.67, 25.22] なので、原点を甲板の高さに置くと
 * 根本が少しだけ甲板へ埋まり、上端が STAGE_Y + 4.54 に来る。
 */
export const REPLY_TORII_SCALE = 0.18;
/** 上の縮尺での鳥居の上端(ローカル25.22 × 0.18) */
const TORII_TOP_OFFSET = 25.22 * REPLY_TORII_SCALE;

/**
 * ホログラム画面の縦幅。横幅は映像の実寸(1920x818 ≒ 2.35:1)から決まるので
 * 18.8 になる。星降る海(16:9で高さ9)より横長なぶん高さを1つ落としてある。
 * ReplyHologram.tsx と、上の REPLY_HOLOGRAM_Y の算出で共有する。
 */
export const HOLOGRAM_HEIGHT = 8;
/**
 * 鳥居の上端から画面の下辺までの間合い。星降る海(鳥居の上端から約5)より
 * 詰めてある: こちらは土台が江戸城のぶん塔が高く、同じだけ空けると
 * 鳥居とホログラムが1枚の絵に収まらなくなる。
 */
const HOLOGRAM_GAP = 2;

/** ホログラム画面の中心の高さ */
export const REPLY_HOLOGRAM_Y =
  STAGE_Y + TORII_TOP_OFFSET + HOLOGRAM_GAP + HOLOGRAM_HEIGHT / 2;

/** 塔の頂点 = ホログラム画面の上辺 */
const TOWER_TOP_Y = REPLY_HOLOGRAM_Y + HOLOGRAM_HEIGHT / 2;

/**
 * カメラの注視点。**ホログラムの中心ではなく、塔全体の構図の中心**にしてある。
 *
 * ホログラムを向かせると、画面が視野の真ん中に来る代わりに約26下の江戸城が
 * フレームから落ちてしまう(fov68°でも足りない)。ライブの画と同じく
 * 「上段にスクリーン・下段にステージと城」を1枚に収めたいので、
 * 水面からホログラムの上辺までの中点よりやや上=ステージの高さあたりを向く。
 *
 * ReplyCamera はここを向き続け、PATH の距離もここを支点に伸縮する。
 * OrbitControls の target も同じ点。
 */
export const REPLY_FOCUS: [number, number, number] = [
  REPLY_BASE_POSITION[0],
  TOWER_TOP_Y * 0.55,
  REPLY_BASE_POSITION[2],
];

/* ------------------------------------------------------------------ *
 * 色。星降る海が水色〜ピンクなのに対し、Reply は鳥居の発光に合わせた
 * 赤〜橙で統一する。
 * ------------------------------------------------------------------ */

/** ホログラム映像に掛ける赤みの色。加算合成なので実質ここが映像の色味になる */
export const REPLY_HOLOGRAM_TINT = "#ff6a4a";
/** 画面のまわりの光の縁・ステージの発光 */
export const REPLY_GLOW_COLOR = "#ff3d1a";

/*
  ステージ照明の色。Reply.mp4 の 0:07〜0:11 で、暗い天守に当たっている
  投影光と、背後から放射状に伸びるサーチライトの色に合わせてある。
*/
/** 天守に這わせる投影光(プロジェクションマッピング) */
export const PROJECTION_COLOR_A = "#ffab3d";
export const PROJECTION_COLOR_B = "#ff3d86";
/** 背後から放射状に伸びるビーム。参照映像と同じ緑・マゼンタ・橙の3色を回す */
export const BEAM_COLORS = ["#6effb0", "#ff4fa3", "#ffa93d"];
