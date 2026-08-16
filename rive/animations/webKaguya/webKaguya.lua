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
--       ⑧ 頭の傾き(ロール)＋常時アイドル揺れ。映像(超かぐや姫)の「ゆらゆら」の主成分。
--          headRot(頭)・bodyRot(体)にばねで書き込み、傾き速度は髪・headearの揺れも駆動する。
--       ⑨ 発話に合わせた体の弾み(バウンス)。lipEnv(音量エンベロープ)または aiBounce を
--          目標にした弱減衰ばねで、喋ると体全体がぷるんと上下する。
--       ⑩ AI操作入力。aiActive=1 のとき、以下を外部(AI/React)が書き込むと体を操作できる:
--            aiTurnX/aiTurnY (-1〜1) 顔と視線の向き / aiTilt (-1〜1) 頭の傾き
--            aiBounce (0〜1) 体の弾み / aiNod (0→1 の立ち上がりで1回うなずく)
--          singAmplitude と併用すれば「喋りながら傾いて弾む」映像のような動きになる。
--       ⑪ 動作確認用: 頭のあたりをドラッグすると頭がついてきて(傾き＋振り向き)、
--          離すとばねで戻る。髪・headear が映像のように遅れて揺れるかを手で確かめられる。
--       ⑫ 後ろ髪の追従: back hair は head の子ではないので、頭の傾き(backHairRot)と
--          縦移動をスクリプトで明示的に追従させる。
--       ⑬ 髪の重力補償: 頭をどれだけ傾けても、前髪・後ろ髪・headear の毛先が
--          画面上で常に下を向くよう、各チェーンに -傾き を分配してばねの静止目標をずらす。
--       ⑭ 腕の横揺れ: topwear をメッシュ化して仕込んだ腕ボーン(左右とも 肩→肘 の2本)を、
--          ②-c と同じ振り子physicsで揺らす。体が動いたときだけ数度ぶん遅れて横に振れる。
--          腕は重い部位なので慣性を弱く・減衰を強く・可動域を数度に絞ってある。
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
    vmBackHairRot: Property<number>?,  -- 後ろ髪の回転。頭の傾きに追従させる
    vmNeckX: Property<number>?, vmNeckY: Property<number>?,
    vmNeckRot: Property<number>?,  -- 首の回転。頭の傾き(tiltDeg)に追従させ、あご下の隙間を防ぐ
    vmTopwearY: Property<number>?,
    vmWingY: Property<number>?, vmTailY: Property<number>?,  -- topwear と同じ服なので同じ量だけ動かす
    vmNoseX: Property<number>?, vmNoseY: Property<number>?,
    vmMouthX: Property<number>?, vmMouthY: Property<number>?,
    vmHairX: Property<number>?, vmHairY: Property<number>?,
    vmHeadearX: Property<number>?, vmHeadearY: Property<number>?,
    vmEriY: Property<number>?,
    vmFaceX: Property<number>?, vmFaceY: Property<number>?,  -- 使わないが基準値を保持するために書く
    vmBodyRootRot: Property<number>?,  -- 同上(topwear メッシュの胴体固定ボーン。⑭参照)
    vmHeadRot: Property<number>?, vmBodyRot: Property<number>?,  -- 頭・体の傾き(ロール、度)
    -- AI操作入力(aiActive=1 のとき有効。外部/React/AI が書き込む)
    vmAiActive: Property<number>?,
    vmAiTurnX: Property<number>?, vmAiTurnY: Property<number>?,
    vmAiTilt: Property<number>?, vmAiBounce: Property<number>?, vmAiNod: Property<number>?,
    -- 表情(笑顔)。smile > 0.5 の間、まばたき/リップシンクの自動更新を止めて
    -- blink_001(目)+ mouth_i(口)の見た目に固定する(⑯)
    vmSmile: Property<number>?,
    -- 髪(サイドロック)・獣耳・腕の慣性揺れ用。並びは HAIR_BASE_ROT と対応
    -- [1-4]=Right A1〜A4, [5-8]=Right B1〜B4, [9-12]=Left A1〜A4, [13-16]=Left B1〜B4,
    -- …[38-39]=Right Arm 1〜2, [40-41]=Left Arm 1〜2
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
    breathY: number,      -- 今フレームの呼吸オフセット(後ろ髪のY計算で使う)
    eyeOffsetX: number,
    eyeOffsetY: number,
    turnX: number,        -- 振り向き(横)のなめらかな値 (-1〜1)
    turnY: number,        -- 振り向き(縦)のなめらかな値 (-1〜1)
    -- 髪の慣性揺れ(Live2D 風の振り子物理)。詳細は updateHairPhysics を参照
    prevTurnX: number,    -- 前フレームの turnX(振り向き速度を差分で求めるため)
    prevTurnY: number,    -- 前フレームの turnY(縦の振り向き速度も髪の揺れの駆動に使う)
    headVelX: number,     -- 平滑化した頭の振り向き速度。これが髪を振らせる唯一の入力
    hairSpread: number,   -- 平滑化した「下からの風」の強さ(⑮)。左右へ広げる駆動に使う
    hairAngles: {number}, -- 各セグメントの静止角からの相対回転(度)
    hairVels: {number},   -- 各セグメントの角速度(度/秒)
    hairVelsPrev: {number}, -- 1フレーム前の角速度(子が親を追いかける遅延を作るために使う)
    hairDriveSmooth: {number}, -- 親からの入力を平滑化した値(毛先ほど強く遅らせるため)
    -- 頭の傾き・弾み・うなずきの内部状態
    tiltDeg: number,   -- 現在の頭の傾き(度)。ばねで目標へ追従する
    tiltVel: number,   -- 傾きの角速度(度/秒)。髪の揺れの駆動にも使う
    bounceY: number,   -- 体の弾みの現在オフセット(px、上が負)
    bounceVel: number, -- 弾みの速度(px/秒)。髪の揺れの駆動にも使う
    nodActive: boolean, nodT: number, nodY: number, nodVel: number, prevNodVal: number,
    -- 頭ドラッグ(動作確認用)
    grabbing: boolean,
    grabOriginX: number, grabOriginY: number,   -- つかんだ瞬間のカーソル位置
    grabStartTurnX: number, grabStartTurnY: number, -- つかんだ瞬間の振り向き量
    grabTurnX: number, grabTurnY: number, grabTilt: number, -- ドラッグ中の目標値
    blinking: boolean,
    blinkT: number,       -- まばたき開始からの経過秒
    blinkTimer: number,   -- 次のまばたきまでの残り秒
    -- 表情(笑顔、⑯)。0=普段の目/1=笑顔(閉じ目)。まばたきと同じ速さでここを近づける
    smileEyeAmt: number,
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
    -- ⑰ タバコ吸うモード
    -- コマ画像は185枚もあるため init() で一括ロードすると起動が遅くなる。
    -- 実際に表示する瞬間だけ context:image() で取得し、一度取得したコマは
    -- cigImages/puffImages にキャッシュして使い回す(遅延ロード)。
    scriptContext: Context?,  -- 遅延ロード用に init() の context を保持
    vmSmoking: Property<number>?,
    smokePhase: number,   -- 0=off / 1=吸う(タバコ表示) / 2=吐く(煙表示)
    smokeT: number,       -- 現在フェーズの経過秒
    cigAlpha: number,     -- タバコの不透明度(0〜1)。吐く/オフでフェードアウトさせる
    smokeBounceEase: number,  -- 吸う/吐くの上下イージング(0〜1)。bounceYを専用に上書きする
    cigImages: {Image?},   -- [1]=_a_frm0,70 〜 [26]=_a_frm25,70。未取得の間は nil
    puffImages: {Image?},  -- [1]=_a_frm1,40 〜 [159]=_a_frm159,40。未取得の間は nil
    smokeSampler: ImageSampler?,
    -- draw() でタバコ・煙を口元に置くために、advance() で計算した位置を持ち回る
    headPosX: number, headPosY: number,    -- head のアートボード座標
    mouthPosX: number, mouthPosY: number,  -- head 相対の口の位置
    puffOriginX: number, puffOriginY: number,  -- 煙: 吐き始めた瞬間の口の位置で固定(体の動きを追従しない)
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
local BASE_ERI_Y                 =  21.5  -- 元19.5。襟を2px上げた
local BASE_WING_Y                =   0.0   -- wing(topwear と同じ服なので同じ量だけ動かす)
local BASE_TAIL_Y                = 424.0   -- tail(同上)
local BASE_FACE_X, BASE_FACE_Y   =   4.5, -229.5
-- topwear メッシュの胴体固定ボーン(Body Root)の回転(度)。腕ボーンを揺らしたとき、
-- 胴体側の頂点まで腕に引っ張られないよう固定する役目なので、常にこの値を書き続ける。
-- (バインド済みプロパティは書かないと ViewModel インスタンスの保存値に飛ぶため。faceX/Y と同じ理由)
local BASE_BODY_ROOT_ROT         =  90.0

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
local HEAD_X,  HEAD_Y  = 22.0, 28.0  -- 頭グループ全体。縦(HEAD_Y)は元14.0→20.0からさらに拡大
                                     -- (つかんで上下したとき顔自体がもっと動くように)
-- 下を向く(hy>0)ときだけ、頭・鼻・口・前髪・獣耳・後ろ髪・首・体の縦移動量を
-- まとめて増幅する。参照映像は見下ろしたときの動きが見上げより大きかったため。
-- 見上げ(hy<0)側は変えない(1.0倍のまま)。
local DOWN_Y_BOOST     = 1.7
local NOSE_X,  NOSE_Y  = 11.0,  7.0  -- 鼻(最前面: 頭移動に上乗せ = 頭の50%)
local MOUTH_X, MOUTH_Y =  7.0,  4.0  -- 口(頭の約32%)
local HAIR_X,  HAIR_Y  = 10.0,  6.0  -- 前髪(頭の約45%)
local BHAIR_X          = -7.0        -- 後ろ髪(逆方向 → 振り向きで見えてくる)
local BODY_X           =  8.0        -- 体(頭につられて傾く)
-- 首(体に上乗せ)。参照映像では首だけが体と別に左右スライドすることはなく、
-- 体(BODY_X)と同じ量だけ動いて一体に見える。以前ここに独自の横移動量を
-- 足していたが、体との間でズレて「首だけ滑る」ように見えたため 0 にした。
local NECK_X           =  0.0
-- 体(topwear/eri/wing/tail)の縦追従。以前は呼吸・発話の弾みでしか上下せず、
-- 見上げ/見下ろし・うなずきで頭が上下しても体はついてこなかった
-- (「顔の動きに首しかついてきていない」の原因)。参照映像では顔が上がると
-- 体もついてくるので、頭の縦移動の一部を体にも足す。「もっと追従するように」との
-- 指定で BODY_X・BODY_TILT_RATIO と揃えて6割に引き上げた。元0.4。
local BODY_Y_FOLLOW    =  0.6
-- 首の縦追従。首は伸び縮みしない固定画像なので、見た目は「あごが首にどれだけ
-- 重なって隠すか」で決まる。
--   見上げ(あごが首から離れる)  → 首が追従しないと隙間が見えてしまうので、
--                                 しっかり追従させる(NECK_Y_FOLLOW_UP)。
--                                 ただし 1.0(頭と1:1)では首が上がりすぎて見えたため、
--                                 隙間が出ない範囲で 0.75 に落としてある。
--   見下ろし(あごが首に近づく) → あごが覆い隠すので首自体はほぼ動かなくていいが、
--                                 体(BODY_Y_FOLLOW)は動いているので、首だけ止めると
--                                 今度は体との間にズレが出る。下向きは BODY_Y_FOLLOW と
--                                 同じ値にして首と体を同期させる。
local NECK_Y_FOLLOW_UP   = 0.75
-- 獣耳(headear)。前髪ほど顔の動きに追従させず、後ろ髪と同じ量・同じ向き(逆方向)にする。
-- 頭グループの移動(22/14)には乗るので、実際の追従量は 22-7=15 と前髪(22+10=32)の半分弱になる。
local HEADEAR_X, HEADEAR_Y = -14.0, -4.0

--==========================================================================
-- 頭の傾き(ロール)・弾み・うなずき・頭ドラッグ(映像「超かぐや姫」の動きの再現)
--==========================================================================
-- 頭の傾き。映像(2:27-2:57)ではほぼ直立の瞬間がなく、リズミカルにゆらゆら
-- 傾き続ける。首(neckRot)の追従はあまり強くすると首が左右に振れすぎて見え、
-- 逆に弱すぎる(0など)と頭だけ傾いて首から分離して見えるので、
-- 頭の傾き自体も控えめにして両立させている。
local HEAD_TILT_MAX   = 7.0   -- aiTilt/ドラッグ = ±1 のときの頭の傾き(度)。元12.0
local TURN_TILT_DEG   = 2.5   -- 振り向き(turnX=±1)に連動して自然につく傾き(度)。元4.0
local BODY_TILT_RATIO = 0.35  -- 体は頭の何割傾くか(映像では体は頭より控えめに傾く)
-- 首の回転追従。首は body の子で回転を持たないため、頭だけ傾くとあご下に
-- 隙間が見える。neckRot に頭の傾きの一部を書いて首も傾けるが、大きく傾けると
-- 首が左右に振れすぎて見えるため控えめにしてきた(1.0→0.45→0.2→0.1→0.05)。
-- 0 まで下げたところ今度は首が全く追従せず、頭だけ傾いて首から分離して見える
-- ようになったため、最低限の追従を残す 0.3 に戻す。
local NECK_TILT_RATIO = 0.3
-- 首の回転量の上限(度)。実測: neck 画像は 192x255・回転ピボットは中心
-- (半分の高さ127.5pxが振れ幅の腕の長さ)。eri(襟)の横幅は実測で約120px
-- (中心から左右に約60px)。目標の振れ幅をさらに縮小し、襟の幅の約1/3
-- (中心から左右に約20px)を上限に asin(20/127.5)≈9度でクランプする。
local NECK_ROT_MAX_DEG = 9.0
-- 傾きのばね。減衰を臨界(2*sqrt(TILT_SPRING)≈12.6)より弱くして、
-- 目標を通り過ぎて「ゆらっ」と揺り戻すオーバーシュートを出す(映像の質感)。
local TILT_SPRING = 40.0
local TILT_DAMP   = 8.0
-- 常時アイドル揺れ。通常状態(ドラッグ/AI操作していないとき)は横揺れさせない
-- 指定のため 0 にしてある。振り向き連動(TURN_TILT_DEG)やドラッグ(HEAD_TILT_MAX)
-- による傾きはそのまま残る。
local IDLE_SWAY_DEG   = 0.0
local IDLE_SWAY_FREQ  = 0.22   -- 約4.5秒周期(DEGが0なので現在は無効)
local IDLE_SWAY_DEG2  = 0.0
local IDLE_SWAY_FREQ2 = 0.075  -- 約13秒周期(DEGが0なので現在は無効)
-- 喋っている間はアイドル揺れを増幅する(映像では発話中ほど大きくゆらゆらする)。
-- 揺れ幅 = idle * (1 + lipEnv * IDLE_SWAY_TALK_BOOST)。最大音量で約1.8倍。
local IDLE_SWAY_TALK_BOOST = 0.8
-- 発話バウンス。映像では喋りに合わせて体全体が小刻みに弾む。
-- 目標 = -(音量エンベロープ or aiBounce) * BOUNCE_AMP を弱減衰ばねで追う。
local BOUNCE_AMP    = 16.0  -- 音量=1のときの持ち上がり量(px)
local BOUNCE_SPRING = 90.0
local BOUNCE_DAMP   = 9.0
-- うなずき(aiNod が 0→1 に立ち上がると1回)。sin半波で下げて戻す。
local NOD_TIME = 0.45  -- 1回のうなずきにかける時間(秒)
local NOD_AMP  = 26.0  -- 頭の下がり量(px)
-- 頭ドラッグ(動作確認用)。頭の中心あたりをつかむとドラッグモードに入る。
-- event.position は EYE_CENTER_X/Y=(0,0) と同じ座標系(=目の中心が原点)。
-- 顔は目の中心からやや下(あご側)に広がるので、判定の中心を少し下にずらし、
-- 半径は顔+前髪がまるごと入るくらい広めにしておく(掴みやすさ優先)。
local GRAB_CENTER_X, GRAB_CENTER_Y = 0.0, 60.0
local GRAB_RADIUS     = 380.0  -- 当たり判定の半径(顔まわり全体をカバー)
local GRAB_RANGE      = 300.0  -- この距離ドラッグすると振り向き±1(最大)
local GRAB_TILT_RANGE = 260.0  -- この距離の横ドラッグで傾き±1(最大)
local GRAB_LERP_SPEED = 14.0   -- ドラッグ中の追従速度(通常より俊敏に手についてくる)
-- 傾き・弾み・縦の振り向きの速度を髪物理の駆動信号(headVelX 相当)へ混ぜる倍率。
-- これにより頭を傾けた/弾んだ/上下させたときも髪と headear が映像のように遅れて揺れる。
local TILT_HAIR_DRIVE   = 0.5
local BOUNCE_HAIR_DRIVE = 0.12
-- ⑮ 顔が縦に動いたときの髪・獣耳の反応。
-- 縦の動きは上の共通の揺れ(HAIR_DRIVE_SIGN、左右が同じ回転方向)には入れない。
-- 左右のボーンは鏡像配置なので、同じ回転方向へ振ると片側は外・もう片側は内へ動き、
-- 「左耳だけ外へ開く」といった左右ちぐはぐな見た目になってしまうため。
-- 代わりに左右逆向き(HAIR_SPREAD_SIGN)のこちらだけで表現する:
--   下向き = 下から風を受けて外へ「ファサッ」と広がる
--   上向き = 逆にほんの少し内側へ寄る
-- 広がりは下向きの速度に比例する。係数が大きいとすぐ上限に張り付いて速度差が
-- 出なくなるので、上限(HAIR_SPREAD_MAX)に達するのが「素早く下げたとき」だけに
-- なるよう調整してある。上限に達する速度 = MAX / DRIVE ≒ 15
-- (ドラッグ時の turnVelY は速いときで15前後。10.0 では4.0で飽和していた)
local HAIR_SPREAD_DRIVE  = 2.7   -- 下向き速度 → 広がりの強さ
local HAIR_SPREAD_MAX    = 40.0  -- 広がり駆動の上限(素早く下げても開きすぎないように)
local HAIR_SPREAD_SMOOTH = 10.0  -- 広がりの立ち上がり/収まりの速さ
-- 上向きの内寄せ。「ほんの少し」でよいので広がりより弱くするが、共通の揺れを
-- 抜いたぶんこれが縦の動きの唯一の駆動になるので、極端に小さくはしない。
-- 係数は下向き(HAIR_SPREAD_DRIVE)と同じく、上限に達する速度が ≒15 になるよう決める
-- (3.0 では速度4.0で飽和し、速度差がほぼ出ていなかった)。
local HAIR_GATHER_DRIVE  = 0.8   -- 上向き速度 → 内側へ寄る強さ
local HAIR_GATHER_MAX    = 12.0  -- 内寄せ駆動の上限
-- 後ろ髪の追従。back hair は head の子ではない(root 直下の別グループ)ので、
-- 頭の傾き・縦移動をスクリプトで明示的に追従させる。
-- 回転ピボットは back hair(954.8, 960.7)と head(959.5, 958)がほぼ同位置なので、
-- 同じ角度を書けば頭と一体に見える。
local BHAIR_TILT_RATIO = 1.0   -- 頭の傾きに対する後ろ髪の回転比
local BHAIR_Y_FOLLOW   = 0.8   -- 頭の縦移動(振り向き縦・うなずき)に対する追従比

--==========================================================================
-- ⑰ タバコ吸うモード のパラメータ
--==========================================================================
-- smoking > 0.5 の間、「吸う」→「吐く」を繰り返す。
--   フェーズ1「吸う」: 顔を少し左に傾け、口を「う」にして、口元にタバコを
--                      SMOKE_INHALE_TIME 秒ぶんループ再生する。
--   フェーズ2「吐く」: タバコを消し、口を「あ」にして、煙を1周だけ再生する。
-- コマ画像は PSD から取り込んだアセットを context:image() で直接読み、draw() の
-- renderer:drawImage() で描く。そのため ViewModel プロパティは smoking の1つで済む
-- (コマごとに不透明度プロパティを作ると 26+159=185 個必要になってしまう)。
-- [位置調整用] true にすると、口元追従・頭の傾きを無視してアートボード中央
-- (≒キャラ画像の真ん中、頭の位置とほぼ一致)にタバコ・煙を固定する。
-- ANCHOR/OFFSET/SCALE を調整し終えたら false に戻すこと。
local SMOKE_DEBUG_CENTER = false
local SMOKE_INHALE_TIME = 5.0   -- 「吸う」フェーズの長さ(秒)
local CIG_FRAME_COUNT   = 26
local CIG_FRAME_TIME    = 0.07  -- アセット名の ",70" = 1コマ 70ms
local PUFF_FRAME_COUNT  = 159
local PUFF_FRAME_TIME   = 0.04  -- アセット名の ",40" = 1コマ 40ms
-- 首の向き(-1〜1、②-bの振り向きと同じ値域)。正だと画面の左を向く(実測で確認済み)。
-- 体を傾ける(ロール)のではなく、通常のカーソル追従・AI操作と同じ「振り向き」を使う。
local SMOKE_TURN_X = 0.7
-- 口を開ききるまでの時間(秒)。パッと切り替わらないよう 1→目標コマへ送る。
local SMOKE_MOUTH_OPEN_TIME = 0.15
-- 吸っている間(う)の口の目標コマ(1〜8)。吐く(あ)は LIP_FRAMES(8、開ききり)固定。
local SMOKE_INHALE_MOUTH_FRAME = 7
-- 吸っている間、体を持ち上げておく強さ。1.0 で通常の発話バウンス最大(BOUNCE_AMP=16px)
-- と同じ、それ以上も指定可能。深呼吸のような大きな動きにするため大きめの値にしてある。
local SMOKE_BOUNCE_AMOUNT     = 1.8
-- 上げ下げの速さ(秒)。発話バウンスの速いばねとは別のゆっくりしたイージングを使う。
local SMOKE_BOUNCE_RISE_TIME = 3.0
local SMOKE_BOUNCE_FALL_TIME = 2.5
-- タバコの表示/非表示: 吸う=フェードイン(cigAlpha→1) / 吐く・オフ=フェードアウト(→0)。
-- CIG_FADE_TIME は 0↔1 の遷移にかける秒数。
local CIG_FADE_TIME = 0.35

-- 口元への合わせ込み。元スティッカーは 480x480 で、その座標系の ANCHOR 点が
-- キャラの口の中心に来るように描く。OFFSET はそこからのズラし(アートボード座標)。
-- 見ながら調整する用のパラメータ。
local CIG_SCALE     = 0.55
local CIG_ANCHOR_X  = 138.0   -- 回転の軸(画像左側)。CIG_CX(229)を挟んで元の320と対称の位置
local CIG_ANCHOR_Y  = 245.0
local CIG_OFFSET_X  = -964.0
local CIG_OFFSET_Y  = -790.0
-- 左右の振り向き(turnX)によるタバコの横移動量の倍率。
-- 1.0以外にすると振れ幅は変わるが、動く"速さ"も同じ倍率で変わってしまい
-- (turnXの変化速度をそのまま倍にするため)、口より速く/遅く動いて見える。
-- 速さのズレを避けるため 1.0(口と完全に同じ量・同じ速さ)固定にしてある。
local CIG_TURN_SCALE = 1.5

local PUFF_SCALE    = 15
local PUFF_ANCHOR_X = 170.0   -- 煙が出はじめる位置(1コマ目のあたり)
local PUFF_ANCHOR_Y = 330.0
local PUFF_OFFSET_X = -960.0
local PUFF_OFFSET_Y = -765.0

-- 各コマの「中心位置」(元スティッカー 480x480 座標系)の実測値。
-- GIF のフレームは余白を切り詰めてあるのでコマごとに中心がズレており、
-- この値どおりに置かないとパラパラ動画がガタつく。
local CIG_CX = 229.0  -- タバコは全コマ同じ
local CIG_CY: {number} = {
    196.5, 195.5, 222.5, 222.0, 223.0, 226.0, 225.5, 223.5, 223.0, 221.5,
    220.0, 218.5, 216.5, 215.5, 214.0, 213.0, 210.5, 207.5, 206.5, 205.0,
    204.5, 203.0, 201.5, 201.0, 200.0, 199.0,
}
local PUFF_CX: {number} = {
    170.5, 174.5, 173.0, 177.5, 179.0, 181.0, 182.5, 183.5, 185.0, 186.5,
    188.5, 190.0, 191.0, 192.5, 194.0, 195.0, 195.5, 197.5, 198.0, 199.5,
    200.0, 201.0, 201.5, 201.5, 202.5, 203.0, 204.0, 204.0, 205.0, 205.5,
    206.5, 206.5, 207.5, 208.0, 209.0, 210.0, 210.0, 211.0, 211.5, 212.0,
    213.0, 214.0, 214.0, 215.0, 216.0, 216.5, 217.5, 218.0, 219.0, 220.0,
    220.0, 220.5, 221.0, 221.5, 221.5, 222.5, 223.0, 223.5, 224.5, 224.5,
    226.0, 226.5, 227.0, 228.0, 228.5, 229.0, 229.5, 230.5, 231.0, 231.0,
    232.0, 232.5, 232.5, 233.5, 233.5, 234.5, 235.0, 235.0, 235.5, 236.5,
    236.5, 237.0, 238.0, 238.0, 238.5, 239.0, 239.0, 239.5, 239.0, 239.0,
    239.0, 239.0, 239.0, 239.5, 240.0, 240.0, 240.5, 240.5, 241.0, 241.0,
    241.5, 242.0, 242.0, 242.0, 243.0, 243.0, 243.0, 243.0, 243.5, 243.5,
    244.0, 244.0, 244.0, 244.0, 245.0, 245.0, 245.0, 245.5, 245.0, 245.5,
    245.0, 245.5, 245.0, 245.5, 245.5, 245.0, 245.0, 244.5, 245.0, 244.0,
    245.0, 244.5, 245.0, 244.5, 244.5, 244.0, 244.0, 244.0, 244.5, 244.0,
    244.0, 244.5, 244.5, 244.5, 245.0, 245.5, 244.5, 245.5, 245.0, 245.0,
    238.5, 238.5, 238.0, 216.0, 216.0, 151.5, 168.5, 169.0, 260.5,
}
local PUFF_CY: {number} = {
    323.5, 320.5, 321.5, 320.0, 317.5, 320.0, 317.5, 315.5, 314.0, 311.5,
    309.5, 308.0, 306.0, 304.5, 302.5, 301.5, 300.5, 299.5, 299.0, 298.0,
    297.5, 296.0, 295.5, 295.0, 294.0, 293.5, 292.5, 292.0, 291.0, 290.0,
    289.5, 288.5, 287.5, 286.5, 285.5, 284.5, 283.5, 283.0, 282.5, 281.5,
    280.5, 279.5, 279.0, 278.0, 277.0, 276.0, 275.0, 274.0, 273.5, 272.5,
    272.0, 271.0, 270.5, 270.0, 269.5, 268.5, 268.5, 267.5, 267.0, 266.5,
    266.5, 265.5, 264.5, 264.5, 264.0, 263.5, 264.0, 263.0, 262.0, 261.5,
    261.0, 261.0, 260.0, 259.5, 259.0, 258.5, 258.0, 257.5, 257.5, 257.5,
    257.5, 257.5, 257.0, 256.5, 255.5, 255.0, 254.5, 254.0, 253.5, 253.0,
    252.5, 251.5, 251.5, 251.0, 251.0, 250.0, 250.0, 249.5, 249.5, 248.5,
    248.5, 248.0, 247.5, 247.0, 247.0, 246.5, 246.5, 246.0, 246.0, 246.0,
    246.0, 245.5, 245.5, 245.5, 245.0, 245.0, 245.0, 244.5, 244.5, 244.5,
    244.0, 244.0, 244.0, 244.0, 243.5, 243.5, 243.5, 244.0, 244.0, 244.0,
    244.5, 244.0, 243.5, 244.0, 243.5, 243.0, 242.5, 242.5, 242.0, 242.0,
    241.5, 241.5, 241.0, 240.5, 240.5, 239.0, 234.5, 233.5, 233.0, 232.0,
    232.0, 231.5, 231.5, 231.0, 230.5, 152.0, 52.0, 51.0, 30.0,
}

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
--   [38-39] Right Arm 1〜2(腕・右。肩→肘。topwear のメッシュを変形させる)
--   [40-41] Left Arm 1〜2(腕・左)
-- 腕(⑭)も髪と同じ振り子physicsで揺らす。腕は体に付いた重い部位なので、髪より
-- 反応(慣性)を弱く・減衰を強く・可動域を狭くして「体が動くと少しだけ横に揺れる」程度にする。
local HAIR_COUNT = 41

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
    108.97040896189253,    -- [38] Right Arm 1 (肩)
      4.658949626925907,   -- [39] Right Arm 2 (肘)
     72.1107057096501,     -- [40] Left Arm 1 (肩)
     -3.912141204427345,   -- [41] Left Arm 2 (肘)
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
    0, 38,          -- [38-39] Right Arm 1→2(肩→肘)
    0, 40,          -- [40-41] Left Arm 1→2
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
    -- 腕は横向き(turnX)・傾き・弾みによる共通の揺れには反応させない(0)。
    -- 上下(見上げ/見下ろし)による開閉だけ HAIR_SPREAD_SIGN 側で別途動かす。
    0.5, 0.5,         -- [38-39] Right Arm
    0.5, 0.5,         -- [40-41] Left Arm
}

-- ⑮ 下からの風で「外向きに広がる」向きと強さ。左右で符号を逆にすることで、
-- 上の HAIR_DRIVE_SIGN(左右同じ向きに流れる揺れ)とは別に、左右へ開く動きになる。
-- ±1 が基準の強さで、駆動にそのまま掛かるので、小数にするとその部位だけ広がりが弱まる。
-- 中央にあるもの(前髪の毛先・後ろ髪中央)は開きようがないので 0。
-- 獣耳は髪と同じ強さで開くと大きく開きすぎるので、0.35 に落として控えめにしてある。
-- 腕(服のメッシュを変形させる)も髪より弱い 0.5 にしてある。
-- 実際に見て内側に閉じるようなら、+ と - を入れ替えれば反転する。
local HAIR_SPREAD_SIGN: {number} = {
    -1, -1, -1, -1,  -1, -1, -1, -1,  -- [1-8]   Right Locks A/B
     1,  1,  1,  1,   1,  1,  1,  1,  -- [9-16]  Left Locks A/B
     0,                               -- [17]    Bangs Tip(中央)
    -1, -1, -1, -1,                   -- [18-21] Right Back Locks
     1,  1,  1,  1,                   -- [22-25] Left Back Locks
     0,  0,  0,  0,                   -- [26-29] Center Back Locks(中央)
    -- 獣耳。ボーンの基準角が左右対称(鏡像)なので、符号も左右で逆にする。
    -- 以前ここを同符号にしていたのは、縦の動きが共通の揺れ側に入っていて
    -- そちらが支配的だったのを打ち消そうとしていたため。原因を直したので鏡像に戻す。
    -0.35, -0.35, -0.35, -0.35,       -- [30-33] Right Headear(控えめ)
     0.35,  0.35,  0.35,  0.35,       -- [34-37] Left Headear(控えめ)
    -- 腕は髪・獣耳と向きを逆にしてある: 上向き=開く / 下向き=内側に寄る。
    -- (髪・獣耳は下向き=開く / 上向き=内側なので、符号がちょうど逆になる)
    -- 腕ボーンも左右対称(鏡像)なので左右の符号はこれまで通り逆のまま。
    8, 8,                             -- [38-39] Right Arm
    -8, -8,                           -- [40-41] Left Arm
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
    272.1880532203731,   -- [38] Right Arm 1
    140.4806739154264,   -- [39] Right Arm 2
    267.1008746230037,   -- [40] Left Arm 1
    138.6165684290069,   -- [41] Left Arm 2
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
-- (先端のしなりが大きすぎたため、バネを 6/4 → 9/6.5 に強めて戻りを速くした)
HAIR_STIFFNESS[32] = 9    -- Right Headear 3
HAIR_STIFFNESS[33] = 6.5  -- Right Headear 4
HAIR_STIFFNESS[36] = 9    -- Left Headear 3
HAIR_STIFFNESS[37] = 6.5  -- Left Headear 4
-- 腕は長さ比例だと 272*0.2≈54 と極端に硬くなってしまうので、個別に指定する。
-- 髪より硬め(=すぐ元の位置に戻る)にして、揺れが尾を引かないようにする。
HAIR_STIFFNESS[38] = 30  -- Right Arm 1 (肩)
HAIR_STIFFNESS[39] = 22  -- Right Arm 2 (肘)
HAIR_STIFFNESS[40] = 28  -- Left Arm 1 (左右で微妙に変えて完全同期を避ける)
HAIR_STIFFNESS[41] = 20  -- Left Arm 2

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
table.insert(HAIR_DAMPING, 3.0)  -- [32] Right Headear 3 (位置3、先端寄り。元2でしなりすぎたため増やした)
table.insert(HAIR_INERTIA, 11)
table.insert(HAIR_DAMPING, 2.0)  -- [33] Right Headear 4 (位置4、先端。元1.3から増やしてしなりを抑制)
table.insert(HAIR_INERTIA, 11)
table.insert(HAIR_DAMPING, 6.5)  -- [34] Left Headear 1 (位置1、右より少し柔らかい)
table.insert(HAIR_INERTIA, 6.5)
table.insert(HAIR_DAMPING, 4.5)  -- [35] Left Headear 2 (位置2)
table.insert(HAIR_INERTIA, 7)
table.insert(HAIR_DAMPING, 2.8)  -- [36] Left Headear 3 (位置3、先端寄り。元1.8から増やした)
table.insert(HAIR_INERTIA, 10.5)
table.insert(HAIR_DAMPING, 1.9)  -- [37] Left Headear 4 (位置4、先端。元1.2から増やしてしなりを抑制)
table.insert(HAIR_INERTIA, 10.5)
-- 腕: 髪と違って重い部位なので、慣性(反応量)は髪の 1/3 程度・減衰は強めにして、
-- 体が動いたときに「ゆっくり少しだけ遅れてついてくる」動きにする。
table.insert(HAIR_DAMPING, 7)    -- [38] Right Arm 1 (肩)
table.insert(HAIR_INERTIA, 2.0)
table.insert(HAIR_DAMPING, 5)    -- [39] Right Arm 2 (肘。肩より少ししなる)
table.insert(HAIR_INERTIA, 2.2)
table.insert(HAIR_DAMPING, 6.5)  -- [40] Left Arm 1 (肩)
table.insert(HAIR_INERTIA, 1.9)
table.insert(HAIR_DAMPING, 4.6)  -- [41] Left Arm 2 (肘)
table.insert(HAIR_INERTIA, 2.1)

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
table.insert(HAIR_MAX_ANGLE, 26)       -- 元35。先端のしなりを抑えるため可動域を縮小
table.insert(HAIR_DRIVE_SMOOTH, 0.5)   -- [33] Right Headear 4 (位置4)
table.insert(HAIR_MAX_ANGLE, 31)       -- 元42。同上
table.insert(HAIR_DRIVE_SMOOTH, 2.7)   -- [34] Left Headear 1 (位置1)
table.insert(HAIR_MAX_ANGLE, 9)
table.insert(HAIR_DRIVE_SMOOTH, 1.0)   -- [35] Left Headear 2 (位置2)
table.insert(HAIR_MAX_ANGLE, 13)
table.insert(HAIR_DRIVE_SMOOTH, 1.0)   -- [36] Left Headear 3 (位置3)
table.insert(HAIR_MAX_ANGLE, 24)       -- 元32。先端のしなりを抑えるため可動域を縮小
table.insert(HAIR_DRIVE_SMOOTH, 0.45)  -- [37] Left Headear 4 (位置4)
table.insert(HAIR_MAX_ANGLE, 29)       -- 元40。同上
-- 腕: 「少しだけ横揺れ」にしたいので可動域を数度に絞る(髪は10〜40度)。
-- 肘は肩より一拍遅れて・少し大きく振れるようにする。
-- 腕の可動域。この上限は横振り・上下の広がりの区別なく最終的な角度に掛かるので、
-- 上げると横揺れまで大きくなってしまう。横揺れは元のままにしたいので元の値に戻した。
table.insert(HAIR_DRIVE_SMOOTH, 2.0)   -- [38] Right Arm 1 (肩)
table.insert(HAIR_MAX_ANGLE, 3.5)
table.insert(HAIR_DRIVE_SMOOTH, 0.9)   -- [39] Right Arm 2 (肘。遅れて効く)
table.insert(HAIR_MAX_ANGLE, 5.0)
table.insert(HAIR_DRIVE_SMOOTH, 1.9)   -- [40] Left Arm 1 (肩)
table.insert(HAIR_MAX_ANGLE, 3.2)
table.insert(HAIR_DRIVE_SMOOTH, 0.85)  -- [41] Left Arm 2 (肘)
table.insert(HAIR_MAX_ANGLE, 4.6)

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
    1.0, 1.0,                      -- Right Arm 1-2(同上。上の値をそのまま使いたいので補正なし)
    1.0, 1.0,                      -- Left Arm 1-2(同上)
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

-- 映像(超かぐや姫)に合わせた headear の追調整:
-- 映像では長い耳が根本からゆったり大きくスイングし、先端が遅れてしなってついてくる。
-- 位置2(根本の次)のバネを弱めて根本側からも曲がるようにし、可動域を広げる。
-- 根本の減衰も少し軽くして、頭が止まったあとの残揺れを長引かせる。
HAIR_STIFFNESS[31] = 10   -- Right Headear 2
HAIR_MAX_ANGLE[31] = 20
HAIR_STIFFNESS[35] = 10   -- Left Headear 2
HAIR_MAX_ANGLE[35] = 19
HAIR_DAMPING[30]   = 5.5  -- Right Headear 1 (根本)
HAIR_DAMPING[34]   = 5.0  -- Left Headear 1 (左右で微妙に変えて完全同期を避ける)

-- 重力補償: 頭(または後ろ髪)が傾いても、髪の毛先が画面上で常に下を向くようにする。
-- 各チェーンのボーンに親の傾き -θ を分配して打ち消す(合計で -θ になるよう根本ほど大きく)。
-- ボーンの回転は親から子へ累積するので、チェーン合計が -θ なら毛先のワールド回転は
-- 頭がどれだけ傾いても静止時と同じ(=毛先は下向きのまま)になる。
-- ばねの静止目標をこの角度へずらす方式なので、揺れの物理はそのまま生きる。
local function grav4(a: number, b: number, c: number, d: number): {number}
    return {a, b, c, d}
end
local HAIR_GRAV_FRAC: {number} = {}
do
    local sideFrac = grav4(0.40, 0.30, 0.20, 0.10)  -- サイドロック(合計1.0=完全補償)
    local backFrac = grav4(0.40, 0.30, 0.20, 0.10)  -- 後ろ髪(同上)
    local earFrac  = grav4(0.35, 0.30, 0.20, 0.15)  -- headear(同上。先端寄りにも少し残す)
    for c = 1, 4 do  -- [1-16] Right A/B, Left A/B
        for p = 1, 4 do table.insert(HAIR_GRAV_FRAC, sideFrac[p]) end
    end
    table.insert(HAIR_GRAV_FRAC, 0.25)  -- [17] Bangs Tip(前髪は短く頭に付くので部分補償)
    for c = 1, 3 do  -- [18-29] Right/Left/Center Back Locks
        for p = 1, 4 do table.insert(HAIR_GRAV_FRAC, backFrac[p]) end
    end
    for c = 1, 2 do  -- [30-37] Right/Left Headear
        for p = 1, 4 do table.insert(HAIR_GRAV_FRAC, earFrac[p]) end
    end
    -- [38-41] 腕は頭ではなく体(topwear)に付いていて、体と一緒に傾くのが自然
    -- (髪のように「毛先だけ下を向く」必要がない)ので、重力補償はしない。
    for i = 1, 4 do table.insert(HAIR_GRAV_FRAC, 0.0) end
end

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
    -- ⑰ 吸っている間(phase1)だけ呼吸を止め、吸う動作の弾み(⑨のSMOKE_BOUNCE_AMOUNT)だけで
    -- 上下させる。吐き終わって phase2 に入ったら通常の呼吸サイクルを再開する。
    local breathY = if self.smokePhase == 1 then 0.0 else -math.sin(self.breathTime * math.tau * BREATH_SPEED) * BREATH_AMP
    -- 発話バウンス(⑨)は呼吸と違い体全体が同じ量だけ弾むので、係数をかけずに全部へ足す
    local bounceY = self.bounceY
    -- topwear/eri/wing/tail・後ろ髪・首の Y は振り向き・うなずき成分も要るので
    -- updateBodyFollow で書く(BODY_Y_FOLLOW・NECK_Y_FOLLOW・BHAIR_Y_FOLLOW)
    self.breathY = breathY
    -- face 画像は頭ごと動くので自身は動かさない(バインド済みなので、書かないと
    -- ViewModelインスタンスの保存値に飛んでしまう。基準値を毎フレーム書いて固定する)
    if self.vmFaceX     then self.vmFaceX.value     = BASE_FACE_X                    end
    if self.vmFaceY     then self.vmFaceY.value     = BASE_FACE_Y                    end
    -- 胴体固定ボーンも同様に基準値で固定する(⑭。腕だけが揺れ、胴体は動かないようにする)
    if self.vmBodyRootRot then self.vmBodyRootRot.value = BASE_BODY_ROOT_ROT         end
    return breathY + bounceY
end

--==========================================================================
-- ②-a カーソル追従(近距離): 目だけを動かす
--==========================================================================
local function updateEyeFollow(self: CharacterAnimation, seconds: number)
    local targetX: number
    local targetY: number
    local aiOn = self.vmAiActive ~= nil and self.vmAiActive.value > 0.5
    if self.smokePhase == 1 and not self.grabbing then
        -- ⑰ タバコを咥えている間(吸う)だけカーソル/AI追従を止め、正面(オフセット0)へ戻す。
        -- 吐いている間(phase2)は通常通り追従してよい。
        targetX, targetY = 0.0, 0.0
    elseif aiOn and not self.grabbing then
        -- AI操作モード(⑩): aiTurnX/Y を視線の向きとして使う(カーソルは無視)
        local nx = math.clamp(if self.vmAiTurnX then self.vmAiTurnX.value else 0.0, -1.0, 1.0)
        local ny = math.clamp(if self.vmAiTurnY then self.vmAiTurnY.value else 0.0, -1.0, 1.0)
        targetX = nx * EYE_MAX_OFFSET_X
        local yRangeAi = if ny < 0 then EYE_MAX_OFFSET_Y_UP else EYE_MAX_OFFSET_Y_DOWN
        targetY = ny * yRangeAi
    else
        local ux, uy, dist = cursorVector(self.mouseX, self.mouseY)
        -- 中心から EYE_REACH までで追従量が 0→1 に上がりきる
        local reach = math.min(dist / EYE_REACH, 1.0)
        targetX = ux * reach * EYE_MAX_OFFSET_X
        -- uy < 0 はカーソルが中心より上(Yは下が正) → 上方向の可動域を使う
        local yRange = if uy < 0 then EYE_MAX_OFFSET_Y_UP else EYE_MAX_OFFSET_Y_DOWN
        targetY = uy * reach * yRange
    end

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
local function updateBodyFollow(self: CharacterAnimation, seconds: number, moveY: number)
    -- 目標の振り向き量(-1〜1)を決める。優先度: 頭ドラッグ(⑪) > AI操作(⑩) > カーソル追従
    local targetTX: number
    local targetTY: number
    local lerpSpeed = EYE_LERP_SPEED
    local aiOn = self.vmAiActive ~= nil and self.vmAiActive.value > 0.5
    if self.grabbing then
        targetTX, targetTY = self.grabTurnX, self.grabTurnY
        lerpSpeed = GRAB_LERP_SPEED  -- 手についてくるよう俊敏に
    elseif aiOn then
        targetTX = math.clamp(if self.vmAiTurnX then self.vmAiTurnX.value else 0.0, -1.0, 1.0)
        targetTY = math.clamp(if self.vmAiTurnY then self.vmAiTurnY.value else 0.0, -1.0, 1.0)
    else
        local ux, uy, dist = cursorVector(self.mouseX, self.mouseY)
        -- 目は EYE_REACH までで最大(②-a)。ここではそれを超えた分で「振り向き」を立ち上げる。
        -- これが「中心付近は目だけ / 一定範囲を超えたら体も動く」の要。
        local turnFrac = math.clamp((dist - EYE_REACH) / (TURN_REACH - EYE_REACH), 0.0, 1.0)
        targetTX, targetTY = ux * turnFrac, uy * turnFrac
    end
    -- ⑰ タバコを咥えている間(吸う)だけ、指定がなければ首を左に向けたままにする
    -- (体を傾ける(ロール)のではなく、通常のカーソル追従と同じ「振り向き」の仕組みを使う)。
    -- 吐いている間(phase2)は通常通り追従してよい。
    if self.smokePhase == 1 and not self.grabbing then
        targetTX, targetTY = SMOKE_TURN_X, 0.0
    end

    local a = math.min(lerpSpeed * seconds, 1.0)
    self.turnX += (targetTX - self.turnX) * a
    self.turnY += (targetTY - self.turnY) * a
    local hx, hy = self.turnX, self.turnY
    -- 縦の追従だけ、下向きのときに DOWN_Y_BOOST 倍して見下ろしの動きを大きくする
    local hyDown = if hy > 0.0 then hy * DOWN_Y_BOOST else hy

    -- ⑧ 頭の傾き(ロール)。映像の「ゆらゆら」の主成分。
    -- 指示(ドラッグ/AI) + 振り向き連動 + 常時アイドル揺れ を目標にして、
    -- 弱減衰ばねで「ゆらっ」とオーバーシュートしながら追従させる。
    local tiltInput = 0.0
    if self.grabbing then
        tiltInput = self.grabTilt
    elseif aiOn and self.vmAiTilt then
        tiltInput = math.clamp(self.vmAiTilt.value, -1.0, 1.0)
    end
    local idle = math.sin(self.breathTime * math.tau * IDLE_SWAY_FREQ) * IDLE_SWAY_DEG
        + math.sin(self.breathTime * math.tau * IDLE_SWAY_FREQ2 + 1.7) * IDLE_SWAY_DEG2
    -- 発話中はアイドル揺れを増幅(映像では喋っているときほど大きくゆらゆらする)
    idle *= 1.0 + self.lipEnv * IDLE_SWAY_TALK_BOOST
    local tiltTarget = tiltInput * HEAD_TILT_MAX + hx * TURN_TILT_DEG + idle
    local dt = math.min(seconds, HAIR_MAX_STEP)
    local tiltAccel = (tiltTarget - self.tiltDeg) * TILT_SPRING - self.tiltVel * TILT_DAMP
    self.tiltVel += tiltAccel * dt
    self.tiltDeg += self.tiltVel * dt
    if self.vmHeadRot then self.vmHeadRot.value = self.tiltDeg end
    if self.vmBodyRot then self.vmBodyRot.value = self.tiltDeg * BODY_TILT_RATIO end

    -- 中景: 頭グループ全体。縦は呼吸+バウンス(moveY)とうなずき(nodY)を合算する
    -- ⑰ タバコ・煙を口元に描くのに使うので、頭と口の位置は self にも控えておく
    self.headPosX  = BASE_HEAD_X  + hx * HEAD_X
    self.headPosY  = BASE_HEAD_Y  + moveY + hyDown * HEAD_Y + self.nodY
    self.mouthPosX = BASE_MOUTH_X + hx * MOUTH_X
    self.mouthPosY = BASE_MOUTH_Y + hyDown * MOUTH_Y
    if self.vmHeadX     then self.vmHeadX.value     = self.headPosX                         end
    if self.vmHeadY     then self.vmHeadY.value     = self.headPosY                         end
    -- 前景: 頭の移動に上乗せ(前方ほど大きく → 奥行き)
    if self.vmNoseX     then self.vmNoseX.value     = BASE_NOSE_X  + hx * NOSE_X            end
    if self.vmNoseY     then self.vmNoseY.value     = BASE_NOSE_Y  + hyDown * NOSE_Y        end
    if self.vmMouthX    then self.vmMouthX.value    = self.mouthPosX                        end
    if self.vmMouthY    then self.vmMouthY.value    = self.mouthPosY                        end
    if self.vmHairX     then self.vmHairX.value     = BASE_HAIR_X  + hx * HAIR_X            end
    if self.vmHairY     then self.vmHairY.value     = BASE_HAIR_Y  + hyDown * HAIR_Y        end
    -- 獣耳: hairs グループの子なので、親(前髪と共有)の移動分を引いて完全に切り離す。
    -- headear のワールド移動 = hairs の移動 + 自身のローカル値 なので、
    -- ローカルに (HEADEAR - HAIR) を入れると差し引きで純粋に hx * HEADEAR_X だけ動く。
    if self.vmHeadearX  then self.vmHeadearX.value  = BASE_HEADEAR_X + hx * (HEADEAR_X - HAIR_X) end
    if self.vmHeadearY  then self.vmHeadearY.value  = BASE_HEADEAR_Y + hyDown * (HEADEAR_Y - HAIR_Y) end
    -- 背景: 後ろ髪。横は逆方向に少し(振り向きで見えてくる)。
    -- head の子ではないので、頭の傾き(回転)・縦移動(振り向き縦+うなずき)にも明示的に追従させる。
    if self.vmBackHairX   then self.vmBackHairX.value   = BASE_BHAIR_X + hx * BHAIR_X       end
    if self.vmBackHairY   then
        self.vmBackHairY.value = BASE_BHAIR_Y + self.breathY * 0.6 + self.bounceY
            + (hyDown * HEAD_Y + self.nodY) * BHAIR_Y_FOLLOW
    end
    if self.vmBackHairRot then self.vmBackHairRot.value = self.tiltDeg * BHAIR_TILT_RATIO   end
    -- 体・首: 頭の振り向きにつられて傾く
    if self.vmBodyX     then self.vmBodyX.value     = BASE_BODY_X  + hx * BODY_X            end
    if self.vmNeckX     then self.vmNeckX.value     = BASE_NECK_X  + hx * NECK_X            end
    -- 体(topwear/eri/wing/tail)の縦。頭が見上げ/見下ろし・うなずきで上下すると、
    -- 体もその一部(BODY_Y_FOLLOW)だけついてくる(参照映像の「顔が上がると体もついてくる」動き)。
    local bodyFollowY = (hyDown * HEAD_Y + self.nodY) * BODY_Y_FOLLOW
    if self.vmTopwearY  then self.vmTopwearY.value  = BASE_TOPWEAR_Y + self.breathY + self.bounceY + bodyFollowY end
    if self.vmEriY      then self.vmEriY.value      = BASE_ERI_Y     + self.breathY + self.bounceY + bodyFollowY end
    if self.vmWingY     then self.vmWingY.value     = BASE_WING_Y    + self.breathY + self.bounceY + bodyFollowY end
    if self.vmTailY     then self.vmTailY.value     = BASE_TAIL_Y    + self.breathY + self.bounceY + bodyFollowY end
    -- 首の縦: 見上げ(headMoveY<0)は隙間防止のためしっかり追従、
    -- 見下ろし(headMoveY>0)は体(BODY_Y_FOLLOW)と同じ量にして体と一体に動かす。
    if self.vmNeckY     then
        local headMoveY = hyDown * HEAD_Y + self.nodY
        local neckFollow = if headMoveY < 0.0 then NECK_Y_FOLLOW_UP else BODY_Y_FOLLOW
        self.vmNeckY.value = BASE_NECK_Y + self.breathY + self.bounceY
            + headMoveY * neckFollow
    end
    -- 首の回転。頭と同じ角度を書いて、大きく傾けても首から顔が離れて見えないようにする
    if self.vmNeckRot   then
        self.vmNeckRot.value = math.clamp(self.tiltDeg * NECK_TILT_RATIO, -NECK_ROT_MAX_DEG, NECK_ROT_MAX_DEG)
    end
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

    -- 頭の振り向き速度(turnX の時間微分)に、傾き(⑧)・弾み/うなずき(⑨)の速度も混ぜる。
    -- どの動きでも髪と headear が映像のように遅れて揺れるようになる。
    local turnVelX = (self.turnX - self.prevTurnX) / dt
    local turnVelY = (self.turnY - self.prevTurnY) / dt
    -- 縦の動き(turnVelY)はここには入れない。この揺れは左右が同じ回転方向に振れるので、
    -- 鏡像配置の左右のボーンでは片側が外・もう片側が内へ動いてしまう
    -- (「左耳だけ外へ開く」の原因)。縦の動きは左右逆向きの⑮側だけで表現する。
    local rawVel = math.clamp(
        turnVelX * HEAD_VEL_SCALE
            + self.tiltVel * TILT_HAIR_DRIVE
            + (self.bounceVel + self.nodVel) * BOUNCE_HAIR_DRIVE,
        -HEAD_VEL_MAX, HEAD_VEL_MAX)
    self.prevTurnX = self.turnX
    self.prevTurnY = self.turnY
    self.headVelX += (rawVel - self.headVelX) * math.min(HEAD_VEL_SMOOTH * dt, 1.0)

    -- ⑮ 下からの風。下向き(turnVelY > 0)なら正の値が立ち、左右逆向き
    -- (HAIR_SPREAD_SIGN)に配ると外へ開く。上向き(turnVelY < 0)なら負の値になり、
    -- 同じ配分がそのまま反転して内側へ寄る(こちらはほんの少しだけ)。静止では 0。
    local rawSpread
    if turnVelY >= 0.0 then
        rawSpread = math.min(turnVelY * HAIR_SPREAD_DRIVE, HAIR_SPREAD_MAX)
    else
        rawSpread = math.max(turnVelY * HAIR_GATHER_DRIVE, -HAIR_GATHER_MAX)
    end
    self.hairSpread += (rawSpread - self.hairSpread) * math.min(HAIR_SPREAD_SMOOTH * dt, 1.0)

    -- 重力補償の基準角。前髪・headear は head の子なので頭の傾きを、
    -- 後ろ髪チェーン[18-29]は back hair 自体の回転(頭に追従して書いた値)を打ち消す。
    local headTilt = self.tiltDeg
    local backTilt = self.tiltDeg * BHAIR_TILT_RATIO

    for i = 1, HAIR_COUNT do
        -- 慣性の入力源: 頭に直結(親=0)なら頭の速度(今フレーム)、そうでなければ
        -- 親セグメントの「前フレーム」の角速度(=最低でも1テンポ遅れて伝わる)
        local parent = HAIR_PARENT[i]
        -- 揺れ(左右同じ向き)に、下からの風による広がり(左右逆向き=外向き)を足す。
        -- accel = -driveVel * 慣性 なので、外へ開かせたい向きとは符号が逆になる。
        local rawDrive = (if parent == 0 then self.headVelX else self.hairVelsPrev[parent]) * HAIR_DRIVE_SIGN[i]
            + self.hairSpread * HAIR_SPREAD_SIGN[i]

        -- さらに、この入力を各セグメントごとの速さでなめらかに追いかけさせる。
        -- HAIR_DRIVE_SMOOTH が小さいほど反応が遅く、毛先ほど小さい値にしてあるので
        -- 「頭が動いてから毛先に伝わるまでの遅れ」が根本→毛先へ段階的に大きくなる。
        self.hairDriveSmooth[i] += (rawDrive - self.hairDriveSmooth[i]) * math.min(HAIR_DRIVE_SMOOTH[i] * dt, 1.0)
        local driveVel = self.hairDriveSmooth[i]

        -- 重力: ばねの静止目標を -傾き×分配率 にずらす。頭がどれだけ傾いても、
        -- チェーン合計で傾きを打ち消し、毛先は画面上で常に下を向いたままになる。
        local carrier = if i >= 18 and i <= 29 then backTilt else headTilt
        local gravTarget = -carrier * HAIR_GRAV_FRAC[i]

        local accel = -driveVel * HAIR_INERTIA[i]
            - (self.hairAngles[i] - gravTarget) * HAIR_STIFFNESS[i]
            - self.hairVels[i] * HAIR_DAMPING[i]
        local vel = self.hairVels[i] + accel * dt
        local angle = self.hairAngles[i] + vel * dt

        -- 可動域の端では跳ね返らせず速度を殺す(髪が暴れて見えないように)。
        -- 可動域は重力目標を中心にとる(大きく傾けても補償分が可動域に食われないように)
        local limit = HAIR_MAX_ANGLE[i]
        if angle > gravTarget + limit then
            angle, vel = gravTarget + limit, 0.0
        elseif angle < gravTarget - limit then
            angle, vel = gravTarget - limit, 0.0
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
-- ⑨ 発話バウンス: 音量(lipEnv)または aiBounce を目標にした弱減衰ばね
--==========================================================================
-- 映像では喋りに合わせて体全体が小刻みに弾む。音量エンベロープ(前フレームの値で十分)を
-- そのまま使い、ばねの揺り戻しで「ぷるん」とした質感を出す。
local function updateBounce(self: CharacterAnimation, seconds: number)
    -- ⑰ タバコの上下は、発話バウンス用の速いばね(BOUNCE_SPRING/DAMP)とは別に、
    -- ゆっくりしたイージングで動かす。吸う(phase1)で上げ、吐く(phase2)に切り替わったら下げる。
    -- smokeBounceEase が残っている間は(モードが切れた後も)ここで下げ切る。
    if self.smokePhase ~= 0 or self.smokeBounceEase > 0.0 then
        local target = if self.smokePhase == 1 then 1.0 else 0.0
        if target > self.smokeBounceEase then
            self.smokeBounceEase = math.min(self.smokeBounceEase + seconds / SMOKE_BOUNCE_RISE_TIME, target)
        else
            self.smokeBounceEase = math.max(self.smokeBounceEase - seconds / SMOKE_BOUNCE_FALL_TIME, target)
        end
        self.bounceY = -self.smokeBounceEase * SMOKE_BOUNCE_AMOUNT * BOUNCE_AMP
        self.bounceVel = 0.0
        return
    end

    local dt = math.min(seconds, HAIR_MAX_STEP)
    if dt <= 0 then return end
    local amp = self.lipEnv  -- 喋っていれば自動で弾む
    if self.vmAiBounce then
        amp = math.max(amp, math.clamp(self.vmAiBounce.value, 0.0, 1.0))
    end
    local target = -amp * BOUNCE_AMP  -- 上方向(-Y)へ持ち上げる
    local accel = (target - self.bounceY) * BOUNCE_SPRING - self.bounceVel * BOUNCE_DAMP
    self.bounceVel += accel * dt
    self.bounceY += self.bounceVel * dt
end

--==========================================================================
-- ⑩-b うなずき: aiNod が 0→1 に立ち上がったら1回だけ、sin半波で頭を下げて戻す
--==========================================================================
local function updateNod(self: CharacterAnimation, seconds: number)
    local v = if self.vmAiNod then self.vmAiNod.value else 0.0
    if v > 0.5 and self.prevNodVal <= 0.5 then
        self.nodActive = true
        self.nodT = 0
    end
    self.prevNodVal = v

    local prevY = self.nodY
    if self.nodActive then
        self.nodT += seconds
        if self.nodT >= NOD_TIME then
            self.nodActive = false
            self.nodY = 0
        else
            self.nodY = math.sin(math.pi * self.nodT / NOD_TIME) * NOD_AMP
        end
    end
    -- うなずきの速度は髪物理の駆動にも使う(頭を振ると耳・髪が揺れる)
    local dt = math.min(seconds, HAIR_MAX_STEP)
    self.nodVel = if dt > 0 then (self.nodY - prevY) / dt else 0.0
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
-- ⑯ 表情(笑顔): 目だけ blink_008(閉じ切り)へまばたきと同じ速さで遷移させる
--==========================================================================
-- 口には触れない(リップシンクは smile 中もそのまま動く)。
-- smile の目標値(0=普段/1=笑顔)へ、まばたきの開閉と同じ速さ(BLINK_CLOSE/BLINK_OPEN)で
-- smileEyeAmt をなめらかに近づけ、blinkFrameIndex() でコマ(1〜8)に変換して表示する。
-- smileEyeAmt が 0 に戻りきっている間だけ、通常のランダムまばたき(updateBlink)を動かす。
local function updateSmileEyes(self: CharacterAnimation, seconds: number)
    local smileOn = self.vmSmile ~= nil and self.vmSmile.value > 0.5
    local target = if smileOn then 1.0 else 0.0
    if target > self.smileEyeAmt then
        self.smileEyeAmt = math.min(self.smileEyeAmt + seconds / BLINK_CLOSE, target)
    elseif target < self.smileEyeAmt then
        self.smileEyeAmt = math.max(self.smileEyeAmt - seconds / BLINK_OPEN, target)
    end

    if self.smileEyeAmt <= 0.0 then
        updateBlink(self, seconds)
        return
    end

    local frame = blinkFrameIndex(self.smileEyeAmt)
    if self.vmEyesDefault then self.vmEyesDefault.value = 0.0 end
    for i = 1, BLINK_FRAMES do
        local prop = self.vmBlinkFrames[i]
        if prop then prop.value = if i == frame then 1.0 else 0.0 end
    end
end

--==========================================================================
-- ⑰ タバコ吸うモード
--==========================================================================
-- フェーズを進める。smoking が 0 に戻ったら即座に通常状態へ戻す。
local function updateSmoking(self: CharacterAnimation, seconds: number)
    local on = self.vmSmoking ~= nil and self.vmSmoking.value > 0.5
    if not on then
        self.smokePhase = 0
        self.smokeT = 0
    elseif self.smokePhase == 0 then
        -- モードに入った瞬間。「吸う」から始める
        self.smokePhase = 1
        self.smokeT = 0
    else
        self.smokeT += seconds
        if self.smokePhase == 1 then
            if self.smokeT >= SMOKE_INHALE_TIME then
                self.smokePhase = 2   -- 吸い終わり → 吐く
                self.smokeT = 0
                -- ⑰ 煙は体の動きに追従させない。吐き始めた瞬間の口の位置で固定する
                self.puffOriginX = self.headPosX + self.mouthPosX
                self.puffOriginY = self.headPosY + self.mouthPosY
            end
        else
            if self.smokeT >= PUFF_FRAME_COUNT * PUFF_FRAME_TIME then
                self.smokePhase = 1   -- 吐き終わり → また吸う
                self.smokeT = 0
            end
        end
    end

    -- タバコの不透明度(⑰)。吸う=1(表示)へ、それ以外=0(フェードで消す)へなめらかに近づける
    local alphaTarget = if self.smokePhase == 1 then 1.0 else 0.0
    local alphaSpeed = seconds / CIG_FADE_TIME
    if alphaTarget > self.cigAlpha then
        self.cigAlpha = math.min(self.cigAlpha + alphaSpeed, alphaTarget)
    elseif alphaTarget < self.cigAlpha then
        self.cigAlpha = math.max(self.cigAlpha - alphaSpeed, alphaTarget)
    end
end

-- 喫煙中の口。リップシンク(④)の結果を上書きして、
-- 吸う=「う」の006 / 吐く=「あ」の008 にする。
-- パッと切り替わらないよう、フェーズの頭で 001→目標コマへ送る。
local function applySmokingMouth(self: CharacterAnimation)
    if self.smokePhase == 0 then return end
    local vowel = if self.smokePhase == 1 then VOWEL_U else VOWEL_A
    local targetFrame = if self.smokePhase == 1 then SMOKE_INHALE_MOUTH_FRAME else LIP_FRAMES
    local t = math.min(self.smokeT / SMOKE_MOUTH_OPEN_TIME, 1.0)
    local frame = math.clamp(math.floor(1.0 + t * (targetFrame - 1) + 0.5), 1, LIP_FRAMES)
    if self.vmMouthDefault then self.vmMouthDefault.value = 0.0 end
    for v = 1, 5 do
        local prop = self.vmMouthShapes[v]
        if prop then prop.value = if v == vowel then 1.0 else 0.0 end
    end
    for f = 1, LIP_FRAMES do
        local prop = self.vmMouthFrames[f]
        if prop then prop.value = if f == frame then 1.0 else 0.0 end
    end
end

-- スティッカーの1コマを描く。
-- 元画像(480x480座標系)の (ax, ay) が画面の (px, py) に来るように、
-- scale 倍・rot ラジアン回転して置く。cx/cy はそのコマの中心位置。opacity は 0〜1。
local function drawSticker(renderer: Renderer, sampler: ImageSampler, img: Image,
    cx: number, cy: number, ax: number, ay: number,
    scale: number, rot: number, px: number, py: number, opacity: number)
    -- drawImage は画像の左上を原点に描くので、中心位置から左上を求める
    local tlx = cx - img.width * 0.5
    local tly = cy - img.height * 0.5
    local m = Mat2D.withTranslation(px, py)
        * Mat2D.withRotation(rot)
        * Mat2D.withScale(scale, scale)
        * Mat2D.withTranslation(tlx - ax, tly - ay)
    renderer:save()
    renderer:transform(m)
    renderer:drawImage(img, sampler, 'srcOver', opacity)
    renderer:restore()
end

-- コマ画像を遅延取得する。一度取得できたコマは cache(cigImages/puffImages)に憶えておき、
-- 次回以降は context:image() を呼ばず即座に返す。
-- 名前は "_a_frm<n>,<ms>" (PSD取り込み時のアセット名)。タバコは 0始まり(frm0〜frm25)、
-- 煙は 1始まり(frm1〜frm159)とズレているため、呼び出し側が frameNum を渡す。
local function getStickerFrame(self: CharacterAnimation, cache: {Image?}, cacheIndex: number, frameNum: number, suffix: string): Image?
    local img = cache[cacheIndex]
    if img then return img end
    if not self.scriptContext then return nil end
    img = self.scriptContext:image("_a_frm" .. frameNum .. suffix)
    if img then cache[cacheIndex] = img end
    return img
end

local function drawSmoking(self: CharacterAnimation, renderer: Renderer)
    if self.smokePhase == 0 then return end
    local sampler = self.smokeSampler
    if not sampler then return end

    -- 口のアートボード座標 = head の位置 + 口のローカル位置(そのまま平行移動)。
    -- 位置の計算には頭の傾きを反映しない(回転させると位置がズレる問題があったため)。
    -- タバコの絵自体の向きだけ、頭の傾き(tiltDeg)に合わせて回転させる。
    local rot = math.rad(self.tiltDeg)
    local mx: number, my: number
    if SMOKE_DEBUG_CENTER then
        -- [位置調整用] アートボード中央に固定
        mx, my = ARTBOARD_W * 0.5, ARTBOARD_H * 0.5
    else
        -- 口(vmMouthX/Y)と同じタイミング(turnX)で動くが、横方向だけ振れ幅を
        -- CIG_TURN_SCALE 倍に拡大する(速度のタイミングはそのまま、動く量だけ増やす)。
        local baseX = BASE_HEAD_X + BASE_MOUTH_X
        mx = baseX + self.turnX * (HEAD_X + MOUTH_X) * CIG_TURN_SCALE
        my = self.headPosY + self.mouthPosY
    end

    -- タバコ: 位置は口元に固定したまま、cigAlpha(⑰)でフェードイン/アウトする
    -- (吸う=フェードイン、吐く=フェードアウトで消える)。
    if self.cigAlpha > 0.0 then
        local idx = (math.floor(self.smokeT / CIG_FRAME_TIME) % CIG_FRAME_COUNT) + 1
        local img = getStickerFrame(self, self.cigImages, idx, idx - 1, ",70")
        if img then
            drawSticker(renderer, sampler, img, CIG_CX, CIG_CY[idx],
                CIG_ANCHOR_X, CIG_ANCHOR_Y, CIG_SCALE, rot,
                mx + CIG_OFFSET_X, my + CIG_OFFSET_Y, self.cigAlpha)
        end
    end

    if self.smokePhase == 2 then
        -- 吐く: 煙を1周だけ再生。体の動き(頭の位置・傾き)には追従させず、
        -- 吐き始めた瞬間の口の位置(puffOriginX/Y)に固定する。
        local idx = math.floor(self.smokeT / PUFF_FRAME_TIME) + 1
        if idx >= 1 and idx <= PUFF_FRAME_COUNT then
            local img = getStickerFrame(self, self.puffImages, idx, idx, ",40")
            if img then
                drawSticker(renderer, sampler, img, PUFF_CX[idx], PUFF_CY[idx],
                    PUFF_ANCHOR_X, PUFF_ANCHOR_Y, PUFF_SCALE, 0.0,
                    self.puffOriginX + PUFF_OFFSET_X, self.puffOriginY + PUFF_OFFSET_Y, 1.0)
            end
        end
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
    self.vmBackHairRot = vm:getNumber("backHairRot")
    self.vmBodyRootRot = vm:getNumber("bodyRootRot")
    self.vmNeckX      = vm:getNumber("neckX")
    self.vmNeckY      = vm:getNumber("neckY")
    self.vmNeckRot    = vm:getNumber("neckRot")
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
    self.vmFaceX      = vm:getNumber("faceX")
    self.vmFaceY      = vm:getNumber("faceY")
    self.vmHeadRot    = vm:getNumber("headRot")
    self.vmBodyRot    = vm:getNumber("bodyRot")
    -- AI操作入力(⑩)
    self.vmAiActive   = vm:getNumber("aiActive")
    self.vmAiTurnX    = vm:getNumber("aiTurnX")
    self.vmAiTurnY    = vm:getNumber("aiTurnY")
    self.vmAiTilt     = vm:getNumber("aiTilt")
    self.vmAiBounce   = vm:getNumber("aiBounce")
    self.vmAiNod      = vm:getNumber("aiNod")
    -- 表情(笑顔、⑯)
    self.vmSmile      = vm:getNumber("smile")
    -- タバコ吸うモード(⑰)
    self.vmSmoking    = vm:getNumber("smoking")
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
        vm:getNumber("rightArm1Rot"), vm:getNumber("rightArm2Rot"),
        vm:getNumber("leftArm1Rot"), vm:getNumber("leftArm2Rot"),
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
    self.prevTurnY  = 0
    self.headVelX   = 0
    self.hairSpread = 0
    -- 傾き・弾み・うなずき・ドラッグは静止状態から始める
    self.tiltDeg   = 0
    self.tiltVel   = 0
    self.bounceY   = 0
    self.bounceVel = 0
    self.nodActive = false
    self.nodT      = 0
    self.nodY      = 0
    self.nodVel    = 0
    self.prevNodVal = 0
    self.grabbing  = false
    self.breathY   = 0
    if self.vmHeadRot then self.vmHeadRot.value = 0 end
    if self.vmBodyRot then self.vmBodyRot.value = 0 end
    if self.vmBackHairRot then self.vmBackHairRot.value = 0 end
    if self.vmNeckRot then self.vmNeckRot.value = 0 end
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
    self.smileEyeAmt = 0.0
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

    -- ⑰ タバコ吸うモード: コマ画像は185枚あるため、ここでは読み込まず
    -- 実際に表示する瞬間に getStickerFrame() が遅延取得する(起動を遅くしないため)。
    self.scriptContext = context
    self.smokeSampler  = ImageSampler('clamp', 'clamp', 'bilinear')
    self.smokePhase    = 0
    self.smokeT        = 0
    self.cigAlpha      = 0
    self.smokeBounceEase = 0
    self.headPosX, self.headPosY   = BASE_HEAD_X, BASE_HEAD_Y
    self.mouthPosX, self.mouthPosY = BASE_MOUTH_X, BASE_MOUTH_Y
    self.puffOriginX = BASE_HEAD_X + BASE_MOUTH_X
    self.puffOriginY = BASE_HEAD_Y + BASE_MOUTH_Y
    self.cigImages  = {}
    self.puffImages = {}

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
    -- ⑰ 先に進める(このフレームの顔の傾きを updateBodyFollow が使うため)
    updateSmoking(self, seconds)
    updateBounce(self, seconds)   -- lipEnv は前フレームの値を使う(1フレーム遅れで十分)
    updateNod(self, seconds)
    local moveY = updateBreathing(self, seconds)  -- 呼吸 + バウンスの合算Y
    updateEyeFollow(self, seconds)
    updateBodyFollow(self, seconds, moveY)
    updateHairPhysics(self, seconds)
    updateSmileEyes(self, seconds)
    updateLipSync(self, seconds)
    -- ⑰ 喫煙中はリップシンクの口を「う」「あ」で上書きする
    applySmokingMouth(self)
    return true
end

function update(self: CharacterAnimation) end

-- アートボード全体を覆うほぼ透明な矩形。これが pointerMove の当たり判定になる。
-- パスは init() で組み立て済みなので、ここでは描くだけ。
function draw(self: CharacterAnimation, renderer: Renderer)
    renderer:drawPath(self.hitPath, self.hitPaint)
    -- ⑰ タバコ・煙のコマをここで直接描く
    drawSmoking(self, renderer)
end

function pointerMove(self: CharacterAnimation, event: PointerEvent)
    self.mouseX = event.position.x
    self.mouseY = event.position.y
    -- ⑪ 頭ドラッグ中: つかんだ位置からの移動量を振り向き・傾きの目標値に変換する。
    -- 横に動かすと振り向き+傾き、縦に動かすと見上げ/うつむき。離すとばねで戻る。
    if self.grabbing then
        local dx = event.position.x - self.grabOriginX
        local dy = event.position.y - self.grabOriginY
        self.grabTurnX = math.clamp(self.grabStartTurnX + dx / GRAB_RANGE, -1.0, 1.0)
        self.grabTurnY = math.clamp(self.grabStartTurnY + dy / GRAB_RANGE, -1.0, 1.0)
        self.grabTilt  = math.clamp(dx / GRAB_TILT_RANGE, -1.0, 1.0)
    end
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
    -- ⑪ 頭のあたりをつかんだらドラッグモード開始(動作確認用)
    local gx = event.position.x - GRAB_CENTER_X
    local gy = event.position.y - GRAB_CENTER_Y
    if gx * gx + gy * gy <= GRAB_RADIUS * GRAB_RADIUS then
        self.grabbing = true
        self.grabOriginX = event.position.x
        self.grabOriginY = event.position.y
        self.grabStartTurnX = self.turnX
        self.grabStartTurnY = self.turnY
        self.grabTurnX = self.turnX
        self.grabTurnY = self.turnY
        self.grabTilt = 0
    end
    event:hit()
end

-- ドラッグ終了。目標値の供給が止まり、頭・髪はばねで自然に戻る。
function pointerUp(self: CharacterAnimation, event: PointerEvent)
    self.grabbing = false
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
        pointerUp = pointerUp,
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
        vmBackHairRot = nil,
        vmBodyRootRot = nil,
        vmNeckX = nil, vmNeckY = nil, vmNeckRot = nil,
        vmTopwearY = nil,
        vmNoseX = nil, vmNoseY = nil,
        vmMouthX = nil, vmMouthY = nil,
        vmHairX = nil, vmHairY = nil,
        vmHeadearX = nil, vmHeadearY = nil,
        vmEriY = nil,
        vmWingY = nil, vmTailY = nil,
        vmFaceX = nil, vmFaceY = nil,
        vmHeadRot = nil, vmBodyRot = nil,
        vmAiActive = nil,
        vmAiTurnX = nil, vmAiTurnY = nil,
        vmAiTilt = nil, vmAiBounce = nil, vmAiNod = nil,
        vmSmile = nil,
        vmHairRots = {},
        vmEyesDefault = nil,
        vmBlinkFrames = {},
        vmSingAmp = nil, vmMouthVowel = nil,
        vmMouthShapes = {}, vmMouthFrames = {},
        vmMouthDefault = nil,
        mouseX = EYE_CENTER_X, mouseY = EYE_CENTER_Y,
        breathTime = 0,
        breathY = 0,
        eyeOffsetX = 0, eyeOffsetY = 0,
        turnX = 0, turnY = 0,
        prevTurnX = 0, prevTurnY = 0, headVelX = 0, hairSpread = 0,
        hairAngles = {}, hairVels = {}, hairVelsPrev = {}, hairDriveSmooth = {},
        tiltDeg = 0, tiltVel = 0,
        bounceY = 0, bounceVel = 0,
        nodActive = false, nodT = 0, nodY = 0, nodVel = 0, prevNodVal = 0,
        grabbing = false,
        grabOriginX = 0, grabOriginY = 0,
        grabStartTurnX = 0, grabStartTurnY = 0,
        grabTurnX = 0, grabTurnY = 0, grabTilt = 0,
        blinking = false, blinkT = 0, blinkTimer = 0,
        smileEyeAmt = 0.0,
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
        -- ⑰ タバコ吸うモード
        scriptContext = nil,
        vmSmoking = nil,
        smokePhase = 0, smokeT = 0, cigAlpha = 0, smokeBounceEase = 0,
        cigImages = {}, puffImages = {},
        smokeSampler = nil,
        headPosX = BASE_HEAD_X, headPosY = BASE_HEAD_Y,
        mouthPosX = BASE_MOUTH_X, mouthPosY = BASE_MOUTH_Y,
        puffOriginX = BASE_HEAD_X + BASE_MOUTH_X, puffOriginY = BASE_HEAD_Y + BASE_MOUTH_Y,
    }
end
