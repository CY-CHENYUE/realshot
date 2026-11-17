# 素材来源与许可

本仓库的代码和未在下面单独列出的素材属于本项目。下面按类别列出第三方素材、生成素材和没有放进仓库的素材。

## 没有放进仓库的素材

PAC-9 步枪、手套、袖子和它们的开火、换弹动作是私有素材，没有再分发授权，所以不在仓库里（`.gitignore` 里列了文件名）。缺少这些文件时，游戏自动换成一把用代码拼出来的替代步枪，没有双手，换弹是整把枪下沉再抬起；其余内容不变。见 `src/viewmodel.mjs`。

## 群核 Lux3D 生成的模型

下列模型由文字描述经 [aholo-cli](https://github.com/CY-CHENYUE/aholo-cli) 调用群核 Lux3D 生成，再在本地减面、烘焙成游戏用的三级细节。括号里是 Lux3D 任务号。

- `assets/crowd/`：冰壳步兵 trooper（8083319）、重甲步兵 brute（8083328）、爆冰兵 bomber（8083342）
- `assets/props/`：补给箱 crates（8083394）、沙袋工事 sandbags（8083419）、路障 barrier（8084894）、雪地车残骸 snowcat-wreck（8084943）、油桶 fuel-barrels（8084983）、前哨小屋 outpost-cabin（8085134）、中继塔 relay-tower（8085283）、探照灯 floodlight（8086512）、可驾驶雪地车 snowcat（8107139）、无畏舰 dreadnought（8107165）
- `assets/weapons/`：RK-3 火箭筒 vm-launcher（8130828）；VX-6 转管机枪 vm-minigun 的第一版由 Lux3D 生成（8130796），游戏现在用的是照它的轮廓按 149 个零件、11 种材质重做的精细版
- `assets/fx/`：天掌冰手 sky-palm（8146527）
- `assets/defense-v2/hover-hunter.glb`：早期版本的猎手机（7578286）

提示词、任务回执和原始下载文件保存在作者本机；带签名的下载地址和 API 密钥不在仓库里。

## AI 生成的影片和语音

- `assets/cine/intro.mp4`、`assets/cine/outro.mp4`：开场和结局影片，用即梦生成（AI 生成内容），参考图是本游戏自己的敌人和场景截图。详见 `assets/cine/NOTICE.md`。
- `assets/voice/*.mp3`：指挥员“雪鸮”的 37 句无线电语音，用阿里云百炼语音合成生成（AI 生成语音，声音是按文字描述设计的，没有使用真人声音）。详见 `assets/voice/NOTICE.md`。

## 第三方素材

- **three.js 0.187.0**，MIT License，通过 npm 安装（`node_modules/three/LICENSE`）。
- **枪声与拉栓声**：Michel Baradari，“Chaingun, pistol, rifle, shotgun shots”，<https://opengameart.org/node/2566>，CC BY 3.0（<https://creativecommons.org/licenses/by/3.0/>）。改动：挑选和裁剪片段、滤波、增益、淡入淡出，运行时再做音高、增益和叠层变化。
- **命中、弹壳、碎裂和墙面声**：Kenney，“Impact Sounds”，<https://kenney.nl/assets/impact-sounds>，CC0 1.0。改动：格式转换、滤波、增益，运行时叠层。
- 以上两项的文件名对照和原始署名见 `assets/audio/NOTICE.md`、`assets/audio/MICHEL-ORIGINAL.txt`。
- **ambientCG**（Lennart Demes，CC0 1.0）：[Concrete048](https://ambientcg.com/view?id=Concrete048)、[Metal050C](https://ambientcg.com/view?id=Metal050C)、[DaySkyHDRI072B](https://ambientcg.com/view?id=DaySkyHDRI072B)，在 `assets/defense-v2/`。
- **Poly Haven**（CC0）：Metal Plate 02 贴图，以及 Utility Box 02、Portable Generator、Metal Toolbox 三个模型，在 `assets/hangar/`。

## 标识

`assets/brand/aholo-manycore.png` 是群核科技 MANYCORE 与 AHOLO 的标识，印在游戏里的空投箱上。标识归其所有者所有，本项目不主张任何权利。
