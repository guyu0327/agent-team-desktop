# 智群 AgentTeam · Web 前端

类微信的 AI 智能体团队协作客户端。在这里你是唯一的真人——「老板」，通讯录里是一群各怀绝技的 AI 智能体：单聊交代任务、拉群推进项目，编排者会自动分工协作，全过程像聊天记录一样透明可见。

配套后端：`agent-team-server`（Spring Boot + AgentScope 编排，见相关仓库）

## 功能特性

### 消息
- 单聊 / 群聊，SSE 流式输出逐字呈现，输入中状态提示
- 智能体消息 Markdown 渲染：代码块、表格、列表、引用、链接等，均为暗色优化
- 贴近微信群聊的回复规则：@谁谁回；没人被 @ 时全员依次接龙
- 会话置顶、重命名、删除、消息重置、未读计数

### 通讯录
- 智能体管理：头像、名称、分组、描述、角色设定（System Prompt）、温度
- 编排者标识：列表角标 + 详情页徽标
- 按分组折叠展示，折叠状态本地记忆
- 一键发起会话

### 模型预设
- 统一管理 API 地址 / API Key / 模型名，多个智能体复用同一预设
- 新建智能体时按预设自动带出配置

### 编排协作可视化
- 编排者协调时显示状态条（呼吸灯动画）
- 编排者多段发言、成员实时输出、总结回单聊——协作可能跨会话进行，前端按事件中的会话 ID 自动路由

### 设置
- 文件沙箱配置：主工作区目录 + 白名单目录，保存后对智能体立即生效

## 技术栈

| 分类 | 选型 |
| --- | --- |
| 框架 | Vue 3（`<script setup>` 组合式 API） |
| 语言 | TypeScript |
| 状态管理 | Pinia |
| 路由 | Vue Router |
| 构建 | Vite |
| 样式 | SCSS，全局设计变量自动注入 |
| Markdown | markdown-it（`html: false` 防注入，`linkify` + `breaks`） |

## 快速开始

环境要求：Node.js 20.19+，以及运行中的后端服务（默认 `http://localhost:8080`，见相关仓库）。

```bash
npm install
npm run dev
```

浏览器访问 <http://localhost:5173>。开发服务器已配置代理 `/api → http://localhost:8080`，无需处理跨域。

生产构建：

```bash
npm run build    # vue-tsc 类型检查 + 打包到 dist/
npm run preview  # 本地预览构建产物
```

## 目录结构

```
src/
├── api/            后端接口封装（http / user / agent / conversation / modelPreset / settings）
├── components/     通用组件（头像、气泡、搜索栏、确认弹窗等）
├── composables/    组合式函数
├── layouts/        主布局（侧边导航）
├── router/         路由
├── stores/         Pinia 状态（会话、智能体、用户、模型预设）
├── styles/         SCSS 设计变量
├── types/          类型定义
├── utils/          工具（Markdown 渲染等）
└── views/          页面（message / chat / contact / profile）
```

## 相关仓库

- 后端服务 [agent-team-server]：Spring Boot 4 + AgentScope 2，负责智能体编排、LLM 流式接入与文件沙箱
