# AIDA 本地部署与安装指南

本文档介绍如何在本地机器部署 AIDA 平台，并将其与 AI 助手连接。

---

## 1. 基础依赖检查

开始前，请确认宿主机环境已安装：

- **Docker 与 Docker Compose** (必需)
- **Python 3.10+** (用于运行 AIDA CLI 脚本)
- 受支持的 **AI Client CLI**，推荐使用 **Claude Code** 或 **Kimi CLI**。

> **关于测试容器支持：** 
> 系统默认提供并支持自行拉起轻量的 `aida-pentest` 测试容器。如果需要涵盖面更全且专业的第三方镜像环境，您可以在启动平台时配置指定为 `Exegol` 镜像。

---

## 2. 启动平台服务

在项目根目录下通过内置脚本编排启动工具栈：

```bash
./start.sh
```

**首次启动交互：**
- 脚本会自动检查当前运行环境的 Docker 组件并在环境缺失设置时初始化生成 `frontend/.env` 与 `backend/.env`。
- 控制台会提示您选用哪种渗透测试基础容器模式：
  1. `aida-pentest`: 系统默认构建选项，无需前置安装即可启动，涵盖测试常备组件。
  2. `Exegol`: 对接独立的第三方程式化安全工作环境系列容器。
- 随后脚本将自动编排并启动 `postgres`、`backend`、`frontend` 以及目标业务容器平台。

**验证服务：**
打开您的浏览器，访问默认前端入口 [http://localhost:5173](http://localhost:5173)。页面将加载平台主要工作看板，同时平台后端默认运行在 `http://localhost:8181`。

---

## 3. 连接您的 AI 客户端

让 AI 接管评估动作的前提是构建 MCP 通路，将本地分析权限给到大语言模型客户端。**首选且推荐的方法是利用根目录捆绑的 `aida.py`。**

### 推荐方式：使用 aida.py

通过终端调用 `aida.py`，程序会自动扫描并识别 `claude` (Claude Code) 或 `kimi` (Kimi CLI) 等主流命令客户端的位置，随后执行初始化映射及参数挂载。

```bash
# 自动检测本地 CLI 并针对具体 assessment 项目创建测试对话
python3 aida.py --assessment "MyTarget"

# 如果存在多个客户端，也可强制指定驱动形式：
python3 aida.py --assessment "MyTarget" --cli claude
python3 aida.py --assessment "MyTarget" --cli kimi
```

当 AI CLI 成功启动并在后台完成 MCP 通讯确认后（通过 `backend/mcp_custom/modules/` 引出 API），系统级提示词就会引导 AI 自动拉取工作目录资料。

### 其他 AI 客户端的支持（手动导入 MCP）

除了 CLI 之外，部分图形桌面客户端依然可以通过常规手动编辑 JSON 环境配置文件的方式将平台引作 MCP Server。

在目标客服端配置文件中填加下方节点定义（替换为您当前 AIDA 克隆路径的完整绝对路径）：

```json
{
  "mcpServers": {
    "aida-mcp": {
      "command": "/bin/bash",
      "args": [
        "/absolute/path/to/AIDA/start_mcp.sh"
      ]
    }
  }
}
```

重新加载客户端后，通过加载配套预设上下文开始正式指令驱动流程即可。

---

## 4. 验证与排错 (Troubleshooting)

如果在启动和链接过程中遇到中断操作，请顺次检查：

- **Docker 服务检查**：在项目目录执行 `docker compose ps` 以查明 `aida-postgres`、`aida-backend`、`aida-frontend` 乃至指定容器是否存在启动崩溃或是 Error 报错返回。
- **端口冲突排查**：宿主机默认端口为 `8181`（后）与 `5173`（前）。若遭其他服务独占请停用冲突方再执行启动脚本或手动更置相关 YAML及 `.env`。
- **工作区及挂载读取**：评估日志由容器直接持久化投放到 `~/.aida/workspaces`。在使用 `aida.py` 拉拔项目上下文时，如果不存在此路径或文件写读受阻，可溯及查实本地路径挂载与权限状态是否正常。
