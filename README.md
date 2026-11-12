# 作者寄语

本版本甚至可以将其他同类型软件同化，比如可以移植其他软件工具的功能到此软件！可以作为其他工具软件源代码进行拷贝其他软件工具功能的能力！

本项目自有代码采用 AGPLv3（`AGPL-3.0-only`），允许商业使用和收费；分发及修改版网络服务须遵守对应源码提供义务，详见 [LICENSE](LICENSE)。

如果有大佬交流可以联系我Q：3433819745  872521245



# 超时空盒子开源版

Windows 桌面工具，使用 React、TypeScript、Konva、Zustand、Tauri 2 和 Rust。本目录包含可修改源码、依赖锁文件、内置素材、模板、测试、构建脚本及所需第三方工具源码。

直接使用：到 [GitHub Releases](https://github.com/war3-9/cskhz-box/releases/latest) 下载 1.1.2 或更新的 AGPLv3 开源版 EXE。随本地源码包提供的新版程序位于 `运行程序/超时空盒子开源版-1.1.2.exe`。重新编译或修改代码时再安装下述开发环境。

## 功能

- 图标制作：图层、文字、模板、工程保存、批量导出、格式转换与裁剪。
- 模型查看器：模型、贴图、音乐、地图资源浏览和导出。
- 魔兽 UI：可视化编辑、设计保存、本地 JASS 与可编辑 T 触发文件导出。
- 地形克隆、魔兽 UI 替换、物编表格及本地物编文件处理。
- AI 辅助命名使用用户自行配置的接口，仅在主动使用时请求。
- 软件外观学习



## 开发环境

建议使用 Windows 10/11 x64，安装：

1. Node.js 22.12 或更新版本（含 npm）。
2. Rust stable 的 `x86_64-pc-windows-msvc` 工具链。
3. Visual Studio Build Tools 的“使用 C++ 的桌面开发”和 Windows SDK。
4. PowerShell 7、Python 3、Microsoft Edge WebView2 Runtime。

在本目录的 PowerShell 7 终端执行：

```powershell
npm ci
python -m pip install -r scripts/requirements-assets.txt
npm run assets:pack
npm run desktop:dev
```

`npm run dev` 可用于浏览器前端预览；本机文件、MPQ、原生模型资源等接口需要桌面版。无需复制原开发电脑的 `.tools`、账号配置、密钥或缓存。

## 检查与构建

```powershell
npm test
npm run build
npm run test:native
npm run desktop:build
```

安装包生成在 `src-tauri/target/release/bundle/nsis/`。只构建 EXE：

```powershell
npm run desktop:portable
```

输出为 `src-tauri/target/release/cskhz-open-source.exe`。也可执行 `pwsh -NoProfile -File scripts/build-desktop.ps1`；不会上传、签名或安装 Box 插件。

部分原生集成测试需要用户自备地图，默认标为忽略，运行条件写在相应测试的 `ignore` 注释和环境变量中。默认单元测试使用包内或动态生成的夹具，不要求访问原开发者的地图。

## 资源与源码位置

| 目录 | 内容 |
| --- | --- |
| `src/` | 桌面前端、各工具逻辑、本地 UI 导出生成器及测试 |
| `src-tauri/` | Rust 原生接口、配置、图标、测试夹具和 StormLib 静态库 |
| `素材/`、`模板/`、`public/` | 内置图片、字体、图标和初始模板 |
| `scripts/` | 开发、构建和资源生成脚本 |
| `third_party/` | StormLib、地形物编转换器及对应上游源码和许可证 |
| `.private/` | 随包的图标素材压缩包、地形转换器压缩包与摘要；此处没有账号或签名私钥 |

`npm run build` 自动重建图标素材包。Git 仓库不提交可重新生成的 `.private/builtin/library.json.zlib`，首次克隆后按上方步骤运行 `npm run assets:pack`；本地完整源码包保留此预生成输入。第三方工具和资源重建方法见 [third_party/README.md](third_party/README.md)。依赖由 `package-lock.json` 和 `src-tauri/Cargo.lock` 锁定，`node_modules`、编译缓存和历史发布不随源码交付。

桌面应用标识为 `com.cskhz.opensource`，与原版应用数据目录区分；UI 设计默认保存在程序旁的 `UI设计保存稿-开源版`。首次使用时自行选择需要读取的游戏资源目录。

## 许可证

Copyright (C) 2026 war3-9。自 **1.1.2** 起，本项目自有代码采用 **GNU Affero General Public License 第 3 版（仅此版本，`AGPL-3.0-only`）**，许可原文见 [LICENSE](LICENSE)，版权及授权声明见 [COPYRIGHT](COPYRIGHT)。

允许使用、修改、商业使用和收费分发。分发受 AGPLv3 覆盖的版本时，须保留许可和版权声明，并按协议向接收者提供完整对应源码及必要的构建、安装材料。修改后的程序通过网络供用户交互使用时，须按第 13 条向这些用户显著提供免费获取该版本对应源码的机会。不得附加禁止收费等与 AGPLv3 冲突的限制。

[1.1.2 对应源码](https://github.com/war3-9/cskhz-box/tree/v1.1.2-agpl.1)及构建步骤在本仓库提供，程序首页也有许可与源码入口。程序按现状提供，不作担保，具体责任范围见 LICENSE。软件输出是否受许可覆盖，取决于输出内容是否构成受许可作品；第三方素材继续按原授权处理。

历史发布附件及提交保留当时的许可说明：1.1.0 为 GPL-3.0，1.1.1 为《源码公开免费许可 1.0》。本次采用 AGPLv3 不追溯撤销此前已授予的权利，也不改写历史提交或附件。

第三方代码分别保留自身许可证，详见 `third_party/` 及 `src-tauri/vendor/`。游戏素材、字体、图标等仍归各自权利人，本项目代码许可证不替代这些素材的授权；本目录保留现有构建素材，公开再分发时需按其原有授权处理。

`src-tauri/src/model_viewer/codec/` 内的两个 DER 文件属于资源格式兼容常量，用于现有模型格式解码，并非服务器登录凭据或应用签名密钥。
