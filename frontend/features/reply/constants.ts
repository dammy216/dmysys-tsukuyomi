/**
 * 「Reply」演出モードのメディア・配置・タイミング定数。
 * 星降る海(features/root/timings.ts)と同じ役割のものをこちらへまとめてある。
 */

import type { ReplySectionName } from "./songStructure";

/**
 * ホログラムに映すライブ映像(CPK - Reply)。音声トラック付きで、その音を鳴らす。
 * 長さ 約127.5秒 / 1920x1080(16:9)。
 */
export const REPLY_VIDEO_SRC = "/videos/reply.mp4";
/** 映像の音量(0〜1)。そのまま1.0だと大きすぎるので絞ってある */
export const REPLY_VIDEO_VOLUME = 0.4;
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

/**
 * 天守の屋根の層(軒)。天守は1枚屋根の単純な箱ではなく、上へ行くほど幅が
 * 狭くなる屋根が5段重なった層塔型(五重天守)。BeamLight.tsx が「軒下」に
 * ビームを立てるには、建物全体の外周(CASTLE_HALF_WIDTH/DEPTH)や頂点の
 * 比率近似ではなく、層ごとの軒の実測位置・幅・奥行きが要る。
 *
 * 計測方法: scene.gltf の全メッシュ頂点をノード行列でワールド変換した後、
 * モデルローカルのYを500分割し、各スライスで |x| / |z| の最大値
 * (=その高さでの半幅・半奥行き)を取る。「半幅がYに対してどう変わるか」の
 * 山(局所ピーク)を、平滑化(移動平均)した上で位相幾何学的プロミネンス
 * (両隣で自分より高い地点に達するまでの谷の深さ)でランキングし、上位から
 * 実際に軒として画に現れる5箇所を採用した(ピークの数だけ機械的に採らず、
 * 候補位置に実際の断面図をレンダリングして目視でも確認済み)。
 *
 * 実測(ローカル、CASTLE_MODEL_HEIGHT=0.5992 と同じ単位):
 *   層1(最下・最大) y=0.215112  x∈±0.229175  z∈±0.202275
 *   層2            y=0.303793  x∈±0.195720  z∈±0.169024
 *   層3            y=0.380491  x∈±0.168156  z∈±0.141398
 *   層4            y=0.453593  x∈±0.149387  z∈±0.121705
 *   層5(最上)      y=0.512314  x∈±0.120728  z∈±0.093906
 * (この上、y=0.5992=CASTLE_TOP_Y まではシャチホコ等の飾りが続く屋根なし区間)
 */
export const CASTLE_ROOF_TIERS: readonly {
  y: number;
  halfWidth: number;
  halfDepth: number;
}[] = [
  { y: 0.215112, halfWidth: 0.229175, halfDepth: 0.202275 },
  { y: 0.303793, halfWidth: 0.19572, halfDepth: 0.169024 },
  { y: 0.380491, halfWidth: 0.168156, halfDepth: 0.141398 },
  { y: 0.453593, halfWidth: 0.149387, halfDepth: 0.121705 },
  { y: 0.512314, halfWidth: 0.120728, halfDepth: 0.093906 },
].map(({ y, halfWidth, halfDepth }) => ({
  y: y * CASTLE_SCALE,
  halfWidth: halfWidth * CASTLE_SCALE,
  halfDepth: halfDepth * CASTLE_SCALE,
}));

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
 * 0.8秒早く終わらせる(隅櫓・照明点灯などは従来どおり
 * REPLY_BUILD_END_SECONDS(11秒)のまま=「周りは今のまま」)。
 */
export const REPLY_CASTLE_BUILD_END_SECONDS = REPLY_BUILD_END_SECONDS;
/**
 * 11秒でステージ照明(投影光・ビーム・ステージ・鳥居・ホログラム)が
 * 点きあがるまでの秒数。
 *
 * 組み上げ中の光る帯は build=1(=ちょうど11秒)で消えるので、照明を
 * ゆっくり上げるとその間だけ天守が真っ黒に沈む "暗転バグ" になる。
 * 照明は帯が消えるのに合わせてパッと点ける。
 */
export const REPLY_LIGHTS_FADE_SECONDS = 0.45;

/* ------------------------------------------------------------------ *
 * Reply の満月。**9月・21時・満月**の指定。
 *
 * 満月は太陽の正反対にあるので、秋分ごろは日没(≒18時)に東から昇り、21時には
 * 南東の空・高度およそ35°まで昇っている(中緯度)。方位は North=-Z / East=+X
 * (Compass と同じ)。
 *
 * 月は「星空と同じレイヤー」= reply の夜空テクスチャ(SkyBackground の
 * useReplySkyTexture)に描き込む。月明かり(directionalLight)は ReplyMoon が
 * 同じ向きから当てる。位置はここ1箇所で共有する。
 * ------------------------------------------------------------------ */
/** 満月の高度(ラジアン。水平=0、真上=π/2) */
export const REPLY_MOON_ALTITUDE = (35 * Math.PI) / 180;
/** 満月の方位(ラジアン。北=0、東=π/2、南東=3π/4) */
export const REPLY_MOON_AZIMUTH = (135 * Math.PI) / 180;
/**
 * 夜空テクスチャに描く月の見かけの直径(テクスチャ高さに対する割合)。
 * テクスチャ高さ=180°なので 0.04 ≒ 見かけ7°(実際の満月0.5°よりは大きめ)。
 */
export const REPLY_MOON_SIZE = 0.04;
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
/**
 * 天守に這わせる投影光(プロジェクションマッピング)の **既定/Aメロの配色**。
 *
 * 元映像 reply.mp4 は「ピンク×金の対」(TRACK_NOTES.md §4.1)だが、この曲
 * (超かぐや姫「Reply」)の「電子の海」「どこにもないカラフル」の質感には
 * 暖色2色は形式ばって聞こえる、というユーザー判断で **寒色・電子寄り** を
 * 基準にした。シアン + バイオレット + 月明かりの白。シアン/バイオレットは
 * CASTLE_BEAM_PALETTE と同値 ―― 投影はビームリグの寒色側だけを抜き出した配色。
 *
 * **セクションごとの配色は castleProjectionPalette.ts が差し替える**
 * (イントロ2 = エンバー / サビ = 暖色パーティー …)。ここの4色は uniform の
 * 初期値 + Aメロ・breath・fade で使う寒色の素材。金は サビ・後半の頭の
 * 一撃(castleBeamRig の castleHitAt)でだけ差す。
 */
export const PROJECTION_COLOR_CYAN = "#3ee0ff";
export const PROJECTION_COLOR_VIOLET = "#8b6cff";
/** 月明かりの白。少数のパネルだけこれにして寒色2色のあいだに抜けを作る */
export const PROJECTION_COLOR_MOON = "#dce6ff";
/** サビ・後半の頭の一撃でだけ、点灯中パネルの一部がこの金へフラッシュする */
export const PROJECTION_COLOR_HIT = "#ffab3d";
/**
 * 投影パネル1枚の大きさ(ワールド単位)。castleBuildShader.ts の
 * プロジェクションマッピングは、建物の面を法線で「屋根 / 4方位の壁」に
 * 分け、その面へ正面から映像を平面投影したうえで、この間隔の格子で
 * パネルに割る。天守(高さ約36・底面約29.7×26.4)で横13枚・縦16枚ほど。
 * BUILD_CELL_SIZE(組み上げのボクセル 0.4)より粗い ―― あちらは
 * ブロックの粒、こちらは「1面をいくつのパネルに割って順に灯すか」。
 * 小さくするとパネルが細かくなり点描寄り、大きくすると1面まるごと数枚。
 */
export const PROJECTION_PANEL_SIZE = 2.2;
/**
 * 背後から放射状に伸びるビームの色。当初はピンク(#ff4fa3)と緑(#6effb0)を
 * 外していたが、TRACK_NOTES.md §4.1「緑は常に『動く光』として使われる」の
 * 通り参照映像のサーチライトには実際に緑が使われているため、緑を復活させた
 * (ピンクは引き続き除外)。紫(#8b6cff)を2枠、オレンジ(#ffa93d)・緑(#6effb0)を
 * 1枠ずつにして、紫を主色として保ちながら緑を混ぜてある。
 * **小節ごとにこの中から2色を選んで会場ごと総入れ替え**する
 * (Searchlight の COLOR_BEATS)。本ごとに固定の色を割り振ると、
 * 何が起きても色の並びが変わらないので照明卓が動いていないように見える。
 */
export const BEAM_COLORS = ["#8b6cff", "#ffa93d", "#6effb0"];

/**
 * イントロ2(intro-B / 11.05〜23秒)のレーザー(BeamLight のレーザーモード +
 * Searchlight の交差)に使う固定3色。**溶鉄グラデ** ―― 組み上がりきった直後の
 * 天守を「まだ冷えきってない鍛鉄」に見立てた投影(castleProjectionPalette の
 * イントロ2 = エンバー)と家系を揃える。当初は緑/橙/紫だったが、エンバー投影
 * から浮くというユーザー指摘で赤熱→白熱の熱勾配へ差し替えた。
 *
 * - BeamLight: 取り付け高さ3バンドに LOW→MID→HIGH で配る(下=赤熱・上=白熱)。
 * - Searchlight(INTRO2_SOLO): 奥の隅櫓 = LOW / 奥の辺の中央 = MID /
 *   手前の隅櫓 = HIGH。手前ほど白熱、奥ほど赤い前後グラデになる。
 *
 * **値は必ず6桁hex(#RRGGBB)。** 8桁の #RRGGBBAA を渡すと Three.Color.set() が
 * 警告だけ出して無視し、その灯が初期色(紫 #8b6cff)のまま残る。灯を薄くしたい
 * ときは色ではなく明るさ側で調整する。
 */
export const REPLY_INTRO2_LASER_LOW = "#e0431c";
export const REPLY_INTRO2_LASER_MID = "#ff8a3a";
export const REPLY_INTRO2_LASER_HIGH = "#ffe4b0";

/*
 * ------------------------------------------------------------------
 * 曲(Reply)のビートグリッド。**すべて reply.mp4 の音声から実測した値**で、
 * 勘で置いた数字ではない。ステージ照明(Searchlight)はこのグリッドの上で動く。
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

/*
 * ------------------------------------------------------------------
 * 拍同期モード(ユーザー指定)。イントロ2(intro-B)のレーザーで先に作った
 * 「拍ごとのON/OFF点滅 + 首振りを可動域の限界へスナップ」を、B・SABI・
 * LATTER・outro の4セクションでも有効にする。BeamLight.tsx と
 * Searchlight.tsx の両方が参照する ―― **対象セクションの一覧はここ1箇所で
 * 持つ**(片方だけ対象セクションがずれると、建物のビームと足元の
 * サーチライトが違う拍で点滅する破綻になるため)。
 * ------------------------------------------------------------------
 */
/** 拍同期モードを適用するセクション。BeamLight.tsx / Searchlight.tsx で共有 */
export const REPLY_BEAT_SYNC_SECTIONS: ReadonlySet<ReplySectionName> = new Set([
  "B",
  "SABI",
  "LATTER",
  "outro",
]);
/**
 * 拍同期モードで1拍のうち点灯している割合(0〜1)。イントロ2レーザーの
 * INTRO2_BLINK_ON(BeamLight.tsx)と同じ考え方。
 */
export const REPLY_BEAT_SYNC_BLINK_ON = 0.38;
/**
 * 拍同期モードの消灯側の残光。**0 = 完全に消す。** イントロ2レーザーの
 * INTRO2_BLINK_FLOOR と同じ理由 ―― 合間に光が見えると、拍ごとに位置が
 * 変わるぶんが「スイングしている」ように見えてしまう。
 */
export const REPLY_BEAT_SYNC_BLINK_FLOOR = 0;

/**
 * Bメロの点滅開始秒数(再生位置)。B区間の拍同期(REPLY_BEAT_SYNC_SECTIONS)は
 * 従来 B の頭(49.5s)から即座に点滅していたが、「Bメロからいきなり点滅してる」
 * というユーザー指摘で、歌詞の頭まで点滅を止め、そこから点滅させる仕様に
 * 変更した。当初は「どこにもないカラフル」の頭(TRACK_NOTES.md §3.1の耳取り
 * 0:55)に合わせていたが、実際には「どこにもない」の時点で点滅が始まって
 * 聞こえるとの指摘で、「カラフル」の頭(56.8s、ユーザーの秒数指定)まで
 * 後ろへずらした。それより前(49.5〜56.8s)は拍同期を外れ、従来の chase
 * パターン(CUES.B)のまま。
 */
export const REPLY_B_BLINK_START_SECONDS = 56.8;

/**
 * 「カラフル　つかまえよう…さぁ！」の間(REPLY_B_BLINK_START_SECONDS〜
 * REPLY_B_HUSH_START_SECONDSの手前まで)だけ、拍のON/OFF点滅を何倍速に
 * するか。reply.mp4 の低域(40-180Hz)を実測したところ、この区間だけ通常の
 * 1拍おきではなくほぼ半拍おき(平均0.19秒間隔)でキックが刻まれていることを
 * 確認した(前後の区間は通常どおり1拍おき)。ユーザーの言う「ずんずんずず
 * ずずん」はこの倍速パルスのことなので、点滅もこの間だけ2倍速にして音と
 * 一致させる。
 */
export const REPLY_B_RISER_BEAT_DIVISOR = 2;

/**
 * Bメロの「静けさ」区間の開始秒数(再生位置)。歌詞「さぁ」の頭(ユーザー
 * 指定の秒数)からB区間の終わり(=SABI開始の62.0s)まで、点滅も含めて
 * 全灯を消灯し、まっすぐ上(可動域の中立姿勢)へ向けて止める
 * (ユーザー指定「さぁのところで点滅やめて、錆に入る前の静けさを出したい
 * からすべてのライトを消して。上に向けて消してね」)。BeamLight.tsx /
 * Searchlight.tsx の両方が参照する(片方だけ静かになると2つのリグが
 * 揃わなくなるため。REPLY_BEAT_SYNC_SECTIONS と同じ理由)。
 */
export const REPLY_B_HUSH_START_SECONDS = 60.7;
/**
 * 上の静けさへ落ちるまでのフェード秒数。**いきなり消えるのではなく、
 * ここにかけて明るさをなだらかに0へ落とす**(ユーザー指摘「さぁのところで
 * いきなり消えているからフェードアウトするようにして」)。姿勢(まっすぐ
 * 上へ向く動き)はもともと slew のなましで滑らかなので触っていない ――
 * 明るさだけが `bHushOn` の瞬間に0へ飛んでいたのが「いきなり消える」の
 * 正体だった。
 */
export const REPLY_B_HUSH_FADE_SECONDS = 0.6;

/**
 * Searchlight(足元のサーチライト)の隅4本(隅櫓の角)を、Bメロで一斉に
 * 灯すのではなく方角で2本ずつ時差を付けて灯す秒数(再生位置)。北2本
 * (隅櫓の右下/左下。ワールドZが負)をここから、南2本(隅櫓の右上/左上。
 * ワールドZが正)は下の REPLY_B_SOUTH_SPOT_START_SECONDS から灯す
 * (ユーザー指定「51.2で北のスポット2個を照らし始めて、54秒で南の
 * スポット2個を照らすようにして」)。それより前は隅4本とも消灯。
 */
export const REPLY_B_NORTH_SPOT_START_SECONDS = 51.2;
/** 南2本(隅櫓の右上/左上)を灯す秒数。REPLY_B_NORTH_SPOT_START_SECONDS 参照 */
export const REPLY_B_SOUTH_SPOT_START_SECONDS = 54.0;
