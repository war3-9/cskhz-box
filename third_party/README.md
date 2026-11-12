# 第三方构建输入

自 1.1.2 起，项目自有代码使用根目录 GNU Affero General Public License 第 3 版（仅此版本，AGPL-3.0-only），版权及授权声明见根目录 COPYRIGHT。下列第三方组件保留各自的版权和许可证；游戏贴图、字体、品牌图片也不因收录而改变授权。

## StormLib

`StormLib/` 是 9.40 完整源码（含其构建所用依赖），来源为 <https://github.com/ladislav-zezula/StormLib/tree/v9.40>，许可证见 `StormLib/LICENSE`。桌面 MPQ 读写使用 `src-tauri/vendor/stormlib/StormLib.lib` 中随附的 Windows x64 静态库。

安装 Visual Studio C++ 桌面开发组件、Windows SDK 和 CMake，在项目根目录执行：

```powershell
pwsh -NoProfile -File scripts/build-stormlib.ps1
```

脚本使用 CMake 默认 Visual Studio 生成器及 x64 平台；可用 `-Generator 'Visual Studio 17 2022'` 指定已安装版本。输出先进入 `.build/stormlib`，成功后更新包内静态库。无需本机原项目路径或便携工具链。

## 地形物编转换器

`terrain-object-normalizer/` 保存盒子实际使用的 W3x2Lni 2.7.3 运行输入：Lua 源码、物编数据库、Windows x86 可执行文件及依赖。GPL-3.0 许可证在其 `LICENSE.txt`。本项目入口为 `script/box-objects.lua`，相关配置在 `config.ini`。

`w3x2lni-source/` 来自 <https://github.com/sumneko/w3x2lni> 的固定 commit `2f77a76aa1d59efc5a3c461494c64047fe659081`，与运行目录中的 `script/share/gitlog.lua` 一致；递归子模块源码已随附，版本见 `sources.json`。上游编译说明与 `make.lua`、`.github/workflows/build.yml` 保留。源码版本对应不代表本机已重现上游二进制的逐字节结果。

安装 Visual Studio C++ x86 工具链和 [LuaMake](https://github.com/actboy168/luamake)，在项目根目录执行以下命令可重编译转换器的 C/C++ 组件并打包：

```powershell
pwsh -NoProfile -File scripts/build-terrain-normalizer.ps1
```

上游仍提供 `make/yue.dll` 和 `make/rcedit.exe` 两个构建输入。其项目分别为 [Yue](https://github.com/yue/yue) 和 [rcedit](https://github.com/electron/rcedit)；原运行目录还包含 Microsoft VC/UCRT 运行库。这些第三方二进制沿用原发行许可，不属于盒子自编源码。盒子的转换入口不使用 Yue 图形界面。

仅修改转换 Lua、数据或配置后，不必重新编译 C/C++；运行：

```powershell
python scripts/package-terrain-normalizer.py
```

它从 `terrain-object-normalizer/` 生成 `.private/terrain-object-normalizer.tar.gz` 与摘要。包内已提供可用的同名构建输入，普通桌面编译无需启动魔兽或编辑器。

## 图标、模板及图片

完整原图位于 `素材/`、`模板/`、`public/assets/`，前端图片位于 `src/` 中相应功能目录。安装 Node 依赖及 Python `fonttools[woff]==4.61.1` 后运行：

```powershell
pwsh -NoProfile -File scripts/rebuild-resources.ps1
```

该命令重建图标素材压缩包、应用图标及地形转换包。素材包不加密，不需要账号密钥。`scripts/ui-replacement-build-assets.cjs` 与 `scripts/ui-replacement-build-hud.cjs` 可从随附的原生控制台图片、模型和布局定义重新生成 UI 替换预览资源。
