# Changelog

## 0.1.0

首个发布版，基于 `@deepseek-ai/dsh-client-ui-model-selection` `0.2.1-rc.3` 的构建产物 fork。

**分组与折叠**

- 菜单打开即只展开「当前模型所在分组」，其余显示「名称 + 模型数 + chevron」并可点标题展开/收起，支持多组同时展开。
- 保留官方 `MenuGroup` 结构，只把标题换成按钮（`aria-expanded`、`aria-label` 插值），模型行索引与 `visibleModels` 严格一致。
- 分组标题不做吸顶（见 README「已知限制」）。

**搜索**

- 搜索框常驻，打开菜单直接进列表并聚焦。
- 匹配模型名、模型 ID、分组名；搜索期间所有命中分组强制展开；Esc 三级阶梯（清空 → 根面板 → 关闭）。
- 打开菜单时重置折叠状态与搜索词。

**收藏**

- 空搜索时顶部渲染「收藏」组，键为 `路由 ID + 模型 ID`，存 `localStorage`（`dsh-model-picker-groups.favorites`），容错读取、去重、失效条目静默跳过。
- 星标为独立按钮（不进 `itemRefs` 键盘序列），`aria-pressed`，仅 hover / 已收藏 / 聚焦时显示。
- 收藏组可折叠，与供应商组共用同一套渲染与索引。

**同名路由合并**

- 按 `displayName`（去空格、忽略大小写）合并多 key 路由；模型行记录真实路由 id，组内重复模型 id 追加 ` · <路由 id>`。
- 对话框选择器与 `/model` 命令弹窗共用合并结果。

**其它**

- 新增 `dsh.bundle` 声明与随包生成的 `cordis.patch.yml`，支持通过插件管理器 / `dsh plugin add` 安装。
- 推理等级：点底部推理等级徽标直达列表，再点收起。
- 模型页与推理等级页均有返回键（并入搜索行），Esc 仍可用。
- `scripts/build.py`：从 `app.asar` 重放官方 bundle，校验 11 段 region、替换 5 段、全局改名；支持 `--emit` / `--check`、`--asar` 与环境变量定位安装目录。
