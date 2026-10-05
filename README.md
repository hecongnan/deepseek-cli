# DeepSeek CLI 🐋

基于 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 和 [dsh-tui v0.13.0](https://github.com/sagmans/dsh-tui) 的终端增强版。提供简洁的对话环境、DeepSeek 鲸鱼欢迎区、输入栏下方的模型与命令交互，以及实时会话状态。

当前 CLI 版本为 **1.2.1-local**，TUI 包版本保留 **0.13.0**，已验证 Harness **0.2.0-rc.2**。这是社区衍生源码项目；增强版未发布到 npm。

## 功能

- 蓝色 `> 提问`、正文回答、可展开的思考与工具详情；欢迎区随对话滚动。
- 模型、推理强度、命令、历史与主题选择器在输入栏下方展开，关闭后保留草稿。
- 输入栏下方显示当前模型、上下文剩余比例、累计 Token 输入/输出及已上报缓存比例。
- `exec`、`resume`、`review`、`sessions`、`models`、`doctor`、`config` 等 CLI 入口。
- 命令面板、文件引用、权限询问、会话恢复、计划和后台任务。
- 键盘即时反馈、无过渡动画；窄窗口与极低高度保留可用输入。

## 安装

需要 Node.js **>=22.19**、pnpm、Git 和真实终端。先安装并配置 **Harness 0.2.0-rc.2**，再安装此源码插件。模型凭据按 Harness 提供商配置；不要把凭据放进仓库。

```sh
npm install -g @deepseek-ai/dsh@0.2.0-rc.2
git clone https://github.com/hecongnan/deepseek-cli.git
cd deepseek-cli
pnpm install --frozen-lockfile
pnpm run build
dsh plugin --profile tui add "$PWD"
dsh --profile tui
```

源码插件保持 `@sagmans/dsh-tui` 名称，以便 Harness 解析其插件入口。不要同时挂载另一个同名 TUI 副本。链接安装依赖这个 checkout，之后请保留目录。

可选：应用本项目的简洁蓝色偏好。此文件保留必要的启动映射。仅在没有现有偏好文件时复制；已有配置可对照示例手动合并：

```sh
DSH_PROFILE_HOME="${DSH_HOME:-$HOME/.dsh}/profiles/tui"
if [ ! -e "$DSH_PROFILE_HOME/cordis.patch.yml" ]; then
  cp examples/cordis.patch.yml "$DSH_PROFILE_HOME/cordis.patch.yml"
fi
```

要使用增强 CLI，创建一个不覆盖原 Harness 命令的入口：

```sh
mkdir -p "$HOME/.local/bin"
ln -s "$PWD/cli/main.mjs" "$HOME/.local/bin/deepseek-cli"
# 确保 ~/.local/bin 在 PATH 中。
deepseek-cli --help
deepseek-cli doctor
```

如果已有同名入口，`ln` 会拒绝覆盖。需要 `dsh` 名称时可在当前 shell 中使用 `alias dsh=deepseek-cli`；随后新增插件仍可调用原 Harness 的完整路径，或使用增强版的 `dsh plugin` 透传。

`DSH_HOME` 可指定隔离的 Harness home，默认 `~/.dsh`。仓库只含源码和配置示例，不包含个人凭据、会话、依赖目录或本机安装/回滚记录。

## 常用命令

以下示例假设已设置 `alias dsh=deepseek-cli`：

```sh
dsh                                  # 当前终端开始会话
dsh -C ~/project -m deepseek-v4-pro "检查项目"
dsh resume                           # 历史选择器
dsh resume --last                    # 当前目录最近的主会话
dsh resume "会话标题" --all            # 跨项目按唯一标题/ID 恢复
dsh exec "检查当前项目的测试"           # 单次任务并退出；别名 e
cat request.txt | dsh exec --json -   # Harness 原生 JSONL
dsh review "重点检查错误处理"
dsh sessions --all --json
dsh models
dsh doctor
dsh config
```

`-C` / `--cd` / `--cwd` 指定目录。恢复会话沿用已存模型，`-m` 主要用于新交互会话。模型名称和推理强度取自实际提供商配置。

| 输入 / 快捷键 | 功能 |
| --- | --- |
| `/model` | 切换模型，随后选择提供商支持的推理强度 |
| `/commands`、Ctrl+Shift+P、Ctrl+X 后 K | 搜索命令面板 |
| `/permissions`、`/approvals` | 权限策略选择 |
| `/keymap` | 搜索快捷键 |
| `/status` | 查看完整用量与会话状态 |
| `/diff`、`/review`、`/init` | 查看 Git 变更、请求只读审查、编写项目指令 |
| `/new`、`/resume`、`/fork`、`/rename` | 会话管理 |
| `/clear` | 新建会话并清空显示，保留旧记录 |
| `/screen-clear` | 只清空显示，保留上下文 |
| `/plan`、`/compact`、`/todo` | 计划与上下文管理 |
| `/ps`、`/agent` | 后台任务与子代理 |
| Ctrl+O | 复制最近回答 |
| Ctrl+Shift+O、Ctrl+Alt+O | 展开/折叠工具详情 |
| Shift+Tab | 展开/折叠思考 |
| Ctrl+R、↑↓ | 搜索/浏览提示历史 |
| Enter、Shift+Enter、`@` | 发送、换行、文件引用 |
| Esc、Ctrl+C、Ctrl+D | 停止/取消、空闲退出、退出 |

选择器内：↑↓ 选择、Enter 确认、Esc 返回。部分终端占用 Ctrl+Shift 组合键时，使用表中的备用组合。

### 状态行

```text
deepseek-flash (high) · 上下文剩余 90% · Token 入10.3k / 出3.1k · 缓存87%
```

以上仅为排版示例。上下文占用优先使用 Harness 投影，百分比向下取整；模型切换后的容量以随后上报的数据为准。Token 为当前会话累计计量，输入包含非缓存输入、缓存读取和缓存写入；通常在请求上报用量后更新。缺少数据时显示 `—`，已初始化零值显示 0。窄屏按优先级截断，`/status` 可查看完整值。

## 离线预览与开发

```sh
pnpm run preview                     # 合成对话、状态行和模型选择器；不请求模型
# Ctrl+P 打开示例模型列表，Shift+Tab 展开思考，Ctrl+C 退出。
pnpm run typecheck
pnpm test
pnpm run test:cli
pnpm run test:release
node tools/pack-smoke.mjs
pnpm run test:terminal
node tools/harness-matrix.mjs
```

在 GitHub 上传前，界面版本已通过 **2184 项单元/快照测试、5 项 CLI 测试、31 项发布辅助测试**、类型检查、构建和原生 PTY 检查。离线预览中的模型、回答、Token 和比例是合成数据，不代表 API 实测。CI 另外检查依赖签名、打包与 Docker 中的消费者安装。

修改 `src/` 后需要重新构建 `lib/`。真实模型验证须使用隔离 `DSH_HOME`。上游详细配置与排错见 [README.upstream.md](README.upstream.md)，开发流程见 [DEVELOPMENT.md](DEVELOPMENT.md)。

## 兼容与来源

命令名称、部分快捷键与呈现方式参照 Codex CLI；欢迎与对话层次也参考 Claude 风格。执行引擎为 DeepSeek Harness。JSONL 使用 Harness 原生事件，账号、云任务与事件协议没有逐项兼容；`-p` 仍为 print，`-c` 仍为 continue。

保留 [dsh-tui](https://github.com/sagmans/dsh-tui) 的 MIT 许可与来源记录（基线提交 `31ed806`）；见 [LICENSE](LICENSE)。鲸鱼由 [DeepSeek 官方 SVG](https://github.com/deepseek-ai/DeepSeek-V2/blob/main/figures/logo.svg) 转为终端 Braille，品牌属于 DeepSeek；见 [assets/README.md](assets/README.md)。本项目不代表 DeepSeek、Anthropic 或 OpenAI 的官方产品。

此仓库只分发源码，`package.json` 标记为 `private`，没有启用 npm 发布工作流；包名保留仅供插件解析。GitHub 源码部署不等同于 npm 发布或云端运行 CLI。
