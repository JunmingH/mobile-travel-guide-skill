# Mobile Travel Guide Skill

**把旅行计划做成完整的手机旅行 App，并让后续更新有章可循。**

A reusable agent skill for full-featured mobile travel handbooks, offline PWAs,
local travel records, and encrypted static publishing.

Skill 名称：**`build-mobile-travel-guide`**。基于
[personalized-travel-guide-skill](https://github.com/TokenHungryMash/personalized-travel-guide-skill)
的固定版本，加入经过测试的手机运行时与发布工具。这是独立维护的派生项目。

## 能做什么

| 场景 | 交付与行为 |
| --- | --- |
| 从零开始 / 已有 Word 计划 | 整理需求与行程，归档原文及更新差异，按来源维护旅行事实 |
| 完整手机版 | 保留目录、搜索、每日行程、地图、三语锦囊、航班住宿与交通方案 |
| 旅行记录 | 旅行模式、行程修改、清单、照片、图片/PDF 票据、本机记账、分摊与还款 |
| iPhone PWA | 主屏幕图标、独立窗口、深色模式、视口恢复、首次保存后离线使用 |
| 访问码发布 | 加密完整手册，公开仓库只接收解锁外壳与密文 |
| 后续更新 | 私人快照、稳定存储 ID、完整缓存才升级、保留本机记录、核对线上文件哈希 |

这是给 Codex 等 agent 使用的技能包。它提供流程、工具、模板和验收要求；旅行研究、官方信息核对、地图和图像选择仍需要 agent 的浏览器与相关能力。

## 安装

把仓库克隆到用户级技能目录，目录名与技能名一致：

```sh
git clone https://github.com/JunmingH/mobile-travel-guide-skill.git \
  ~/.agents/skills/build-mobile-travel-guide
```

目标已存在时先检查其版本，不要覆盖。重新打开会话或按宿主要求刷新技能列表。其他 agent 请使用各自的 skill 安装位置，保留整个目录结构。

脚本需要 **Python 3.10+、Pillow、Node.js 20+**。浏览器验收还需要 Playwright：

```sh
cd ~/.agents/skills/build-mobile-travel-guide
python -m pip install -r requirements.txt
python scripts/mobile.py doctor
# 仅做浏览器验收时需要；已有运行时可用 PLAYWRIGHT_MODULE 指定。
npm ci
npx playwright install chromium webkit
```

如宿主已带依赖，优先使用现有解释器。`TRAVEL_GUIDE_NODE` 可指定 Node，`CHROME_EXECUTABLE` 可指定现有 Chromium/Chrome。不要把用户行程保存在 skill 安装目录内。

## 使用

直接对 agent 说：

> 使用 $build-mobile-travel-guide，根据我提供的计划制作 iPhone 旅行 PWA，保留完整功能，首次保存后离线使用。

更新已有行程：

> 使用 $build-mobile-travel-guide，根据这份新版 Word 更新现有手册，保留旅行模式、记账和原来的网址。

发布：

> 使用 $build-mobile-travel-guide，将检查通过的手册以访问码保护方式发布到我授权的 GitHub 仓库。

agent 会先阅读 [SKILL.md](SKILL.md)，按实际情况进入新建、已有计划、更新、手机故障或发布路线；已有资料和确认可直接复用。

## 工作流程

```text
确认需求 / 读取计划
        ↓
独立私人工作台 + 固定引擎 + 稳定存储 ID
        ↓
研究源与媒体 → 完整 HTML → PWA
        ↓
内容与手机行为检查 → 访问码加密
        ↓
隔离浏览器离线验收 → 发布检查 → 授权的 GitHub 仓库
        ↓
线上哈希核对 → Safari 添加主屏幕 → 等待离线就绪

更新：快照 → 新文件差异 → 修改研究源 → 重建 → 检查 → 发布
```

命令入口为 `python scripts/mobile.py --help`。详细说明：

- [输入、研究、导入与更新](references/workflow.md)
- [三语、航班与道路/公共交通字段](references/content-extensions.md)
- [手机行为与本机存储](references/mobile-runtime.md)
- [加密、GitHub 发布与安装步骤](references/publication.md)
- [自动检查与真机验收](references/validation.md)

## 离线和隐私边界

**PWA 需要首次通过 HTTPS 联网打开并保存。** ZIP 不是 iPhone 安装包；Safari/文件预览不保证执行本地 HTML 的全部交互。首次也不能联网时，需要另选支持本地 JavaScript 和存储的应用。

手册发布使用 **AES-256-GCM**，随机内容密钥由 **PBKDF2-SHA256（600,000 次）**推导的包装密钥保护。访问码必须足够随机；任何人仍可下载密文并离线尝试猜码。应用名、图标、仓库名和密文大小属于公开元数据；历史密文仍可能保留在 Git 历史中。

此加密保护的是**公开发布的手册**。解锁后的记账、照片与草稿沿用浏览器本机存储；不会自动同步到别人手机，也不额外加密这些记录。同源的其他应用、浏览器数据清除、设备访问和操作系统存储回收都有各自边界，见[发布说明](references/publication.md)。重要文件应保留原件或备份。

仓库只包含通用工具、模板与明确标记的虚构测试资料，不包含任何真实旅行资料、票据、访问码或密钥。

## 开发与验证

```sh
python -m unittest discover -s tests -p 'test_*.py'
node --test tests/test_crypto.mjs
python scripts/audit_package.py .

# 输出必须是空目录；虚构工作台不能通过真实旅行发布关卡。
python tests/make_fixture.py /tmp/mobile-guide-fixture
node tests/run_browser_tests.mjs /tmp/mobile-guide-fixture
```

浏览器套件在独立上下文中验证完整交互、离线解锁、图片、账目恢复、错误码/篡改拒绝、缓存失败回退与更新后的数据保留。桌面 WebKit 模拟不等于实体 iPhone 验收。

GitHub Actions 运行源码、加密、包清单以及 Chromium/WebKit 的虚构行程检查。任何报告都只代表相应构建和实际执行的测试。

打包可分发的技能归档：

```sh
python scripts/package_skill.py /tmp/build-mobile-travel-guide-1.0.0.skill
```

归档带逐文件 SHA-256 清单；不覆盖已有归档，不收录本地配置、工作台、依赖目录或缓存。

## 结构与许可

```text
SKILL.md             agent 的流程入口
agents/              技能名称与调用提示
scripts/             导入、构建、加密、验收、发布核验、打包
assets/              PWA 与访问码界面
references/          工作流和数据约定
tests/               虚构资料与回归测试
vendor/travel-guide/ 固定版本的完整旅行手册引擎
```

本项目代码遵循 [MIT](LICENSE)。上游来源、固定提交与维护改动见 [UPSTREAM.md](UPSTREAM.md) 和 [UPSTREAM.lock.json](UPSTREAM.lock.json)。GSAP 等捆绑第三方组件保留自己的许可证，详见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。旅行照片、地图与票据不因本项目的 MIT 许可而获得重分发许可。
