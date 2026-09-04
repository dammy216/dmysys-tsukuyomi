/**
 * 「Reply」演出モードのメディア・配置・タイミング定数。
 * 星降る海(features/root/timings.ts)と同じ役割のものをこちらへまとめてある。
 */

/**
 * ホログラムに映すライブ映像(CPK - Reply)。音声トラック付きで、その音を鳴らす。
 * 長さ 約127.5秒 / 1920x1080(16:9)。
 */
export const REPLY_VIDEO_SRC = "/videos/reply.mp4";
/** ボーカルのみのステム。無音で回してかぐやの口パクの振幅解析にだけ使う */
export const REPLY_VOCALS_SRC = encodeURI(
  "/sounds/Reply-vocals-C major-170bpm-440hz.m4a",
);

/**
 * Reply ボタンを押したら映像とボーカルステムをまとめて 0 秒から流す。
 * ステム(269.3秒)は映像より長いので、映像の ended でまとめて頭出しするとき、
 * 超えた分は鳴らないままカットされる。
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
/**
 * 江戸城の拡大率。高さ約36、底面約29.7×26.4 になる。隅櫓は
 * CASTLE_TOP_Y に対する比率(towerLayout.ts)で持っているので自動で
 * 追従して大きくなる。ステージ・鳥居のサイズ(STAGE_RADIUS等)・灯籠の
 * 集まる範囲(SceneContents.tsx の LANTERN_*)はこれとは連動させない指定。
 */
export const CASTLE_SCALE = 60;
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
/**
 * 天守**本体**の飛来ブロックが組み上がりきる再生位置(秒)。指定で天守だけ
 * 0.8秒早く終わらせる(隅櫓・カメラの引き・照明点灯などは従来どおり
 * REPLY_BUILD_END_SECONDS(11秒)のまま=「周りは今のまま」)。
 */
export const REPLY_CASTLE_BUILD_END_SECONDS = REPLY_BUILD_END_SECONDS;
/** 11秒を過ぎてから、周回カメラが PATH(引きの全景)へ移りきるまでの秒数 */
export const REPLY_PULLBACK_SECONDS = 0.8;
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
export const STAGE_Y = CASTLE_TOP_Y - 1;

/**
 * ステージ(円形の甲板)の半径。3体の鳥居(宮島×2+中央の大鳥居)を横一列に
 * 載せられる、屋根にちょうど収まるサイズ。
 */
export const STAGE_RADIUS = 5;
/** 甲板の厚み */
export const STAGE_THICKNESS = 0.6;

/**
 * 左右に置く宮島鳥居(小)の拡大率。中央の大鳥居(ToriiGate)を主役に
 * するため、地上の鳥居と同じ縮尺(0.18)より一回り絞ってある
 * (高さ 25.22×0.10 ≒ 2.5。中央の大鳥居 REPLY_TORII_GATE_HEIGHT=4.3 の6割ほど)。
 */
export const REPLY_TORII_SIDE_SCALE = 0.1;
/**
 * 左右の宮島鳥居を置く中心からのXオフセット。中央の大鳥居からは
 * REPLY_TORII_SIDE_FORWARD_OFFSET ぶん手前(奥行き方向)にも離してあり、
 * 3体が横一列ではなく手前に出た配置になる(参考画像と同じ、手前の左右に
 * 赤い鳥居・奥に主役の大鳥居という構図)。向きは REPLY_TORII_SIDE_ROTATION
 * で外側(ステージの外)を向かせる。
 */
export const REPLY_TORII_SIDE_OFFSET = 2;

/**
 * 中央の大鳥居と左右の宮島鳥居のZ方向の間隔(奥行きの差)。
 * 3体の重心がステージ(甲板)の中心に来るよう、この間隔を保ったまま
 * 中央を奥へ2/3・左右を手前へ1/3に振り分けている
 * (下の REPLY_TORII_CENTER_Z_OFFSET / REPLY_TORII_SIDE_Z_OFFSET 参照。
 * 中央だけをZ=0に置いて左右だけ手前へ出すと、重心がステージ中心より
 * 手前へずれてしまう)。
 */
export const REPLY_TORII_SIDE_FORWARD_OFFSET = 2.2;
/** 中央の大鳥居のZオフセット(ステージ中心から奥へ)。3体の重心を0にする値 */
export const REPLY_TORII_CENTER_Z_OFFSET =
  -(REPLY_TORII_SIDE_FORWARD_OFFSET * 2) / 3;
/** 左右の宮島鳥居のZオフセット(ステージ中心から手前へ)。中央との間隔は上と同じ */
export const REPLY_TORII_SIDE_Z_OFFSET =
  REPLY_TORII_CENTER_Z_OFFSET + REPLY_TORII_SIDE_FORWARD_OFFSET;
/**
 * 左右の宮島鳥居の振り角(ラジアン)。真横(90°)ではなく斜めに、かつ
 * くぐる向き(鳥居を貫く軸)が中央ではなく外側(ステージの外)を
 * 向くようにする。SceneContents.tsx では左に -、右に + を掛けて
 * 左右対称にする(左は外=-X側、右は外=+X側を向く)。
 */
export const REPLY_TORII_SIDE_ROTATION = Math.PI / 4;

/**
 * ステージ中央に置く大鳥居(torii gate)の高さ(ワールド単位)。
 * ToriiGate.tsx 側でモデルを「scale=1で高さ1」に正規化してあるので、
 * この値がそのまま scale prop になる。幅は高さの約1.38倍(実測)になるので
 * 5.9ほど。
 */
export const REPLY_TORII_GATE_HEIGHT = 4.3;
/** 上の大鳥居の高さぶん、ホログラムを持ち上げる基準にする(3体のうち一番高い) */
const TORII_TOP_OFFSET = REPLY_TORII_GATE_HEIGHT;

/**
 * ホログラム画面の縦幅。横幅は映像の実寸(1920x1080 = 16:9)から決まるので
 * 約21.3 になる。星降る海(16:9で高さ9)よりひと回り大きい、会場のジャンボトロン
 * ぐらいの主張のあるサイズにしてある。
 * ReplyHologram.tsx と、上の REPLY_HOLOGRAM_Y の算出で共有する。
 *
 * ここを変えると REPLY_HOLOGRAM_Y(画面中心)も連動して動くが、画面の**下辺**
 * (鳥居の上端からの間合い)は HOLOGRAM_GAP だけで決まり HOLOGRAM_HEIGHT には
 * 依存しないので、画面は下辺を保ったまま上へ伸びる(鳥居と被らない)。
 */
export const HOLOGRAM_HEIGHT = 16;
/**
 * 鳥居の上端から画面の下辺までの間合い。星降る海(鳥居の上端から約5)より
 * 詰めてある: こちらは土台が江戸城のぶん塔が高く、同じだけ空けると
 * 鳥居とホログラムが1枚の絵に収まらなくなる。
 */
const HOLOGRAM_GAP = 2;

/** ホログラム画面の中心の高さ */
export const REPLY_HOLOGRAM_Y =
  STAGE_Y + TORII_TOP_OFFSET + HOLOGRAM_GAP + HOLOGRAM_HEIGHT / 2;

/**
 * カメラの注視点 = **ホログラム画面の中心**。
 *
 * camera.lookAt はここを画面のど真ん中に置くので、11秒以降のカメラワークは
 * ホログラムを中心に据えたまま回る。以前は塔全体の構図の中心
 * (水面〜ホログラム上辺の中点よりやや上=y約27)を向いていたが、それだと
 * ホログラムが中心より18も上に外れ、回転の軸が天守の中ほどにあるように
 * 見えてしまっていた。
 *
 * 代わりに、引きの画では江戸城の足元(石垣のあたり)がフレームの下から
 * 外れる。両方を1枚に収めたいときは PATH 全体を遠ざける
 * (ReplyCamera の DISTANCE_SCALE)か、低いキーフレームの高さを上げる。
 *
 * ReplyCamera はここを向き続け、PATH の距離もここを支点に伸縮する。
 * OrbitControls の target も同じ点。
 */
export const REPLY_FOCUS: [number, number, number] = [
  REPLY_BASE_POSITION[0],
  REPLY_HOLOGRAM_Y,
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
/**
 * 背後から放射状に伸びるビームの色。参照映像(Reply.mp4 0:05〜0:08)で
 * 実際に出ている4色。**小節ごとにこの中から2色を選んで会場ごと総入れ替え**
 * する(StageBeams の COLOR_BEATS)。本ごとに固定の色を割り振ると、
 * 何が起きても色の並びが変わらないので照明卓が動いていないように見える。
 */
export const BEAM_COLORS = ["#6effb0", "#ff4fa3", "#ffa93d", "#8b6cff"];

/*
 * ------------------------------------------------------------------
 * 曲(Reply)のビートグリッド。**すべて reply.mp4 の音声から実測した値**で、
 * 勘で置いた数字ではない。ステージ照明(StageBeams)はこのグリッドの上で動く。
 *
 * 楽曲構成・歌詞タイミング・実測ダイナミクス・映像の絵づくりは
 * `frontend/features/reply/TRACK_NOTES.md` に詳細をまとめてある。
 *
 * 測り方(再現手順):
 *   ffmpeg -i reply.mp4 -vn -ac 1 -ar 22050 -f f32le reply.pcm
 *   → STFT(hop 256) のスペクトルフラックスでオンセット包絡を作り、
 *     80〜200bpm を 0.25bpm 刻み・位相 0.002秒刻みで櫛形フィルタにかける。
 *   結果: 170.00bpm がスコア 0.0814 で単独首位(2位の136bpmは0.0444)。
 * ------------------------------------------------------------------
 */

/** 曲のテンポ。実測で 170.00bpm ちょうど */
export const REPLY_BPM = 170;
/** 1拍の長さ(秒)。約0.35294秒 */
export const REPLY_BEAT_SECONDS = 60 / REPLY_BPM;
/** 1小節の長さ(秒)。4拍で約1.41176秒 */
export const REPLY_BAR_SECONDS = REPLY_BEAT_SECONDS * 4;

/**
 * 最初の拍が立つ時刻(秒)。実質0だが、0にすると小節線が1拍ぶんずれる。
 */
export const REPLY_BEAT_OFFSET = 0.018;
/**
 * 最初の**小節頭**の時刻(秒)。以降 REPLY_BAR_SECONDS ごとに小節が来る。
 *
 * 拍のうちどれが小節頭かは、12〜60秒の安定区間でキックのオンセット強度を
 * 4拍・8拍それぞれのスロットに振り分けて求めた(4拍→スロット2、
 * 8拍→スロット6。8の6は4の2と一致するので整合している)。
 * つまり小節頭は REPLY_BEAT_OFFSET から2拍後 = 0.018 + 2*0.35294。
 *
 * 検算: この式で8小節目の頭は 12.018秒。曲の**ドロップ**(低域が
 * 0.34→0.67 に跳ねる点)の実測は 12.06秒で、小節頭にぴったり乗る。
 */
export const REPLY_BAR_ORIGIN = REPLY_BEAT_OFFSET + REPLY_BEAT_SECONDS * 2;
