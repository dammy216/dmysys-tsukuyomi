-- CharacterAnimation(かぐや版)
-- 機能: ① 呼吸           ② カーソル追従(近距離=目だけ / 遠距離=頭・体も振り向く)
--       ③ ランダムまばたき(blinks の 001→008→001 をコマ送り再生)
--       ④ 音量ベースのリップシンク(singAmplitude → mouth_<母音>/001〜008 を開閉)
--       ⑤ 母音の自動選択(ヤチヨと同じ: 音量が大きい→あ/お/え、小さい→い/う/え をランダム。
--          音量が大きいほど短い間隔で切り替え、速くパクパク喋っているように見せる)
--       ⑥ 母音切り替え時の遷移(あ→い 等は、あを一度閉じてから → 閉じた状態で短く
--          クロスフェード → いで開き直す。開いた口同士を長くクロスフェードすると
--          二重露光っぽくなるため、閉じきった瞬間だけの短いクロスフェードにしている)
--       ⑦ [テスト用] ダブルクリックでテスト音声(test音声.mp3)を再生し、その音量で
--          ④のリップシンクを動作確認する。事前解析した音量表を再生位置から引くだけなので、
--          本番の singAmplitude 経路とは独立(テスト音声再生中はそちらを優先する)。
--          本番運用では不要なため、確認が済んだら削除してよい。
--
-- ■ 定数はすべて「かぐやベース」アートボードの実測値から算出している。
--   ヤチヨ(WebYachiyo.lua)の数値をそのまま流用してはいけない(モデルの寸法・配置が違うため)。
--   実測値: アートボード 1920x1920 / 原点(0,0)
--           eyes グループのワールド座標 (969.5, 753.5)  ← 追従の中心
--           face 画像サイズ 320 x 421                    ← 振り向き量の基準
--           eyewhite-r 85x65 と irides-r 52x56 など      ← 瞳の可動域の基準
--
-- ■ スクリプトノード(ScriptedDrawable "webKaguya")はアートボード直下の (0,0) に配置済み。
--   draw() でアートボード全体を覆うほぼ透明な矩形を描き、当たり判定を作っている。
--   これによりカーソルがどこにあっても pointerMove が届き、
--   かつ event.position がそのままアートボード座標になる。
--
-- ■ ViewModel(CharacterAnim インスタンスをかぐやベースにバインド済み)の対応:
--   目追従   irisR/L X・Y, eyelashR/L X・Y, eyewhiteR/L X・Y, eyebrowR/L X・Y
--   呼吸     headY(head グループ), backHairY, neckY, topwearY
--   振り向き headX, bodyX, backHairX, noseX/Y, mouthX/Y, hairX/Y, neckX
--   まばたき eyesDefault(default_eyes の不透明度), blinkF1〜blinkF8(blink_001〜008)
--   リップシンク:
--     singAmplitude    入力音量(0〜1)。React/外部が毎フレーム書き込む
--     mouthVowel       口の形の選択(1=a 2=i 3=u 4=e 5=o)。AUTO_VOWEL=false のときだけ使う
--                      (true のときは音量から自動選択するので、この値は無視される)
--     mouthShapeA〜O   各母音フォルダ(mouth_a〜mouth_o ノード)の不透明度
--     mouthF1〜F8      フレーム画像の不透明度。全母音フォルダで共有バインド
--                      (mouthF3 は a/003, i/003, u/003, e/003, o/003 に同時バインド。
--                       表示されるのは選択中フォルダのものだけなので干渉しない)
--     mouthDefault     default_mouth の不透明度(リップシンク中は 0)
--   ※ faceY は face 画像にバインド済みだが呼吸には使わない(頭ごと動かすため)。
--     既定値に飛ばないよう基準値を書き続けるだけにしている。

type CharacterAnimation = {
    -- 目パーツ (eyes グループ相対のローカル X/Y)
    vmIrisRX: Property<number>?, vmIrisRY: Property<number>?,
    vmIrisLX: Property<number>?, vmIrisLY: Property<number>?,
    vmEyelashRX: Property<number>?, vmEyelashRY: Property<number>?,
    vmEyelashLX: Property<number>?, vmEyelashLY: Property<number>?,
    vmEyewhiteRX: Property<number>?, vmEyewhiteRY: Property<number>?,
    vmEyewhiteLX: Property<number>?, vmEyewhiteLY: Property<number>?,
    vmEyebrowRX: Property<number>?, vmEyebrowRY: Property<number>?,
    vmEyebrowLX: Property<number>?, vmEyebrowLY: Property<number>?,
    -- 呼吸 + 振り向きで動かすボディパーツ
    vmHeadX: Property<number>?, vmHeadY: Property<number>?,
    vmBodyX: Property<number>?,
    vmBackHairX: Property<number>?, vmBackHairY: Property<number>?,
    vmNeckX: Property<number>?, vmNeckY: Property<number>?,
    vmTopwearY: Property<number>?,
    vmWingY: Property<number>?, vmTailY: Property<number>?,  -- topwear と同じ服なので同じ量だけ動かす
    vmNoseX: Property<number>?, vmNoseY: Property<number>?,
    vmMouthX: Property<number>?, vmMouthY: Property<number>?,
    vmHairX: Property<number>?, vmHairY: Property<number>?,
    vmHeadearX: Property<number>?, vmHeadearY: Property<number>?,
    vmEriY: Property<number>?,
    vmFaceY: Property<number>?,   -- 使わないが基準値を保持するために書く
    -- 髪(サイドロック)の慣性揺れ用。並びは HAIR_BASE_ROT と対応
    -- [1-4]=Right A1〜A4, [5-8]=Right B1〜B4, [9-12]=Left A1〜A4, [13-16]=Left B1〜B4
    vmHairRots: {Property<number>?},
    -- まばたき用の不透明度
    vmEyesDefault: Property<number>?,
    vmBlinkFrames: {Property<number>?},  -- [1]=blink_001 〜 [8]=blink_008
    -- リップシンク用
    vmSingAmp: Property<number>?,        -- 入力: 音量(0〜1)。React 等が書き込む
    vmMouthVowel: Property<number>?,     -- 入力: 母音の選択(1=a 2=i 3=u 4=e 5=o)
    vmMouthShapes: {Property<number>?},  -- [1]=mouth_a 〜 [5]=mouth_o フォルダの不透明度
    vmMouthFrames: {Property<number>?},  -- [1]=001 〜 [8]=008 (全母音フォルダで共有)
    vmMouthDefault: Property<number>?,   -- default_mouth の不透明度
    -- 入力・内部状態
    mouseX: number,
    mouseY: number,
    breathTime: number,
    eyeOffsetX: number,
    eyeOffsetY: number,
    turnX: number,        -- 振り向き(横)のなめらかな値 (-1〜1)
    turnY: number,        -- 振り向き(縦)のなめらかな値 (-1〜1)
    -- 髪の慣性揺れ(Live2D 風の振り子物理)。詳細は updateHairPhysics を参照
    prevTurnX: number,    -- 前フレームの turnX(振り向き速度を差分で求めるため)
    headVelX: number,     -- 平滑化した頭の振り向き速度。これが髪を振らせる唯一の入力
    hairAngles: {number}, -- 各セグメントの静止角からの相対回転(度)
    hairVels: {number},   -- 各セグメントの角速度(度/秒)
    hairVelsPrev: {number}, -- 1フレーム前の角速度(子が親を追いかける遅延を作るために使う)
    hairDriveSmooth: {number}, -- 親からの入力を平滑化した値(毛先ほど強く遅らせるため)
    blinking: boolean,
    blinkT: number,       -- まばたき開始からの経過秒
    blinkTimer: number,   -- 次のまばたきまでの残り秒
    -- リップシンク内部状態
    lipEnv: number,       -- 音量エンベロープ(平滑化した音量 0〜1)
    lipFrame: number,     -- 音量から算出した現在のフレーム(1〜8)。母音遷移中でも裏で更新し続ける
    lipSpeaking: boolean, -- 発話中か(ヒステリシスでチャタリング防止)
    -- 母音の自動選択(音量の大小で口の傾向を変え、一定間隔で切り替える)
    autoVowel: number,         -- 自動選択中の母音(1〜5)
    vowelTimer: number,        -- 次の母音切り替えまでの残り秒
    -- 母音遷移(あ→い 等で、一度閉じてから切り替える)
    activeVowel: number,       -- 現在表示中の母音(1〜5)。要求(mouthVowel)と違う間は遷移中
    vowelTransitioning: boolean,
    vowelTransT: number,       -- 遷移開始からの経過秒
    vowelTransStartFrame: number, -- 遷移開始時点のフレーム(そこから閉じ側へイージングする)
    -- 閉じきった瞬間の旧→新母音クロスフェード
    vowelCrossfading: boolean,
    vowelCrossfadeT: number,   -- クロスフェード開始からの経過秒
    vowelFadeFrom: number,     -- フェードアウトする母音(旧)
    vowelFadeTo: number,       -- フェードインする母音(新)
    -- 当たり判定用(描画リソースはファクトリで一度だけ生成する)
    hitPath: Path,
    hitPaint: Paint,
    -- テスト用: ダブルクリックでテスト音声を再生し、その音量でリップシンクを動作確認する。
    -- 本番では singAmplitude(外部/React) をそのまま使うので、このブロックは動作確認用。
    testAudioSource: AudioSource?,
    testAudioSound: AudioSound?,
    testAudioPlaying: boolean,
    lastClickAt: number,  -- ダブルクリック判定用(breathTime を時計として使う)
}

--==========================================================================
-- 実測値ベースの定数
--==========================================================================

-- アートボード寸法(当たり判定の矩形サイズ)
local ARTBOARD_W = 1920.0
local ARTBOARD_H = 1920.0

-- 追従の中心 = 左右の瞳(irides)のワールド座標の中点。
-- eyes グループの原点(969.5, 753.5)は瞳より約17px上にあり、そこを中心にすると
-- 視線がわずかに上へずれるため、瞳そのものの中点を使う。
--   irides-r world (899.0, 773.0) / irides-l world (1043.5, 768.5)
--   → 中点 ((899.0+1043.5)/2, (773.0+768.5)/2) = (971.25, 770.75)
-- スクリプトノードが (0,0) にあるので event.position とそのまま同じ座標系。
local EYE_CENTER_X = 0
local EYE_CENTER_Y = 0

-- true にすると、クリック位置をコンソールに出力する(追従中心のキャリブレーション用)。
-- キャラの瞳の真上をクリックした値が EYE_CENTER_X/Y と一致していれば正しい。
local DEBUG_POINTER = true

--==========================================================================
-- テスト用: ダブルクリックでテスト音声を再生し、その音量でリップシンクを確認する
--==========================================================================
-- Rive の AudioSound には再生中の音量を測る API が無いため、テスト音声(rive/assets/
-- test音声.mp3, 7.31秒)を事前に Python で解析し、50ms刻みのRMS音量(0〜1に正規化)を
-- 埋め込んでいる。再生中は soundInstance:time() で今の再生位置を取り、この表を引く。
-- 母音・開閉のロジックは本番の singAmplitude 経路(updateFrameFromVolume)を丸ごと再利用する。
local TEST_AUDIO_ASSET_NAME = "testAudio"  -- Riveに音声をインポートした時につけるアセット名
local TEST_AUDIO_WINDOW     = 0.05         -- 解析した窓の長さ(秒)
local DOUBLE_CLICK_TIME     = 0.3          -- この秒数以内の2クリックをダブルクリックとみなす
local TEST_AUDIO_ENVELOPE: {number} = {
    0.0001, 0.1589, 0.7176, 0.9520, 0.8041, 0.4774, 0.3894, 0.4799, 0.4004, 0.4506,
    0.5378, 0.5475, 0.5265, 0.4537, 0.3407, 0.3376, 0.3133, 0.2352, 0.0577, 0.0878,
    0.1370, 0.1354, 0.4759, 0.3678, 0.3712, 0.4711, 0.3609, 0.0887, 0.6315, 0.1923,
    0.2075, 0.7847, 0.6118, 0.2530, 0.2779, 0.0501, 0.1713, 0.1409, 0.0868, 0.2771,
    0.5087, 0.6133, 0.2884, 0.6050, 0.3625, 0.4300, 0.6330, 0.0500, 0.0697, 0.3540,
    0.3167, 0.2359, 0.3474, 0.1510, 0.0889, 0.0480, 0.5688, 0.2819, 0.0407, 0.3832,
    0.5381, 0.2720, 0.0651, 0.1382, 0.2792, 1.0000, 0.0916, 0.0294, 0.3516, 0.4159,
    0.9455, 0.4670, 0.0112, 0.0016, 0.0012, 0.0211, 0.1148, 0.7794, 0.6614, 0.1910,
    0.1871, 0.4418, 0.3295, 0.1693, 0.0444, 0.4504, 0.0278, 0.7356, 0.6931, 0.1822,
    0.3602, 0.1524, 0.2313, 0.3386, 0.1801, 0.2640, 0.3731, 0.3276, 0.1737, 0.0224,
    0.0010, 0.0006, 0.0006, 0.0006, 0.0008, 0.0016, 0.2134, 0.4182, 0.7264, 0.6221,
    0.5029, 0.4741, 0.4718, 0.5012, 0.2493, 0.4802, 0.3445, 0.0725, 0.2797, 0.4605,
    0.3381, 0.2651, 0.2770, 0.4786, 0.4212, 0.5083, 0.5017, 0.2281, 0.2254, 0.8080,
    0.1694, 0.0042, 0.5103, 0.8858, 0.3670, 0.1006, 0.5798, 0.3302, 0.2096, 0.2086,
    0.5497, 0.6365, 0.2643, 0.0055, 0.0009, 0.0002, 0.0000,
}

-- 目パーツの基準ローカル座標(実測値)
local IRIS_RX, IRIS_RY = -70.5,  8.5
local IRIS_LX, IRIS_LY =  74.0,  4.0
local LASH_RX, LASH_RY = -86.5,  1.5
local LASH_LX, LASH_LY =  90.0, -3.0
local WHIT_RX, WHIT_RY = -79.0,  4.0
local WHIT_LX, WHIT_LY =  79.5,  2.0
local BROW_RX, BROW_RY = -75.5,  1.5
local BROW_LX, BROW_LY =  73.5, -3.0

-- ボディパーツの基準ローカル座標(実測値)
local BASE_HEAD_X,  BASE_HEAD_Y  = 959.5, 958.0
local BASE_BODY_X                = 959.5
local BASE_BHAIR_X, BASE_BHAIR_Y = 958.0, 958.0
local BASE_NECK_X,  BASE_NECK_Y  =  12.5,  38.5
local BASE_TOPWEAR_Y             = 253.5
local BASE_NOSE_X,  BASE_NOSE_Y  =   5.5, -135.5
local BASE_MOUTH_X, BASE_MOUTH_Y =   6.5,  -80.5
local BASE_HAIR_X,  BASE_HAIR_Y  =   0.5,   2.0
local BASE_HEADEAR_X, BASE_HEADEAR_Y = 0.94, -1.5  -- hairs グループ相対
local BASE_ERI_Y                 =  19.5
local BASE_WING_Y                =   0.0   -- wing(topwear と同じ服なので同じ量だけ動かす)
local BASE_TAIL_Y                = 424.0   -- tail(同上)
local BASE_FACE_Y                = -229.5

-- 瞳の可動域。eyewhite と irides のサイズ差(＝白目の中で瞳が動ける余白)から決める。
--   右目: (85-52)/2 = 16.5 [X], (65-56)/2 = 4.5 [Y]
--   左目: (82-51)/2 = 15.5 [X], (61-55)/2 = 3.0 [Y]
-- 狭いほうの目に合わせ、さらに余裕を持たせて瞳が白目からはみ出さないようにする。
local EYE_MAX_OFFSET_X = 11.5
-- 縦方向は上下で余白が違う(瞳は白目の中心よりやや下寄りに配置されているため、
-- 上方向のほうが余白が広い)。マウスが上にあるときに瞳がもっと上まで動くよう、
-- 上方向だけ広めに、下方向は元の値のまま安全側にしておく。
local EYE_MAX_OFFSET_Y_UP   = 9   -- カーソルが上にあるとき(瞳を上へ)
local EYE_MAX_OFFSET_Y_DOWN = 2.5   -- カーソルが下にあるとき(瞳を下へ)
-- 顔幅(320)の約1.2倍。カーソルが顔の周辺にいる間は「目だけ」で追う。
local EYE_REACH        = 380.0
local EYE_LERP_SPEED   = 5.0    -- 追従の滑らかさ(高いほど俊敏)

-- 振り向き(深度パララックス)。EYE_REACH を超えた分で 0→1 に立ち上がる。
-- TURN_REACH はカーソルがアートボード端(中心から約950px)に近づくと最大になる距離。
local TURN_REACH = 900.0
-- パーツごとの最大移動量(px)。顔サイズ 320x421 を基準に前方ほど大きく動かして奥行きを出す。
local HEAD_X,  HEAD_Y  = 22.0, 14.0  -- 頭グループ全体(顔幅の約7% / 顔高の約3.3%)
local NOSE_X,  NOSE_Y  = 11.0,  7.0  -- 鼻(最前面: 頭移動に上乗せ = 頭の50%)
local MOUTH_X, MOUTH_Y =  7.0,  4.0  -- 口(頭の約32%)
local HAIR_X,  HAIR_Y  = 10.0,  6.0  -- 前髪(頭の約45%)
local BHAIR_X          = -7.0        -- 後ろ髪(逆方向 → 振り向きで見えてくる)
local BODY_X           =  8.0        -- 体(頭につられて傾く)
local NECK_X           =  6.0        -- 首(体に上乗せ)
-- 獣耳(headear)。前髪ほど顔の動きに追従させず、後ろ髪と同じ量・同じ向き(逆方向)にする。
-- 頭グループの移動(22/14)には乗るので、実際の追従量は 22-7=15 と前髪(22+10=32)の半分弱になる。
local HEADEAR_X, HEADEAR_Y = -14.0, -4.0

--==========================================================================
-- 髪(サイドロック)の慣性揺れ(Live2D 風の振り子物理)のパラメータ
--==========================================================================
-- Right/Left Locks Root・Bangs Root は頭に固定したまま動かさない(根本付近は揺れない)。
-- 各サイド、Root から 2本の毛束(A: 4ボーン, B: 4ボーン)が分岐している。前髪は Bangs Root→Bangs Tip の1本。
--   [1-4]   Right Locks A1〜A4
--   [5-8]   Right Locks B1〜B4
--   [9-12]  Left Locks A1〜A4
--   [13-16] Left Locks B1〜B4
--   [17]    Bangs Tip
--   [18-21] Right Back Locks 1〜4(後ろ髪・右、根本→毛先)
--   [22-25] Left Back Locks 1〜4(後ろ髪・左)
--   [26-29] Center Back Locks 1〜4(後ろ髪・中央、毛量が多く重め)
--   [30-33] Right Headear 1〜4(獣耳・右。髪ではないのでよく揺れる/跳ねる)
--   [34-37] Left Headear 1〜4(獣耳・左)
local HAIR_COUNT = 37

-- 各ボーンの静止回転(度)。Riveエディタでの実測値で、揺れはここからの相対で加算する。
local HAIR_BASE_ROT: {number} = {
    -31.365845319384682,   -- [1]  Right A1
      6.330711956226803,   -- [2]  Right A2
      2.4166928051139513,  -- [3]  Right A3
    -19.003620244143754,   -- [4]  Right A4
    -12.118653334441838,   -- [5]  Right B1
     -3.3150832340181755,  -- [6]  Right B2
    -13.580833613766828,   -- [7]  Right B3
     17.518966603652995,   -- [8]  Right B4
     21.684081991173393,   -- [9]  Left A1
      7.2748713810412955,  -- [10] Left A2
     -3.2582976427323787,  -- [11] Left A3
    -28.448988032661607,   -- [12] Left A4
      8.461432544527783,   -- [13] Left B1
      8.112805095401876,   -- [14] Left B2
     -7.855378596477678,   -- [15] Left B3
    -13.794078661662326,   -- [16] Left B4
     -5.0,                 -- [17] Bangs Tip
     -9.007399392206077,   -- [18] Right Back Locks 1
     -2.801100640541757,   -- [19] Right Back Locks 2
     15.049939080455374,   -- [20] Right Back Locks 3
     -8.49725543147415,    -- [21] Right Back Locks 4
      9.969677823061414,   -- [22] Left Back Locks 1
     -6.975416973495818,   -- [23] Left Back Locks 2
     24.768381737814188,   -- [24] Left Back Locks 3
    -36.77946915855456,    -- [25] Left Back Locks 4
      2.395291530211533,   -- [26] Center Back Locks 1
      0.41273032951744354, -- [27] Center Back Locks 2
     -0.7051351779815532,  -- [28] Center Back Locks 3
     -0.019559528041372082,-- [29] Center Back Locks 4
    -24.70509662173428,    -- [30] Right Headear 1
     -7.072193452411542,   -- [31] Right Headear 2
      3.6478456884657797,  -- [32] Right Headear 3
     10.901564209434014,   -- [33] Right Headear 4
     24.711849818058745,   -- [34] Left Headear 1
      6.300381386996745,   -- [35] Left Headear 2
     -5.911752823069244,   -- [36] Left Headear 3
    -13.15626138289343,    -- [37] Left Headear 4
}

-- 各セグメントの親(0 = 頭に直結)。親の角速度がそのまま子への慣性入力になるので、
-- 根本→先端へ一拍ずつ遅れて伝わり、鞭のようにしなる。
local HAIR_PARENT: {number} = {
    0, 1, 2, 3,  0, 5, 6, 7,  0, 9, 10, 11,  0, 13, 14, 15,  0,  -- [1-17]
    0, 18, 19, 20,  -- [18-21] Right Back Locks 1→2→3→4
    0, 22, 23, 24,  -- [22-25] Left Back Locks 1→2→3→4
    0, 26, 27, 28,  -- [26-29] Center Back Locks 1→2→3→4
    0, 30, 31, 32,  -- [30-33] Right Headear 1→2→3→4
    0, 34, 35, 36,  -- [34-37] Left Headear 1→2→3→4
}

-- 頭の動きを受け取る向き。後ろ髪・獣耳は前髪と逆方向に振れるのが自然
-- (振り向くと前髪は流れて見え、後ろ髪・耳は逆に巻き込まれて見える。既存の BHAIR_X = -7.0 と同じ考え方)。
-- 子は親から受け取った時点で既に符号反転済みの値を使うので、根本(位置1)だけ -1 にすればよい。
local HAIR_DRIVE_SIGN: {number} = {
    1, 1, 1, 1,  1, 1, 1, 1,  1, 1, 1, 1,  1, 1, 1, 1,  1,  -- [1-17] 前髪・サイドロック
    -1, 1, 1, 1,  -- [18-21] Right Back Locks
    -1, 1, 1, 1,  -- [22-25] Left Back Locks
    -1, 1, 1, 1,  -- [26-29] Center Back Locks
    -1, 1, 1, 1,  -- [30-33] Right Headear
    -1, 1, 1, 1,  -- [34-37] Left Headear
}

-- チェーン内の位置(1=根本側 〜 4=毛先)ごとのばね/減衰/慣性/可動域。
-- 4本×4チェーン分(Right A/B, Left A/B)、同じ位置なら同じ挙動になるよう繰り返す。
local function repeat4(a: number, b: number, c: number, d: number): {number}
    return {a, b, c, d, a, b, c, d, a, b, c, d, a, b, c, d}
end
-- 各ボーンの実測した長さ(px)。Riveエディタでの現在値(HAIR_BASE_ROT と同じ並び)。
local HAIR_LENGTH: {number} = {
    164.25795244396014,  -- [1]  Right A1
    163.11330143185035,  -- [2]  Right A2
    139.46875486346988,  -- [3]  Right A3
    121.74491134256077,  -- [4]  Right A4
    168.26955275079197,  -- [5]  Right B1
    204.69659748414867,  -- [6]  Right B2
    270.1108826303579,   -- [7]  Right B3
    131.96510923491755,  -- [8]  Right B4
    152.545760626371,    -- [9]  Left A1
    181.22116867902255,  -- [10] Left A2
    160.0677973667485,   -- [11] Left A3
     89.87237560925526,  -- [12] Left A4
    166.33335671308814,  -- [13] Left B1
    215.60880186093743,  -- [14] Left B2
    225.09746317339247,  -- [15] Left B3
    175.72025653827188,  -- [16] Left B4
     90.0,               -- [17] Bangs Tip
    213.50077959850896,  -- [18] Right Back Locks 1
    211.6674291610775,   -- [19] Right Back Locks 2
    263.0377087478788,   -- [20] Right Back Locks 3
     87.4594820793582,   -- [21] Right Back Locks 4
    313.8698090954577,   -- [22] Left Back Locks 1
    213.0074624958332,   -- [23] Left Back Locks 2
     77.88146086384826,  -- [24] Left Back Locks 3
    181.28366299490077,  -- [25] Left Back Locks 4
    176.0118710617738,   -- [26] Center Back Locks 1
    214.67825085172757,  -- [27] Center Back Locks 2
    234.14655999999817,  -- [28] Center Back Locks 3
    232.3899595734695,   -- [29] Center Back Locks 4
    135.68192956619575,  -- [30] Right Headear 1
    151.1304781606455,   -- [31] Right Headear 2
    154.18964156587214,  -- [32] Right Headear 3
     92.60533445275254,  -- [33] Right Headear 4
    121.16899623650588,  -- [34] Left Headear 1
    166.60840557140088,  -- [35] Left Headear 2
    170.0809209210052,   -- [36] Left Headear 3
    101.87316145062523,  -- [37] Left Headear 4
}

-- ばね定数: 長いボーンほど元の角度へ戻ろうとする力を強くする(ボーン自体の長さに比例)。
local HAIR_STIFFNESS_LENGTH_SCALE = 0.2
local HAIR_STIFFNESS: {number} = {}
for i = 1, HAIR_COUNT do
    HAIR_STIFFNESS[i] = HAIR_LENGTH[i] * HAIR_STIFFNESS_LENGTH_SCALE
end
-- Right/Left Back Locks の 2・3番目(中間)は、たまたま実測が長いボーンが混ざっていて
-- 長さ比例のバネ計算だと根本並みに硬くなり、毛先しか曲がらなくなっていた。
-- 「毛先だけでなく中間からも動いてよい」ため、中間のバネを個別に弱める。
HAIR_STIFFNESS[19] = 20  -- Right Back Locks 2
HAIR_STIFFNESS[20] = 14  -- Right Back Locks 3 (263px と特に長く、最も硬くなっていた)
HAIR_STIFFNESS[23] = 18  -- Left Back Locks 2
HAIR_STIFFNESS[24] = 12  -- Left Back Locks 3
-- 獣耳の先端(位置3・4)はもっとしなってよいので、バネをさらに弱める。
HAIR_STIFFNESS[32] = 6   -- Right Headear 3
HAIR_STIFFNESS[33] = 4   -- Right Headear 4
HAIR_STIFFNESS[36] = 6   -- Left Headear 3
HAIR_STIFFNESS[37] = 4   -- Left Headear 4

-- 減衰・慣性・可動域はチェーン内の位置(1=根本側 〜 4=毛先)で決める。
local HAIR_DAMPING: {number}   = table.clone(repeat4(8, 5, 4, 2.5))
local HAIR_INERTIA: {number}   = table.clone(repeat4(7, 8, 7, 6))
-- Right/Left Locks B2 は他より反応が強すぎたので個別に弱める
HAIR_INERTIA[6], HAIR_INERTIA[14] = 4, 4  -- Right Locks B2, Left Locks B2
local HAIR_MAX_ANGLE: {number} = table.clone(repeat4(10, 16, 18, 20))
table.insert(HAIR_DAMPING, 7)
table.insert(HAIR_INERTIA, 5)
-- 後ろ髪: 中央(Center)は毛量が多く重いので慣性を抑えめ・可動域を狭く。
-- 右/左は中央より軽いが、全体的に長い髪なので大きく揺らしすぎない(「重すぎず」)。
-- 左右も微妙に値を変えて完全なミラー同期を避ける。
table.insert(HAIR_DAMPING, 8)    -- [18] Right Back Locks 1 (位置1)
table.insert(HAIR_INERTIA, 7)
table.insert(HAIR_DAMPING, 5.5)  -- [19] Right Back Locks 2 (位置2)
table.insert(HAIR_INERTIA, 8)
table.insert(HAIR_DAMPING, 4.5)  -- [20] Right Back Locks 3 (位置3)
table.insert(HAIR_INERTIA, 7.5)
table.insert(HAIR_DAMPING, 3)    -- [21] Right Back Locks 4 (位置4)
table.insert(HAIR_INERTIA, 7)
table.insert(HAIR_DAMPING, 7)    -- [22] Left Back Locks 1 (位置1、右より少し柔らかい)
table.insert(HAIR_INERTIA, 6.5)
table.insert(HAIR_DAMPING, 5)    -- [23] Left Back Locks 2 (位置2)
table.insert(HAIR_INERTIA, 7.5)
table.insert(HAIR_DAMPING, 4)    -- [24] Left Back Locks 3 (位置3)
table.insert(HAIR_INERTIA, 7)
table.insert(HAIR_DAMPING, 2.7)  -- [25] Left Back Locks 4 (位置4)
table.insert(HAIR_INERTIA, 6.5)
table.insert(HAIR_DAMPING, 10)   -- [26] Center Back Locks 1 (位置1、重い)
table.insert(HAIR_INERTIA, 1.5)
table.insert(HAIR_DAMPING, 7)    -- [27] Center Back Locks 2 (位置2)
table.insert(HAIR_INERTIA, 1.6)
table.insert(HAIR_DAMPING, 5.5)  -- [28] Center Back Locks 3 (位置3)
table.insert(HAIR_INERTIA, 1.4)
table.insert(HAIR_DAMPING, 4)    -- [29] Center Back Locks 4 (位置4)
table.insert(HAIR_INERTIA, 1.2)
-- 獣耳(headear)は髪と違ってよく動いてよい。反応(慣性)を強く・減衰を軽くして、
-- 実際の動物の耳のようにピクピク・パタパタとよく揺れる/跳ねる感じにする。
table.insert(HAIR_DAMPING, 7)    -- [30] Right Headear 1 (位置1)
table.insert(HAIR_INERTIA, 7)
table.insert(HAIR_DAMPING, 5)    -- [31] Right Headear 2 (位置2)
table.insert(HAIR_INERTIA, 7.5)
table.insert(HAIR_DAMPING, 2)    -- [32] Right Headear 3 (位置3、先端寄りなのでよくしなるように)
table.insert(HAIR_INERTIA, 11)
table.insert(HAIR_DAMPING, 1.3)  -- [33] Right Headear 4 (位置4、先端)
table.insert(HAIR_INERTIA, 11)
table.insert(HAIR_DAMPING, 6.5)  -- [34] Left Headear 1 (位置1、右より少し柔らかい)
table.insert(HAIR_INERTIA, 6.5)
table.insert(HAIR_DAMPING, 4.5)  -- [35] Left Headear 2 (位置2)
table.insert(HAIR_INERTIA, 7)
table.insert(HAIR_DAMPING, 1.8)  -- [36] Left Headear 3 (位置3、先端寄り)
table.insert(HAIR_INERTIA, 10.5)
table.insert(HAIR_DAMPING, 1.2)  -- [37] Left Headear 4 (位置4、先端)
table.insert(HAIR_INERTIA, 10.5)

-- 親の動きが子へ「伝わる速さ」。値が大きいほど親の動きにほぼ即座に反応し、
-- 小さいほど反応が遅れる(=伝わる力が弱まって遅く届く)。根本は速く、毛先ほど遅くする。
local HAIR_DRIVE_SMOOTH: {number} = table.clone(repeat4(3, 1, 0.8, 0.3))
table.insert(HAIR_DRIVE_SMOOTH, 8)  -- [17] Bangs Tip
table.insert(HAIR_MAX_ANGLE, 8)
table.insert(HAIR_DRIVE_SMOOTH, 2.5)   -- [18] Right Back Locks 1 (位置1)
table.insert(HAIR_MAX_ANGLE, 13)
table.insert(HAIR_DRIVE_SMOOTH, 0.9)   -- [19] Right Back Locks 2 (位置2)
table.insert(HAIR_MAX_ANGLE, 17)
table.insert(HAIR_DRIVE_SMOOTH, 0.7)   -- [20] Right Back Locks 3 (位置3)
table.insert(HAIR_MAX_ANGLE, 19)
table.insert(HAIR_DRIVE_SMOOTH, 0.25)  -- [21] Right Back Locks 4 (位置4)
table.insert(HAIR_MAX_ANGLE, 21)
table.insert(HAIR_DRIVE_SMOOTH, 2.2)   -- [22] Left Back Locks 1 (位置1)
table.insert(HAIR_MAX_ANGLE, 12)
table.insert(HAIR_DRIVE_SMOOTH, 0.8)   -- [23] Left Back Locks 2 (位置2)
table.insert(HAIR_MAX_ANGLE, 16)
table.insert(HAIR_DRIVE_SMOOTH, 0.6)   -- [24] Left Back Locks 3 (位置3)
table.insert(HAIR_MAX_ANGLE, 18)
table.insert(HAIR_DRIVE_SMOOTH, 0.22)  -- [25] Left Back Locks 4 (位置4)
table.insert(HAIR_MAX_ANGLE, 20)
table.insert(HAIR_DRIVE_SMOOTH, 2.2)   -- [26] Center Back Locks 1 (位置1、重いので反応も控えめ)
table.insert(HAIR_MAX_ANGLE, 2.5)
table.insert(HAIR_DRIVE_SMOOTH, 0.8)   -- [27] Center Back Locks 2 (位置2)
table.insert(HAIR_MAX_ANGLE, 3.5)
table.insert(HAIR_DRIVE_SMOOTH, 0.6)   -- [28] Center Back Locks 3 (位置3)
table.insert(HAIR_MAX_ANGLE, 4)
table.insert(HAIR_DRIVE_SMOOTH, 0.2)   -- [29] Center Back Locks 4 (位置4)
table.insert(HAIR_MAX_ANGLE, 4.5)
table.insert(HAIR_DRIVE_SMOOTH, 3)     -- [30] Right Headear 1 (位置1)
table.insert(HAIR_MAX_ANGLE, 10)
table.insert(HAIR_DRIVE_SMOOTH, 1.1)   -- [31] Right Headear 2 (位置2)
table.insert(HAIR_MAX_ANGLE, 14)
table.insert(HAIR_DRIVE_SMOOTH, 1.1)   -- [32] Right Headear 3 (位置3)
table.insert(HAIR_MAX_ANGLE, 35)
table.insert(HAIR_DRIVE_SMOOTH, 0.5)   -- [33] Right Headear 4 (位置4)
table.insert(HAIR_MAX_ANGLE, 42)
table.insert(HAIR_DRIVE_SMOOTH, 2.7)   -- [34] Left Headear 1 (位置1)
table.insert(HAIR_MAX_ANGLE, 9)
table.insert(HAIR_DRIVE_SMOOTH, 1.0)   -- [35] Left Headear 2 (位置2)
table.insert(HAIR_MAX_ANGLE, 13)
table.insert(HAIR_DRIVE_SMOOTH, 1.0)   -- [36] Left Headear 3 (位置3)
table.insert(HAIR_MAX_ANGLE, 32)
table.insert(HAIR_DRIVE_SMOOTH, 0.45)  -- [37] Left Headear 4 (位置4)
table.insert(HAIR_MAX_ANGLE, 40)

-- 同じ位置(例: B2)でもチェーンによって実際のボーン長は違う(B2はA2よりだいぶ長い、等)のに
-- ここまでの設定は位置だけで決めていたため、全部同じ動きに見えていた。
-- 各ボーンの長さを「その位置の平均長さ」と比べた比率で、個別に補正する。
-- 長いボーンほど: 反応が遅く・遅れが大きく・減衰が弱く(長く揺れる)・可動域が広くなる。
local HAIR_LENGTH_RATIO: {number} = {
    1.008, 0.853, 0.702, 0.938,  -- Right A1-A4 (位置1-4平均比)
    1.033, 1.071, 1.360, 1.017,  -- Right B1-B4
    0.937, 0.948, 0.806, 0.692,  -- Left A1-A4
    1.021, 1.128, 1.133, 1.354,  -- Left B1-B4
    1.0,                          -- Bangs Tip(比較対象が無いので補正なし)
    1.0, 1.0, 1.0, 1.0,            -- Right Back Locks 1-4(同上、専用プロファイルで既に調整済み)
    1.0, 1.0, 1.0, 1.0,            -- Left Back Locks 1-4(同上)
    1.0, 1.0, 1.0, 1.0,            -- Center Back Locks 1-4(同上)
    1.0, 1.0, 1.0, 1.0,            -- Right Headear 1-4(同上、専用プロファイルで調整済み)
    1.0, 1.0, 1.0, 1.0,            -- Left Headear 1-4(同上)
}
-- 比率をそのまま使うと差が7〜30%程度にしかならず体感できないため、3乗して差を強く増幅する
-- (比率0.7〜1.4 → 3乗で約0.33〜2.7倍まで広がる)。
for i = 1, HAIR_COUNT do
    local r = HAIR_LENGTH_RATIO[i]
    local r3 = r * r * r
    HAIR_INERTIA[i]      = HAIR_INERTIA[i] / r3
    HAIR_DRIVE_SMOOTH[i] = HAIR_DRIVE_SMOOTH[i] / r3
    HAIR_DAMPING[i]      = HAIR_DAMPING[i] / r3
    HAIR_MAX_ANGLE[i]    = HAIR_MAX_ANGLE[i] * r3
end

-- fronthair の Right/Left Locks B4(毛先)をもっとしなるように個別に強化する。
HAIR_STIFFNESS[8]     = 12   -- Right Locks B4
HAIR_INERTIA[8]        = 9
HAIR_DAMPING[8]        = 1.5
HAIR_MAX_ANGLE[8]      = 32
HAIR_DRIVE_SMOOTH[8]   = 0.4
HAIR_STIFFNESS[16]    = 14   -- Left Locks B4
HAIR_INERTIA[16]       = 8.5
HAIR_DAMPING[16]       = 1.2
HAIR_MAX_ANGLE[16]     = 38
HAIR_DRIVE_SMOOTH[16]  = 0.35

-- A4 は B4 よりさらにしなるようにする(バネを弱く・慣性と可動域を大きく)。
HAIR_STIFFNESS[4]     = 8    -- Right Locks A4
HAIR_INERTIA[4]        = 11
HAIR_DAMPING[4]        = 1.0
HAIR_MAX_ANGLE[4]      = 40
HAIR_DRIVE_SMOOTH[4]   = 0.5
HAIR_STIFFNESS[12]    = 10   -- Left Locks A4
HAIR_INERTIA[12]       = 10.5
HAIR_DAMPING[12]       = 0.9
HAIR_MAX_ANGLE[12]     = 45
HAIR_DRIVE_SMOOTH[12]  = 0.45

-- 位置3(A3・B3、毛先の一歩手前)も A・B 両方・左右ともしなりを強める。
-- 位置2と位置4(上で強化済み)の間になるように、4ほど極端ではない値にする。
-- A3 は B4 と似すぎていたので、短く軽い毛束らしく「素早く・小さく」動くように変える
-- (バネ・減衰・反応速度を上げて、可動域を小さくする。B4 は逆にゆったり大きく揺れたまま)。
HAIR_STIFFNESS[3]     = 22   -- Right Locks A3
HAIR_INERTIA[3]        = 7
HAIR_DAMPING[3]        = 3.5
HAIR_MAX_ANGLE[3]      = 18
HAIR_DRIVE_SMOOTH[3]   = 1.3
HAIR_STIFFNESS[7]     = 18   -- Right Locks B3
HAIR_INERTIA[7]        = 8
HAIR_DAMPING[7]        = 2.3
HAIR_MAX_ANGLE[7]      = 24
HAIR_DRIVE_SMOOTH[7]   = 0.6
HAIR_STIFFNESS[11]    = 24   -- Left Locks A3(同様に軽やかに)
HAIR_INERTIA[11]       = 6.5
HAIR_DAMPING[11]       = 3.2
HAIR_MAX_ANGLE[11]     = 16
HAIR_DRIVE_SMOOTH[11]  = 1.2
HAIR_STIFFNESS[15]    = 16   -- Left Locks B3
HAIR_INERTIA[15]       = 7.5
HAIR_DAMPING[15]       = 2.0
HAIR_MAX_ANGLE[15]     = 28
HAIR_DRIVE_SMOOTH[15]  = 0.55

-- B2 からしなり始めるようにバネを弱める。慣性は以前「頭に追従しすぎ」で
-- 4 まで下げた経緯があるのでそこは維持し(頭の動きへの直接反応は控えめのまま)、
-- バネ・減衰・可動域だけ B3 に近づけて「動き出したらよく曲がる」ようにする。
HAIR_STIFFNESS[6]     = 20   -- Right Locks B2
HAIR_DAMPING[6]        = 3.5
HAIR_MAX_ANGLE[6]      = 22
HAIR_STIFFNESS[14]    = 18   -- Left Locks B2
HAIR_DAMPING[14]       = 3.2
HAIR_MAX_ANGLE[14]     = 24

-- turnX(-1〜1)の変化速度を「度/秒」相当へ換算する倍率。全体の揺れ量はここで一括調整できる。
local HEAD_VEL_SCALE  = 20.0
-- 振り向き速度の平滑化(高いほど俊敏に反応)。カーソルが飛んだときの跳ねを抑える。
local HEAD_VEL_SMOOTH = 12.0
-- 頭の振り向き速度信号の上限。これが無いと素早く振り向いたときに髪の反応量が
-- 際限なく大きくなってしまうため、普通の動きの範囲を超えた分は頭打ちにする。
local HEAD_VEL_MAX    = 45.0
-- 物理の1ステップ上限(秒)。フレームが飛んだとき、大きすぎる dt で発散するのを防ぐ。
local HAIR_MAX_STEP   = 1.0 / 30.0

-- 呼吸。顔高(421)の約1.7%を振幅とする。
local BREATH_AMP   = 7.0
local BREATH_SPEED = 0.25     -- 1秒あたりの呼吸サイクル数 (0.25 = 約15回/分)

-- リップシンク(音量ベース)。mouth_a〜mouth_o の各フォルダに 001(閉じ)〜008(全開)の8コマ。
-- 音量(singAmplitude 0〜1)をエンベロープで平滑化し、その値でフレーム番号を動的に算出する。
local LIP_FRAMES     = 8
local LIP_ATTACK     = 20.0   -- 音量が上がるときの追従速度(高い=口がすぐ開く。遅れ防止)
local LIP_RELEASE    = 8.0    -- 音量が下がるときの追従速度(低め=ゆっくり閉じて自然に)
local LIP_ON         = 0.06   -- これ以上で発話開始とみなす(ヒステリシス上限)
local LIP_OFF        = 0.03   -- これ未満で無音とみなし口を完全に閉じる(下限)
local LIP_GAIN       = 1.6    -- 音量→開き具合の増幅率(普通の声量でも大きく開くように)
local LIP_CURVE      = 0.7    -- 開き具合のカーブ(<1 で小音量域を持ち上げる)
local LIP_HYSTERESIS = 0.6    -- フレーム切替に必要な最小差(細かい震え・ちらつき防止)

-- 母音が変わるとき(例: あ→い)、2つの口の絵を重ねてフェードするのではなく、
-- 「今の母音を一度閉じる → 閉じきった瞬間に次の母音へ切り替える → 新しい母音で開く」
-- という2枚の絵が同時に見えない遷移にする。二重露光にならず自然に見える。
local VOWEL_TRANSITION_TIME = 0.07  -- 閉じきるまでの時間(秒)。短いほど機敏、長いほど「間」が目立つ
-- 閉じきった状態で旧→新母音を入れ替える瞬間だけ、短くクロスフェードする。
-- 両方とも閉じ口なので重なっても違和感が出にくい程度の短さにしておく。
local VOWEL_CROSSFADE_TIME = 0.05

-- 母音の自動選択(ヤチヨ WebYachiyo.lua の pickSingVowel と同じ仕組み)。
-- 音量そのものから母音を「当てる」ことはできないので、音量の大小で口の傾向を変える:
--   大きい音 → 開いた口(あ/お/え) / 小さい音 → 狭い口(い/う/え) をランダムに選び、
--   音量が大きいほど短い間隔で切り替えて、速くパクパク喋っているように見せる。
local VOWEL_A, VOWEL_I, VOWEL_U, VOWEL_E, VOWEL_O = 1, 2, 3, 4, 5
local AUTO_VOWEL      = true   -- false にすると mouthVowel(外部指定)をそのまま使う
local VOWEL_LOUD      = 0.35   -- この音量を超えたら「開いた口」グループを使う
local VOWEL_DUR_MAX   = 0.34   -- 口の切り替え間隔(静かなとき=ゆっくり)
local VOWEL_DUR_MIN   = 0.18   -- 口の切り替え間隔(大きいとき=速い)

-- まばたき。blinks は 001(開き) 〜 008(閉じ切り) の8コマ。
local BLINK_FRAMES = 8
local BLINK_CLOSE  = 0.09     -- 001 → 008 に閉じる時間(秒)
local BLINK_HOLD   = 0.05     -- 008(閉じ切り)を保つ時間(秒)
local BLINK_OPEN   = 0.13     -- 008 → 001 に開く時間(秒)
local BLINK_TOTAL  = BLINK_CLOSE + BLINK_HOLD + BLINK_OPEN
local BLINK_MIN    = 2.5      -- 次のまばたきまでの最短間隔(秒)
local BLINK_MAX    = 6.5      -- 次のまばたきまでの最長間隔(秒)

--==========================================================================
-- ヘルパー
--==========================================================================

-- 次のまばたきまでの待ち時間をランダムに決める
local function nextBlinkInterval(): number
    return BLINK_MIN + math.random() * (BLINK_MAX - BLINK_MIN)
end

-- まばたき経過時間 t から「閉じ具合」を返す (0=開き / 1=閉じ切り)
local function blinkCloseAmount(t: number): number
    if t < BLINK_CLOSE then
        return t / BLINK_CLOSE
    elseif t < BLINK_CLOSE + BLINK_HOLD then
        return 1.0
    elseif t < BLINK_TOTAL then
        return 1.0 - (t - BLINK_CLOSE - BLINK_HOLD) / BLINK_OPEN
    end
    return 0.0
end

-- 閉じ具合 (0〜1) を blinks のコマ番号 (1〜8) に変換する。
-- 0 → 001(開き) / 1 → 008(閉じ切り)。閉じるときは 1→8、開くときは 8→1 と自然に逆再生される。
local function blinkFrameIndex(amount: number): number
    local frame = math.floor(1.0 + amount * (BLINK_FRAMES - 1) + 0.5)
    return math.clamp(frame, 1, BLINK_FRAMES)
end

-- カーソルの、追従中心からの向き(単位ベクトル)と距離を返す
local function cursorVector(mx: number, my: number): (number, number, number)
    local dx = mx - EYE_CENTER_X
    local dy = my - EYE_CENTER_Y
    local dist = math.sqrt(dx * dx + dy * dy)
    if dist < 0.001 then return 0.0, 0.0, 0.0 end
    return dx / dist, dy / dist, dist
end

--==========================================================================
-- ① 呼吸
--==========================================================================
local function updateBreathing(self: CharacterAnimation, seconds: number): number
    self.breathTime += seconds
    -- 正弦波: 上方向(-Y)がピーク
    local breathY = -math.sin(self.breathTime * math.tau * BREATH_SPEED) * BREATH_AMP
    -- 頭の Y は ② の振り向き成分と合算するので、ここでは体側だけ書き込む
    if self.vmBackHairY then self.vmBackHairY.value = BASE_BHAIR_Y   + breathY * 0.6 end
    if self.vmNeckY     then self.vmNeckY.value     = BASE_NECK_Y    + breathY       end
    if self.vmTopwearY  then self.vmTopwearY.value  = BASE_TOPWEAR_Y + breathY       end
    -- eri(襟)は topwear と同じ服なので、topwear とまったく同じ量だけ動かす
    if self.vmEriY      then self.vmEriY.value      = BASE_ERI_Y     + breathY       end
    if self.vmWingY     then self.vmWingY.value     = BASE_WING_Y    + breathY       end
    if self.vmTailY     then self.vmTailY.value     = BASE_TAIL_Y    + breathY       end
    -- face 画像は頭ごと動くので自身は動かさない(既定値に飛ばないよう基準値を保持)
    if self.vmFaceY     then self.vmFaceY.value     = BASE_FACE_Y                    end
    return breathY
end

--==========================================================================
-- ②-a カーソル追従(近距離): 目だけを動かす
--==========================================================================
local function updateEyeFollow(self: CharacterAnimation, seconds: number)
    local ux, uy, dist = cursorVector(self.mouseX, self.mouseY)
    -- 中心から EYE_REACH までで追従量が 0→1 に上がりきる
    local reach = math.min(dist / EYE_REACH, 1.0)
    local targetX = ux * reach * EYE_MAX_OFFSET_X
    -- uy < 0 はカーソルが中心より上(Yは下が正) → 上方向の可動域を使う
    local yRange = if uy < 0 then EYE_MAX_OFFSET_Y_UP else EYE_MAX_OFFSET_Y_DOWN
    local targetY = uy * reach * yRange

    -- 目標オフセットへ滑らかに補間 (フレームレート非依存)
    local a = math.min(EYE_LERP_SPEED * seconds, 1.0)
    self.eyeOffsetX += (targetX - self.eyeOffsetX) * a
    self.eyeOffsetY += (targetY - self.eyeOffsetY) * a
    local ox, oy = self.eyeOffsetX, self.eyeOffsetY

    -- パーツごとに追従量を変えて奥行き感を出す(虹彩が最も動く)
    if self.vmIrisRX     then self.vmIrisRX.value     = IRIS_RX + ox        end
    if self.vmIrisRY     then self.vmIrisRY.value     = IRIS_RY + oy        end
    if self.vmIrisLX     then self.vmIrisLX.value     = IRIS_LX + ox        end
    if self.vmIrisLY     then self.vmIrisLY.value     = IRIS_LY + oy        end
    if self.vmEyelashRX  then self.vmEyelashRX.value  = LASH_RX + ox * 0.6  end
    if self.vmEyelashRY  then self.vmEyelashRY.value  = LASH_RY + oy * 0.4  end
    if self.vmEyelashLX  then self.vmEyelashLX.value  = LASH_LX + ox * 0.6  end
    if self.vmEyelashLY  then self.vmEyelashLY.value  = LASH_LY + oy * 0.4  end
    if self.vmEyewhiteRX then self.vmEyewhiteRX.value = WHIT_RX + ox * 0.2  end
    if self.vmEyewhiteRY then self.vmEyewhiteRY.value = WHIT_RY + oy * 0.2  end
    if self.vmEyewhiteLX then self.vmEyewhiteLX.value = WHIT_LX + ox * 0.2  end
    if self.vmEyewhiteLY then self.vmEyewhiteLY.value = WHIT_LY + oy * 0.2  end
    if self.vmEyebrowRX  then self.vmEyebrowRX.value  = BROW_RX + ox * 0.15 end
    if self.vmEyebrowRY  then self.vmEyebrowRY.value  = BROW_RY + oy * 0.1  end
    if self.vmEyebrowLX  then self.vmEyebrowLX.value  = BROW_LX + ox * 0.15 end
    if self.vmEyebrowLY  then self.vmEyebrowLY.value  = BROW_LY + oy * 0.1  end
end

--==========================================================================
-- ②-b カーソル追従(遠距離): 頭・体も一緒に振り向く(深度パララックス)
--==========================================================================
local function updateBodyFollow(self: CharacterAnimation, seconds: number, breathY: number)
    local ux, uy, dist = cursorVector(self.mouseX, self.mouseY)
    -- 目は EYE_REACH までで最大(②-a)。ここではそれを超えた分で「振り向き」を立ち上げる。
    -- これが「中心付近は目だけ / 一定範囲を超えたら体も動く」の要。
    local turnFrac = math.clamp((dist - EYE_REACH) / (TURN_REACH - EYE_REACH), 0.0, 1.0)

    local a = math.min(EYE_LERP_SPEED * seconds, 1.0)
    self.turnX += (ux * turnFrac - self.turnX) * a
    self.turnY += (uy * turnFrac - self.turnY) * a
    local hx, hy = self.turnX, self.turnY

    -- 中景: 頭グループ全体。縦は呼吸と合算する
    if self.vmHeadX     then self.vmHeadX.value     = BASE_HEAD_X  + hx * HEAD_X            end
    if self.vmHeadY     then self.vmHeadY.value     = BASE_HEAD_Y  + breathY + hy * HEAD_Y  end
    -- 前景: 頭の移動に上乗せ(前方ほど大きく → 奥行き)
    if self.vmNoseX     then self.vmNoseX.value     = BASE_NOSE_X  + hx * NOSE_X            end
    if self.vmNoseY     then self.vmNoseY.value     = BASE_NOSE_Y  + hy * NOSE_Y            end
    if self.vmMouthX    then self.vmMouthX.value    = BASE_MOUTH_X + hx * MOUTH_X           end
    if self.vmMouthY    then self.vmMouthY.value    = BASE_MOUTH_Y + hy * MOUTH_Y           end
    if self.vmHairX     then self.vmHairX.value     = BASE_HAIR_X  + hx * HAIR_X            end
    if self.vmHairY     then self.vmHairY.value     = BASE_HAIR_Y  + hy * HAIR_Y            end
    -- 獣耳: hairs グループの子なので、親(前髪と共有)の移動分を引いて完全に切り離す。
    -- headear のワールド移動 = hairs の移動 + 自身のローカル値 なので、
    -- ローカルに (HEADEAR - HAIR) を入れると差し引きで純粋に hx * HEADEAR_X だけ動く。
    if self.vmHeadearX  then self.vmHeadearX.value  = BASE_HEADEAR_X + hx * (HEADEAR_X - HAIR_X) end
    if self.vmHeadearY  then self.vmHeadearY.value  = BASE_HEADEAR_Y + hy * (HEADEAR_Y - HAIR_Y) end
    -- 背景: 後ろ髪は逆方向に少し(振り向きで見えてくる)
    if self.vmBackHairX then self.vmBackHairX.value = BASE_BHAIR_X + hx * BHAIR_X           end
    -- 体・首: 頭の振り向きにつられて傾く
    if self.vmBodyX     then self.vmBodyX.value     = BASE_BODY_X  + hx * BODY_X            end
    if self.vmNeckX     then self.vmNeckX.value     = BASE_NECK_X  + hx * NECK_X            end
end

--==========================================================================
-- ②-c 髪(サイドロック)の慣性揺れ(Live2D 風の振り子物理)
--==========================================================================
-- 入力は頭の振り向き「速度」だけ。角度そのものではなく速度で駆動するので、
-- 素早く振り向けば大きく振れ、ゆっくり動かせばほとんど揺れない(実際の髪と同じ挙動)。
--
-- 各セグメントは減衰振動として解く:
--   加速度 = -親の角速度 × 慣性  -- 頭が動けば髪はその場に取り残される
--          - 自分の角度 × ばね   -- 静止角へ戻ろうとする
--          - 自分の角速度 × 減衰 -- 揺れが収まる
-- 子は「親の1フレーム前の角速度」を入力に取る(同じフレーム内で根本→毛先まで
-- 一気に伝わってしまうと、体が動いた瞬間に毛先まで同時に反応して見えてしまうため、
-- 1セグメントごとに必ず1フレーム分の遅れを作り、根本→先端へ確実に遅れて伝播させる)。
local function updateHairPhysics(self: CharacterAnimation, seconds: number)
    -- フレーム落ちで dt が跳ねると発散するので上限を設ける
    local dt = math.min(seconds, HAIR_MAX_STEP)
    if dt <= 0 then return end

    -- 頭の振り向き速度(turnX の時間微分)を求めて平滑化する
    local rawVel = math.clamp((self.turnX - self.prevTurnX) / dt * HEAD_VEL_SCALE, -HEAD_VEL_MAX, HEAD_VEL_MAX)
    self.prevTurnX = self.turnX
    self.headVelX += (rawVel - self.headVelX) * math.min(HEAD_VEL_SMOOTH * dt, 1.0)

    for i = 1, HAIR_COUNT do
        -- 慣性の入力源: 頭に直結(親=0)なら頭の速度(今フレーム)、そうでなければ
        -- 親セグメントの「前フレーム」の角速度(=最低でも1テンポ遅れて伝わる)
        local parent = HAIR_PARENT[i]
        local rawDrive = (if parent == 0 then self.headVelX else self.hairVelsPrev[parent]) * HAIR_DRIVE_SIGN[i]

        -- さらに、この入力を各セグメントごとの速さでなめらかに追いかけさせる。
        -- HAIR_DRIVE_SMOOTH が小さいほど反応が遅く、毛先ほど小さい値にしてあるので
        -- 「頭が動いてから毛先に伝わるまでの遅れ」が根本→毛先へ段階的に大きくなる。
        self.hairDriveSmooth[i] += (rawDrive - self.hairDriveSmooth[i]) * math.min(HAIR_DRIVE_SMOOTH[i] * dt, 1.0)
        local driveVel = self.hairDriveSmooth[i]

        local accel = -driveVel * HAIR_INERTIA[i]
            - self.hairAngles[i] * HAIR_STIFFNESS[i]
            - self.hairVels[i] * HAIR_DAMPING[i]
        local vel = self.hairVels[i] + accel * dt
        local angle = self.hairAngles[i] + vel * dt

        -- 可動域の端では跳ね返らせず速度を殺す(髪が暴れて見えないように)
        local limit = HAIR_MAX_ANGLE[i]
        if angle > limit then
            angle, vel = limit, 0.0
        elseif angle < -limit then
            angle, vel = -limit, 0.0
        end

        self.hairVels[i] = vel
        self.hairAngles[i] = angle
        local prop = self.vmHairRots[i]
        if prop then prop.value = HAIR_BASE_ROT[i] + angle end
    end

    -- 今フレームの角速度を「前フレーム値」として保存し、次フレームで子が参照する
    for i = 1, HAIR_COUNT do
        self.hairVelsPrev[i] = self.hairVels[i]
    end
end

--==========================================================================
-- ③ ランダムまばたき (blinks を 001→008→001 とコマ送り)
--==========================================================================
local function updateBlink(self: CharacterAnimation, seconds: number)
    if self.blinking then
        self.blinkT += seconds
        if self.blinkT >= BLINK_TOTAL then
            self.blinking = false
            self.blinkTimer = nextBlinkInterval()
        end
    else
        self.blinkTimer -= seconds
        if self.blinkTimer <= 0 then
            self.blinking = true
            self.blinkT = 0
        end
    end

    -- 通常時は default_eyes(瞳がカーソルを追う本体)を表示し、blinks は全部隠す。
    -- まばたき中だけ default_eyes を隠して、該当コマの blink 画像だけを表示する。
    local activeFrame = if self.blinking then blinkFrameIndex(blinkCloseAmount(self.blinkT)) else 0
    if self.vmEyesDefault then
        self.vmEyesDefault.value = if self.blinking then 0.0 else 1.0
    end
    for i = 1, BLINK_FRAMES do
        local prop = self.vmBlinkFrames[i]
        if prop then prop.value = if i == activeFrame then 1.0 else 0.0 end
    end
end

--==========================================================================
-- ④ リップシンク(音量ベース)
--==========================================================================
-- singAmplitude(0〜1) を入力とし、音量に応じて現在の母音フォルダの 001〜008 を切り替える。
-- ・エンベロープ(アタック速/リリース遅)で平滑化 → 口が細かく震えない
-- ・ヒステリシス(LIP_ON/LIP_OFF)で無音判定 → 無音では 001(完全に閉じ)で静止
-- ・フレーム切替にも不感帯(LIP_HYSTERESIS) → 境界値でのちらつき防止
-- ・母音(mouthVowel 1〜5)は外部から切替可能。全母音で同じ処理を共有する
-- ・母音が切り替わる瞬間は updateVowelTransition が間に入り、一度閉じてから切り替える

-- 現在の音量(0〜1)を返す。テスト音声を再生中はそちらを優先し、それ以外は
-- singAmplitude(本番: 外部が書き込む)を使う。呼び出し側はどちらが音源かを意識しなくてよい。
local function currentRawAmplitude(self: CharacterAnimation): number
    if self.testAudioPlaying and self.testAudioSound then
        if self.testAudioSound:completed() then
            self.testAudioPlaying = false
            return 0.0
        end
        local t = self.testAudioSound:time()
        local idx = math.clamp(math.floor(t / TEST_AUDIO_WINDOW) + 1, 1, #TEST_AUDIO_ENVELOPE)
        return TEST_AUDIO_ENVELOPE[idx]
    end
    if self.vmSingAmp then return math.clamp(self.vmSingAmp.value, 0.0, 1.0) end
    return 0.0
end

-- 音量から「今のフレーム(1〜8)」を更新する。母音が何であっても同じロジックで動く。
local function updateFrameFromVolume(self: CharacterAnimation, seconds: number)
    -- 音量を読み、エンベロープで平滑化(上がるときは俊敏に、下がるときはゆっくり)
    local raw = currentRawAmplitude(self)
    local rate = if raw > self.lipEnv then LIP_ATTACK else LIP_RELEASE
    self.lipEnv += (raw - self.lipEnv) * math.min(rate * seconds, 1.0)

    -- 発話中かどうか(ヒステリシスで小さなノイズによる開閉を防ぐ)
    if self.lipSpeaking then
        if self.lipEnv < LIP_OFF then self.lipSpeaking = false end
    else
        if self.lipEnv > LIP_ON then self.lipSpeaking = true end
    end

    -- 音量 → 口の開き具合(0〜1) → フレーム位置(1〜8 の連続値)
    local targetFrame = 1
    if self.lipSpeaking then
        local openAmt = math.clamp((self.lipEnv * LIP_GAIN) ^ LIP_CURVE, 0.0, 1.0)
        local pos = 1.0 + openAmt * (LIP_FRAMES - 1)
        -- 現在フレームから LIP_HYSTERESIS 以上離れたときだけ切り替える(ちらつき防止)
        if math.abs(pos - self.lipFrame) >= LIP_HYSTERESIS then
            targetFrame = math.clamp(math.floor(pos + 0.5), 1, LIP_FRAMES)
        else
            targetFrame = self.lipFrame
        end
    end
    self.lipFrame = targetFrame
end

-- 音量から母音を1つ選ぶ(ヤチヨ pickSingVowel と同じ考え方)。
-- 音量が大きいときは口を大きく開ける母音、小さいときは狭い母音の中からランダムに選ぶ。
-- 「え」は両方に入れてあり、大小どちらでも自然につながる中間の口として機能する。
local function pickVowelByVolume(amp: number): number
    if amp > VOWEL_LOUD then
        return ({VOWEL_A, VOWEL_O, VOWEL_E})[math.random(3)]
    end
    return ({VOWEL_I, VOWEL_U, VOWEL_E})[math.random(3)]
end

-- 発話中、一定間隔で母音を切り替える。音量が大きいほど間隔が短くなり速くパクパクする。
-- 無音になったらタイマーをリセットし、次に喋り出したとき即座に口が動き出すようにする。
local function updateAutoVowel(self: CharacterAnimation, seconds: number)
    if not self.lipSpeaking then
        self.vowelTimer = 0
        return
    end
    self.vowelTimer -= seconds
    if self.vowelTimer <= 0 then
        self.autoVowel = pickVowelByVolume(self.lipEnv)
        -- 音量 0→1 で間隔が MAX→MIN に縮む
        self.vowelTimer = VOWEL_DUR_MAX
            - (VOWEL_DUR_MAX - VOWEL_DUR_MIN) * math.min(self.lipEnv, 1.0)
    end
end

-- 母音の切り替えを管理し、実際に表示すべきフレームを返す。3段階で進む:
-- ①閉じる: 今表示中の母音のまま、frame を 1(閉じ切り)へイージング
-- ②入れ替え: 閉じきった状態で、旧→新母音を短時間だけクロスフェードする
--   (両方とも閉じ口なので、重なって見えてもほとんど気にならない)
-- ③確定: activeVowel を新母音にして通常の音量駆動へ戻る
-- 遷移も入れ替えも起きていなければ、音量ベースの lipFrame をそのまま返す。
local function updateVowelTransition(self: CharacterAnimation, seconds: number, requestedVowel: number): number
    if self.vowelCrossfading then
        self.vowelCrossfadeT += seconds
        if self.vowelCrossfadeT >= VOWEL_CROSSFADE_TIME then
            self.activeVowel = self.vowelFadeTo
            self.vowelCrossfading = false
        end
        return 1  -- クロスフェード中は両方とも閉じ口(フレーム1)のまま
    end

    if not self.vowelTransitioning then
        if requestedVowel ~= self.activeVowel then
            -- 母音の変更を検知。今のフレームから閉じ側への遷移を開始する
            self.vowelTransitioning = true
            self.vowelTransT = 0
            self.vowelTransStartFrame = self.lipFrame
        else
            return self.lipFrame
        end
    end

    self.vowelTransT += seconds
    local t = math.min(self.vowelTransT / VOWEL_TRANSITION_TIME, 1.0)
    -- 開始フレームから 1(閉じ切り)へなめらかに近づける
    local eased = self.vowelTransStartFrame + (1.0 - self.vowelTransStartFrame) * t
    local displayFrame = math.clamp(math.floor(eased + 0.5), 1, LIP_FRAMES)

    if t >= 1.0 then
        -- 閉じきった。ここから旧→新母音の短いクロスフェードに入る。
        -- 遷移中に要求母音がさらに変わっていても、ここで最新の要求を採用する。
        self.vowelTransitioning = false
        self.vowelCrossfading = true
        self.vowelCrossfadeT = 0
        self.vowelFadeFrom = self.activeVowel
        self.vowelFadeTo = requestedVowel
        self.lipFrame = 1
        displayFrame = 1
    end
    return displayFrame
end

-- 母音フォルダの不透明度を反映する。クロスフェード中は旧→新をブレンドし、
-- それ以外のときは表示中の母音(activeVowel)だけを 1 にする。
local function applyMouthShapes(self: CharacterAnimation)
    if self.vowelCrossfading then
        local ft = math.clamp(self.vowelCrossfadeT / VOWEL_CROSSFADE_TIME, 0.0, 1.0)
        for v = 1, 5 do
            local prop = self.vmMouthShapes[v]
            if prop then
                local o = 0.0
                if v == self.vowelFadeFrom then o = math.max(o, 1.0 - ft) end
                if v == self.vowelFadeTo   then o = math.max(o, ft) end
                prop.value = o
            end
        end
    else
        for v = 1, 5 do
            local prop = self.vmMouthShapes[v]
            if prop then prop.value = if v == self.activeVowel then 1.0 else 0.0 end
        end
    end
end

local function updateLipSync(self: CharacterAnimation, seconds: number)
    updateFrameFromVolume(self, seconds)

    updateAutoVowel(self, seconds)

    -- 使う母音を決める(1=a 2=i 3=u 4=e 5=o)。
    -- AUTO_VOWEL のときは音量から自動選択、そうでなければ mouthVowel(外部指定)に従う。
    local requestedVowel
    if AUTO_VOWEL then
        requestedVowel = self.autoVowel
    else
        requestedVowel = if self.vmMouthVowel then math.floor(self.vmMouthVowel.value + 0.5) else VOWEL_A
    end
    if requestedVowel < 1 or requestedVowel > 5 then requestedVowel = VOWEL_A end

    local displayFrame = updateVowelTransition(self, seconds, requestedVowel)

    -- 反映: 母音フォルダ(通常時は単独表示、切り替え瞬間だけクロスフェード)と
    -- 共有フレーム(001〜008)を書き込む
    if self.vmMouthDefault then self.vmMouthDefault.value = 0.0 end
    applyMouthShapes(self)
    for f = 1, LIP_FRAMES do
        local prop = self.vmMouthFrames[f]
        if prop then prop.value = if f == displayFrame then 1.0 else 0.0 end
    end
end

--==========================================================================
-- ライフサイクル
--==========================================================================

function init(self: CharacterAnimation, context: Context): boolean
    local vm = context:viewModel()
    if not vm then
        print("[CharacterAnimation:かぐや] ViewModelなし")
        return false
    end
    self.vmIrisRX     = vm:getNumber("irisRX")
    self.vmIrisRY     = vm:getNumber("irisRY")
    self.vmIrisLX     = vm:getNumber("irisLX")
    self.vmIrisLY     = vm:getNumber("irisLY")
    self.vmEyelashRX  = vm:getNumber("eyelashRX")
    self.vmEyelashRY  = vm:getNumber("eyelashRY")
    self.vmEyelashLX  = vm:getNumber("eyelashLX")
    self.vmEyelashLY  = vm:getNumber("eyelashLY")
    self.vmEyewhiteRX = vm:getNumber("eyewhiteRX")
    self.vmEyewhiteRY = vm:getNumber("eyewhiteRY")
    self.vmEyewhiteLX = vm:getNumber("eyewhiteLX")
    self.vmEyewhiteLY = vm:getNumber("eyewhiteLY")
    self.vmEyebrowRX  = vm:getNumber("eyebrowRX")
    self.vmEyebrowRY  = vm:getNumber("eyebrowRY")
    self.vmEyebrowLX  = vm:getNumber("eyebrowLX")
    self.vmEyebrowLY  = vm:getNumber("eyebrowLY")
    self.vmHeadX      = vm:getNumber("headX")
    self.vmHeadY      = vm:getNumber("headY")
    self.vmBodyX      = vm:getNumber("bodyX")
    self.vmBackHairX  = vm:getNumber("backHairX")
    self.vmBackHairY  = vm:getNumber("backHairY")
    self.vmNeckX      = vm:getNumber("neckX")
    self.vmNeckY      = vm:getNumber("neckY")
    self.vmTopwearY   = vm:getNumber("topwearY")
    self.vmNoseX      = vm:getNumber("noseX")
    self.vmNoseY      = vm:getNumber("noseY")
    self.vmMouthX     = vm:getNumber("mouthX")
    self.vmMouthY     = vm:getNumber("mouthY")
    self.vmHairX      = vm:getNumber("hairX")
    self.vmHairY      = vm:getNumber("hairY")
    self.vmHeadearX   = vm:getNumber("headearX")
    self.vmHeadearY   = vm:getNumber("headearY")
    self.vmEriY       = vm:getNumber("eriY")
    self.vmWingY      = vm:getNumber("wingY")
    self.vmTailY      = vm:getNumber("tailY")
    self.vmFaceY      = vm:getNumber("faceY")
    self.vmHairRots = {
        vm:getNumber("rightA1Rot"), vm:getNumber("rightA2Rot"), vm:getNumber("rightA3Rot"), vm:getNumber("rightA4Rot"),
        vm:getNumber("rightB1Rot"), vm:getNumber("rightB2Rot"), vm:getNumber("rightB3Rot"), vm:getNumber("rightB4Rot"),
        vm:getNumber("leftA1Rot"), vm:getNumber("leftA2Rot"), vm:getNumber("leftA3Rot"), vm:getNumber("leftA4Rot"),
        vm:getNumber("leftB1Rot"), vm:getNumber("leftB2Rot"), vm:getNumber("leftB3Rot"), vm:getNumber("leftB4Rot"),
        vm:getNumber("bangsTipRot"),
        vm:getNumber("backRight1Rot"), vm:getNumber("backRight2Rot"), vm:getNumber("backRight3Rot"), vm:getNumber("backRight4Rot"),
        vm:getNumber("backLeft1Rot"), vm:getNumber("backLeft2Rot"), vm:getNumber("backLeft3Rot"), vm:getNumber("backLeft4Rot"),
        vm:getNumber("backCenter1Rot"), vm:getNumber("backCenter2Rot"), vm:getNumber("backCenter3Rot"), vm:getNumber("backCenter4Rot"),
        vm:getNumber("rightEar1Rot"), vm:getNumber("rightEar2Rot"), vm:getNumber("rightEar3Rot"), vm:getNumber("rightEar4Rot"),
        vm:getNumber("leftEar1Rot"), vm:getNumber("leftEar2Rot"), vm:getNumber("leftEar3Rot"), vm:getNumber("leftEar4Rot"),
    }
    self.vmEyesDefault = vm:getNumber("eyesDefault")
    self.vmBlinkFrames = {
        vm:getNumber("blinkF1"), vm:getNumber("blinkF2"),
        vm:getNumber("blinkF3"), vm:getNumber("blinkF4"),
        vm:getNumber("blinkF5"), vm:getNumber("blinkF6"),
        vm:getNumber("blinkF7"), vm:getNumber("blinkF8"),
    }
    self.vmSingAmp     = vm:getNumber("singAmplitude")
    self.vmMouthVowel  = vm:getNumber("mouthVowel")
    self.vmMouthShapes = {
        vm:getNumber("mouthShapeA"), vm:getNumber("mouthShapeI"),
        vm:getNumber("mouthShapeU"), vm:getNumber("mouthShapeE"),
        vm:getNumber("mouthShapeO"),
    }
    self.vmMouthFrames = {
        vm:getNumber("mouthF1"), vm:getNumber("mouthF2"),
        vm:getNumber("mouthF3"), vm:getNumber("mouthF4"),
        vm:getNumber("mouthF5"), vm:getNumber("mouthF6"),
        vm:getNumber("mouthF7"), vm:getNumber("mouthF8"),
    }
    self.vmMouthDefault = vm:getNumber("mouthDefault")

    -- カーソル初期値は追従中心に置き、起動直後の正面向きを維持する
    self.mouseX     = EYE_CENTER_X
    self.mouseY     = EYE_CENTER_Y
    self.breathTime = 0
    self.eyeOffsetX = 0
    self.eyeOffsetY = 0
    self.turnX      = 0
    self.turnY      = 0
    -- 髪は静止状態(基準角度・速度0)から始める
    self.prevTurnX  = 0
    self.headVelX   = 0
    self.hairAngles = {}
    self.hairVels   = {}
    self.hairVelsPrev = {}
    self.hairDriveSmooth = {}
    for i = 1, HAIR_COUNT do
        self.hairAngles[i] = 0
        self.hairVels[i]   = 0
        self.hairVelsPrev[i] = 0
        self.hairDriveSmooth[i] = 0
        local prop = self.vmHairRots[i]
        if prop then prop.value = HAIR_BASE_ROT[i] end
    end
    -- 目を開いた状態から始め、最初のまばたきまで待つ
    self.blinking   = false
    self.blinkT     = 0
    self.blinkTimer = nextBlinkInterval()
    if self.vmEyesDefault then self.vmEyesDefault.value = 1.0 end
    for i = 1, BLINK_FRAMES do
        local prop = self.vmBlinkFrames[i]
        if prop then prop.value = 0.0 end
    end

    -- リップシンク初期状態: 無音・口閉じ(001)。母音の既定は a
    self.lipEnv      = 0
    self.lipFrame    = 1
    self.lipSpeaking = false
    if self.vmMouthVowel and self.vmMouthVowel.value < 1 then
        self.vmMouthVowel.value = 1  -- 未設定(0)なら a にしておく
    end
    self.autoVowel            = VOWEL_A
    self.vowelTimer           = 0
    self.activeVowel          = if self.vmMouthVowel then math.floor(self.vmMouthVowel.value + 0.5) else VOWEL_A
    self.vowelTransitioning   = false
    self.vowelTransT          = 0
    self.vowelTransStartFrame = 1
    self.vowelCrossfading     = false
    self.vowelCrossfadeT      = 0
    self.vowelFadeFrom        = self.activeVowel
    self.vowelFadeTo          = self.activeVowel

    -- テスト用: ダブルクリックでテスト音声を再生するための準備。
    -- アセットが Rive にまだインポートされていない場合は nil のまま(再生時に無視される)。
    self.testAudioSource  = context:audio(TEST_AUDIO_ASSET_NAME)
    self.testAudioSound   = nil
    self.testAudioPlaying = false
    self.lastClickAt      = -100
    if not self.testAudioSource then
        print("[かぐや:テスト] 音声アセットが見つかりません: " .. TEST_AUDIO_ASSET_NAME)
    end

    -- 当たり判定の矩形(ほぼ透明。アートボード全体を覆う)。
    -- 形は毎フレーム変わらないのでここで一度だけ組み立てる
    -- (Path は描画したフレーム中に reset してはいけない)。
    self.hitPaint.style = "fill"
    self.hitPaint.color = Color.rgba(0, 0, 0, 1)
    self.hitPath:moveTo(Vector.xy(0.0, 0.0))
    self.hitPath:lineTo(Vector.xy(ARTBOARD_W, 0.0))
    self.hitPath:lineTo(Vector.xy(ARTBOARD_W, ARTBOARD_H))
    self.hitPath:lineTo(Vector.xy(0.0, ARTBOARD_H))
    self.hitPath:close()

    print("[CharacterAnimation:かぐや] 初期化完了")
    return true
end

function advance(self: CharacterAnimation, seconds: number): boolean
    local breathY = updateBreathing(self, seconds)
    updateEyeFollow(self, seconds)
    updateBodyFollow(self, seconds, breathY)
    updateHairPhysics(self, seconds)
    updateBlink(self, seconds)
    updateLipSync(self, seconds)
    return true
end

function update(self: CharacterAnimation) end

-- アートボード全体を覆うほぼ透明な矩形。これが pointerMove の当たり判定になる。
-- パスは init() で組み立て済みなので、ここでは描くだけ。
function draw(self: CharacterAnimation, renderer: Renderer)
    renderer:drawPath(self.hitPath, self.hitPaint)
end

function pointerMove(self: CharacterAnimation, event: PointerEvent)
    self.mouseX = event.position.x
    self.mouseY = event.position.y
    event:hit()
end

-- テスト用: テスト音声を再生する。同じ音声を連打した場合は一度止めてから再生し直す。
local function playTestAudio(self: CharacterAnimation)
    if not self.testAudioSource then
        print("[かぐや:テスト] 音声アセットが無いため再生できません: " .. TEST_AUDIO_ASSET_NAME)
        return
    end
    if self.testAudioSound then self.testAudioSound:stop() end
    self.testAudioSound = Audio.play(self.testAudioSource)
    self.testAudioPlaying = self.testAudioSound ~= nil
end

-- 追従中心のキャリブレーション用。キャラの瞳の真上をクリックしたときの値が
-- EYE_CENTER_X/Y と一致していれば、視線は正しく中央を向く。
-- あわせて、ダブルクリックでテスト音声を再生する(breathTime を時計として使う)。
function pointerDown(self: CharacterAnimation, event: PointerEvent)
    if DEBUG_POINTER then
        print("[かぐや] pointer", event.position.x, event.position.y)
    end
    local now = self.breathTime
    if now - self.lastClickAt <= DOUBLE_CLICK_TIME then
        playTestAudio(self)
        self.lastClickAt = -100
    else
        self.lastClickAt = now
    end
    event:hit()
end

return function(): Node<CharacterAnimation>
    return {
        init = init,
        advance = advance,
        update = update,
        draw = draw,
        pointerMove = pointerMove,
        pointerDown = pointerDown,
        vmIrisRX = nil, vmIrisRY = nil,
        vmIrisLX = nil, vmIrisLY = nil,
        vmEyelashRX = nil, vmEyelashRY = nil,
        vmEyelashLX = nil, vmEyelashLY = nil,
        vmEyewhiteRX = nil, vmEyewhiteRY = nil,
        vmEyewhiteLX = nil, vmEyewhiteLY = nil,
        vmEyebrowRX = nil, vmEyebrowRY = nil,
        vmEyebrowLX = nil, vmEyebrowLY = nil,
        vmHeadX = nil, vmHeadY = nil,
        vmBodyX = nil,
        vmBackHairX = nil, vmBackHairY = nil,
        vmNeckX = nil, vmNeckY = nil,
        vmTopwearY = nil,
        vmNoseX = nil, vmNoseY = nil,
        vmMouthX = nil, vmMouthY = nil,
        vmHairX = nil, vmHairY = nil,
        vmHeadearX = nil, vmHeadearY = nil,
        vmEriY = nil,
        vmWingY = nil, vmTailY = nil,
        vmFaceY = nil,
        vmHairRots = {},
        vmEyesDefault = nil,
        vmBlinkFrames = {},
        vmSingAmp = nil, vmMouthVowel = nil,
        vmMouthShapes = {}, vmMouthFrames = {},
        vmMouthDefault = nil,
        mouseX = EYE_CENTER_X, mouseY = EYE_CENTER_Y,
        breathTime = 0,
        eyeOffsetX = 0, eyeOffsetY = 0,
        turnX = 0, turnY = 0,
        prevTurnX = 0, headVelX = 0,
        hairAngles = {}, hairVels = {}, hairVelsPrev = {}, hairDriveSmooth = {},
        blinking = false, blinkT = 0, blinkTimer = 0,
        lipEnv = 0, lipFrame = 1, lipSpeaking = false,
        autoVowel = 1, vowelTimer = 0,
        activeVowel = 1, vowelTransitioning = false,
        vowelTransT = 0, vowelTransStartFrame = 1,
        vowelCrossfading = false, vowelCrossfadeT = 0,
        vowelFadeFrom = 1, vowelFadeTo = 1,
        hitPath = Path.new(),
        hitPaint = Paint.new(),
        testAudioSource = nil, testAudioSound = nil,
        testAudioPlaying = false, lastClickAt = -100,
    }
end
