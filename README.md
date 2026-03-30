# AIDA (AI-Driven Security Assessment Platform)

AIDA 是一个本地优先的 AI 驱动安全测试工作区，旨在为各种 AI 助手（如 Claude、Kimi 等）提供可以直接执行安全测试命令的隔离环境和工作流。

基于标准 MCP (Model Context Protocol) 协议，AIDA 能够连接前端看板、后端 API、隔离的测试容器及 AI 助手，使其具备真实环境中的命令执行能力和持久化上下文记忆。

---

## 🏗 核心架构概览

AIDA 由以下关键组件构成：

- **Frontend (React + Vite)**: 位于 `http://localhost:5173`。提供可视化的测试管理面板，用于管理测试项目 (Assessment)、凭据、卡片 (Findings/Notes) 以及查看 AI 命令执行历史。
- **Backend (FastAPI + SQLAlchemy + WebSocket)**: 位于 `http://localhost:8181`。负责核心业务逻辑，处理 WebSockets 实时通讯与状态同步，并承载 MCP Server。核心链路逻辑位于 `backend/api/websocket.py` 与 `backend/services/ai_agent_service.py`。
- **MCP Server & Actions**: 通过 MCP 协议向 AI 暴露具体能力（如 `execute_command`, `add_card`, `add_recon_data`），工具定义位于 `backend/mcp_custom/modules/mcp_tools.py` 与 `backend/mcp_custom/modules/mcp_handlers.py`。
- **Workspace (工作区)**: 通过 `docker-compose.yml` 挂载主机目录至测试容器内。**宿主机对应目录通常为 `~/.aida/workspaces`。** 
  - **重要提醒**：请勿手动清理或修改该目录中的评估数据，否则可能导致 AI 丢失上下文乃至系统状态异常。
- **Command Approval (命令审批系统)**: 核心位于 `backend/api/pending_commands.py`。AI 发起的终端命令请求会通过审批系统进行拦截，提供多层级审批模式，防止高危风险被不慎执行。

---

## 控制台核心特性

### 网络节点拓扑图 (Recon Topology View)
位于前端评估详情页的 Reconnaissance 面板。点击 **View** 按钮后，平台将结构化表格数据转化为基于 `react-force-graph-2d` 的动态节点拓扑阵列。
- **资产关系映射**：引擎自动将目标解析为具有层级关联的 Domain、Subdomain、IP、Hostname 与 Service 端点，通过连线 (Link) 呈现网段及服务的依附关系。
- **风险感知渲染**：根据探测出的高危级别 (CRITICAL / HIGH 等)，节点会叠加对应颜色的光环效果及发现 (Finding) 数量角标。
- **聚焦与编辑机制**：支持点击节点穿透查看资产明细、绑定的漏洞卡片，并在侧边栏直接执行二次编辑更新。

### Chat with me (内置 Web 面板终端)
在底层对接标准 MCP 提供外部 CLI 挂载的同时，平台内置了一个轻量化的 AIDA Terminal。
- **沉浸式交互层**：直接利用页面悬浮终端唤起自然语言输入，将“命令行敲打”转为“对话式”（Chat with me）驱动。
- **事件流捕获**：经由 `useWebSocket` 持久化订阅，将 AI 的系统级思考 (`agent_thought`)、具体命令下发 (`agent_exec`) 和回显输出聚合至同一个终端流进行打印。
- **适用场景**：适用于局域网或单兵测试时，作为无需外接组件的快速调度入口。

## AI 接入模式

AIDA 支持两种完全不同的 AI 接入方式：

1. **终端 CLI 模式 (推荐，通过 `aida.py` 启动)**
   - **工作原理**：将 AIDA 平台作为标准的 MCP Server，暴露给外部的官方 AI 客户端（如 Claude Code 或 Kimi CLI）。
   - **适用场景**：推荐在复杂的测试评估中使用此模式，能直接利用官方客户端更稳定的长上下文处理和推理能力。

2. **Web 面板内置终端模式**
   - **工作原理**：直接在前端页面的 AIDA Terminal 组件内输入对话，由后端 `ai_agent_service.py` 读取系统环境的 `OPENAI_API_KEY` 进行调度对接。
   - **适用场景**：适合在不便启动 CLI 或需进行单步探测时，提供开箱即用的 Web 聊天入口。

---

## 🚀 本地快速启动

### 依赖环境
- **Docker & Docker Compose**
- **Python 3.10+ & Node.js 18+** (仅在非容器化本地开发时需要)
- **AI 客户端** (如 Claude Code, Kimi CLI 等)

### 1. 启动平台服务

在项目根目录下通过内置脚本启动容器栈：

```bash
./start.sh
```

- 该脚本会检查 Docker 状态并在需要时初始化相关 `.env` 文件（若缺失）。
- 首次启动会指引您选择默认的测试容器模式 (内置的 `aida-pentest` 或第三方容器 `Exegol`)。
- 启动后，系统将拉起 `postgres`、`backend`、`frontend` 及选定的测试容器。
- 浏览器访问前端地址：`http://localhost:5173` (后端 API 运行在 `http://localhost:8181`)。

### 2. 连接与启动 AI

首选并推荐使用项目根目录下的 `aida.py` 脚本来快速关联支持的 CLI 工具（以 Claude Code / Kimi 为例）：

```bash
python3 aida.py --assessment "Your_Project_Name"
```

该脚本将自动检测客户端并组装 MCP 配置文件、载入 Assessment 上下文及注入初始化提示词。若是其他类型的 AI 客户端接入，请参阅安装文档的手动配置方式。

---

## 💻 关键配置说明

- **`.env` 文件**: 控制诸如端口和 DB 密钥等信息，由脚本默认初始化生成。物理隔离不强的情况或需公开共享服务时，请务必修改默认项。
- **`docker-compose.yml`**: 管理各容器生命周期及网络路由。其中至关重要的绑定信息为 `${HOME}/.aida/workspaces:/workspace`，保证其权限且不被删除覆盖。

---

## 📚 文档索引

更详细的指引与手册位于 `Docs/` 目录：
- [**INSTALLATION.md**](Docs/INSTALLATION.md): 本地部署平台与多种 AI 客户端接入配置指南。
- [**USER_GUIDE.md**](Docs/USER_GUIDE.md): 具体操作手册，涵盖流程主线及功能使用规范。

---

## ⚠️ 安全与使用提示

- **无默认鉴权**：目前基于本地单兵场景设计，前端面板与后端组件无原生存取控制与鉴权机制，严禁将系统端口对外网开放映射。
- **仅限授权测试**：通过平台或借助 AI 环境发起的扫描、渗透等评估行为，请保证资产已被您或合作方合法授权。
- **数据留存规则**：工作区数据本地挂载于 `~/.aida/workspaces`，此目录承载了项目上下文与所有证据资产，请注意管控误删。

---

## 📄 License

**AGPL v3**

项目遵从 AGPL v3 开源协议发布。允许在本地直接运行与二次开发。若是将带有修改的派生版本发布为网络在线服务供第三方使用，请依据协议进行源码公开。
