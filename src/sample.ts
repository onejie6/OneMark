export const SAMPLE_MARKDOWN = `# Markdown 使用说明

在左侧输入或粘贴 Markdown，右侧会显示排版结果。

> 这是一份示例文档，可以直接修改。

## 基本操作

- **编辑**：在双栏模式下编辑并预览。
- **阅读**：切换到阅读模式查看文档。
- **保存**：打开或保存本地 Markdown 文件。
- **导出**：导出为 HTML 文档。

## 文字格式

支持 **粗体**、*斜体* 和 ~~删除线~~。

行内代码：\`const title = '示例文档'\`。更多语法见 [Markdown 指南](https://www.markdownguide.org/basic-syntax/)。

### 任务清单

- [x] 打开示例文档
- [ ] 修改内容
- [ ] 保存文件

## 表格

| 内容 | 写法 | 用途 |
| :--- | :--- | :--- |
| 标题 | # 标题 | 划分章节 |
| 列表 | - 项目 | 列举内容 |
| 引用 | > 引用 | 标注引用 |

## 代码

在代码块开头填写语言名称，可显示语法高亮。

\`\`\`typescript
type Note = {
  title: string
  content: string
}

function createNote(title: string): Note {
  return { title, content: '' }
}

const note = createNote('示例文档')
\`\`\`

## 数学公式

行内公式：$E = mc^2$。

独立公式：

$$
\\int_a^b f(x)\\,dx = F(b) - F(a)
$$

`
