# 验证与发布判定

## Skill 自身

```sh
python -m unittest discover -s tests -p 'test_*.py'
node --test tests/test_crypto.mjs
python scripts/audit_package.py .
```

使用虚构工作台测试，永远不向正在使用的用户浏览器添加测试账目。浏览器依赖可使用已有 Playwright；测试在独立配置中启动。需要安装时使用正常已授权的环境依赖流程。

```sh
python tests/make_fixture.py /tmp/mobile-travel-fixture
# 以下命令通过私有 stdin 接收随机测试码，不把码写入参数。
node tests/run_browser_tests.mjs /tmp/mobile-travel-fixture
```

虚构测试只证明代码行为，`TEST_FIXTURE.json` 会阻止将该工作台作为真实旅行发布。上游的目的地和图片审核要求继续有效。

## 每次真实手册交付

1. **内容一致性**：正确日期、成员、航段、住宿；三语非空；每天两种交通及评价；待核票不写已确认。
2. **源与图像**：原引擎研究/图片/地图规则；逐日主路线标签可读，放大不裁断；新增可选点明确地图覆盖范围。
3. **完整交互**：目录、搜索、折叠、旅行模式全日切换、地图、草稿、清单、照片/PDF/链接、记账/分摊/还款。
4. **真实存储行为**：刷新/重新打开恢复；事务失败不能显示保存成功；新内容与旧草稿冲突可见；取消分享不谎报成功。
5. **离线**：首次缓存完整后停止本地服务或阻断网络，刷新/解锁、图片解码、记账保存、重新锁定后恢复。WebKit 模拟离线开关若出错，用停止服务器验证，记录方法，不能直接跳过。
6. **升级**：不完整缓存拒绝安装，旧版本仍能打开；完整新版需用户点击更新；缓存只清理自己的 scope；账目/附件不被清空。
7. **加密**：错误码失败、密文篡改失败、正确字节匹配、公开文件不含码/密钥、重新加载锁定、密钥不写入存储。
8. **线上**：部署提交成功、远程树清单、HTTPS所有文件哈希、浏览器解锁与离线就绪。

```sh
python scripts/mobile.py handoff /path/to/private-trip
python scripts/release_gate.py /path/to/private-trip
```

`handoff` 负责原内容门槛；`release_gate` 核对当前完整 HTML 的功能报告、当前加密版本的两份浏览器报告与公开清单，拒绝缺失、失败或旧版报告。完成上线字节核验后可加 `--require-live`。

真实工作台先分别运行 `node scripts/check_features.cjs WORKBENCH --engine chromium` 和 `--engine webkit`，再运行 `node scripts/check_updates.cjs WORKBENCH`。加密测试以 `BROWSER_ENGINE=chromium` 或 `webkit` 调用 `node scripts/check_browser.cjs WORKBENCH`；通过受控 stdin 提供 `{"ACCESS_CODE":"实际访问码"}`，不把含码的命令写进 shell 历史。`tests/run_browser_tests.mjs` 只适用于虚构工作台，会自行生成一次性随机测试码。

## 报告真实性

测试脚本生成的状态只说明实际执行的检查，不代替未执行的真机操作。不要复制过去的 QA、编造截图观察或手写 passed 解决报错。脚本/数据/媒体改变后只重跑受影响检查，保持报告与版本一致。

## 真机手工检查

实体 iPhone 的 Safari → 添加主屏幕；从图标冷启动、锁屏/后台恢复、键盘弹出/收回、旋转、深色模式、系统文件/照片选择器、分享和取消、飞行模式重新打开。记录机型、iOS、入口和结果。没做就标为未做，不能用390px截图代替。
