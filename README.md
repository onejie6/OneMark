# OneMark

Quick Start：`git clone https://github.com/onejie6/OneMark.git`

这是一个本地 Markdown 编辑器，支持双栏预览、沉浸阅读、文件保存及 HTML / PDF 导出。

## 运行

双击 `release/OneMark-1.2.0-Windows.exe`，无需安装。首次启动需要几秒解压。

## 阅读与缩放

- **Ctrl + 鼠标滚轮**：缩放整个页面，范围 50%–200%。普通滚轮正常滚动文章。
- **Ctrl + 加号 / 减号**：放大 / 缩小。**Ctrl + 0** 或点击缩放百分比恢复 100%。
- 点击「阅读」右侧的小图标，或按 **Ctrl + Shift + F**，进入沉浸阅读，隐藏侧栏、顶部选项和工具栏，文章铺满窗口。
- 沉浸阅读右上角的小型控制条可复原缩放、全屏或退出。**Esc** 恢复之前的视图。
- **F11** 切换窗口全屏。
- 顶栏左侧的上下栏图标可收起或展开大标题区；选择会自动记住。

## 编辑

打开或拖入 UTF-8 编码的 `.md`、`.markdown`、`.txt` 文件；也可在左侧粘贴内容。支持表格、任务列表、代码高亮与 LaTeX 公式。

Ctrl+N / O / S：新建 / 打开 / 保存；Ctrl+Shift+S：另存为；Ctrl+F：查找替换；Ctrl+B / I：加粗 / 斜体；Ctrl+Shift+V：切换阅读模式。

未保存内容缓存为本机草稿。正式文件请使用「保存」。macOS 常用快捷键使用 ⌘ 替代 Ctrl。

## 源码与构建

保留 `src/`、`electron/`、`scripts/`、构建配置及 `release/` 客户端。测试文件、报告、日志、依赖目录和中间构建已按要求清理。

使用 Node.js 22.12+，在本文件夹执行：

```powershell
npm ci
npm run dev       # 启动开发版
npm run build     # 类型检查与构建
npm start         # 运行构建版
npm run dist      # 生成 Windows x64 便携客户端
```
