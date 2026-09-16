# 手机运行时与 iPhone 验证

## 必須保留的功能

桌面与手机使用同一份完整内容和运行时。手机有可见目录和底部工具入口；搜索、折叠、路线大图、旅行模式切日/切页、调整行程、清单、语言、照片/链接/PDF、账目、成员、分摊与还款均须可达。

不要通过删除 JS、压成纯文字、去掉侧边栏又不提供手机目录、取消记账或只保留屏幕上可见内容解决兼容问题。静态 `<img>` 在离线导出中直接内嵌，动态图片保持媒体加载器。

## 安全区域和前台恢复

解锁页和解锁后的文档使用一致的 `viewport-fit=auto` 与 `apple-mobile-web-app-status-bar-style=default`，由系统保留顶部区域。不要在解锁时突然切换 translucent 状态栏或叠加多个 viewport meta。

在 visualViewport resize/scroll、pageshow、visibilitychange、orientationchange、focusout 后重测可用高度。iOS 的首帧可能仍为旧值，因此恢复时在动画帧和短延迟后重测，不强制把正文滚动到顶，不补一个长期固定的“灵动岛高度”。底部操作区仍考虑 safe-area-inset-bottom。

检查：冷启动、后台数分钟再恢复、键盘显示/关闭、横竖屏、长列表滚动、深色模式、不同尺寸。模拟器不代表用户真机复现，明确记录结果范围。

## 持久化和平台降级

- IndexedDB 以 transaction complete 为成功；request success 之后仍可能事务失败。
- 本机存储失败显示原因并保留当前输入，给出可用导出方式，不显示“已保存”。
- 分享只由用户按钮直接触发，先检查 canShare；取消不算失败保存或成功上传。
- 剪贴板不可用时显示完整只读文本及选择按钮。
- PDF 用当前页预览和显式保存链接，不只依赖 iPhone 对 `window.open(dataURL)` 的处理。
- 文件保存提供真实入口；触发 `<a>.click()` 不等于用户已保存成功。
- 草稿恢复验证 schema 和原行程签名。内容更新后旧草稿可能不适用，提示并保留恢复/导出机会，不能悄悄套到不同日期。

## 数据边界

静态缓存由 Service Worker 管理；用户记录在 localStorage/IndexedDB。更新静态版本不主动触碰用户存储。浏览器/操作系统仍可因清理、配额或长期未使用而回收数据，不承诺永久保存。

同一 GitHub Pages 用户域的不同仓库通常同源。命名空间避免意外冲突，但不构成恶意脚本安全隔离。敏感项目应使用独立可信域/部署边界；本机账目和附件未被公开手册的访问码加密。

参考：[WebKit 存储策略](https://webkit.org/blog/14403/updates-to-storage-policy/)、[Clipboard](https://webkit.org/blog/10855/async-clipboard-api/)、[用户激活](https://webkit.org/blog/13862/the-user-activation-api/)。发生平台差异时再核对当时官方文档。
