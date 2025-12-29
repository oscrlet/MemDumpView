# Advanced Memory Dump Viewer

这是一个基于 Vue 3, 使用 ECharts 为核心构建的内存分析页面，可以用于分析堆内存状态和页面分布。

---

## User Guide

### 1. 快速上手
- **安装依赖**：在项目根目录下运行 `npm install`。
- **启动应用**：运行 `npm run dev` 启动开发服务器。
- **访问应用**：在浏览器中打开命令行输出的本地地址（通常为 `http://localhost:5173`）。
- **导入数据**：
    - **方法一**：将 JSON/MB 数据文件直接拖入浏览器窗口任何位置。
    - **方法二**：点击左侧边栏顶部的 `+` 按钮选择文件（支持 `.json` 和 `.mb`）。
- **模拟数据**：如果您没有现成的数据，可以运行 `node mock/generate.cjs` 生成示例文件进行体验。

### 2. 交互逻辑
- **趋势分析**：
    - **缩放与平移**：使用鼠标滚轮或顶部滑块进行时间轴缩放。
    - **数据查看**：悬停在曲线上查看该时间点的内存占用及相对初始点的持续时间。
- **选点与管理**：
    - **数据采样**：点击折线图上的任意点，该点会被添加到右侧边栏的“已选点”列表。
    - **重命名/删除**：在侧边栏项上右键或点击相应图标可对序列/采样点进行管理。
- **内存布局对比**：
    - **开启对比**：点击右侧边栏顶部的“网格”图标，展开多维内存布局视图。
    - **热力图解读**：每个正方形代表一个内存页面（Page），颜色深浅代表该页面的占用率。
- **页面详细信息**：
    - **8-byte 视窗**：在对比视图中点击任意页面，将弹出该页面的内部布局。
    - **分配情况**：该视图展示了 8 字节分辨率下的内存分配细节，红色代表已分配，灰色代表空闲。

---

## Developer Guide

### 1. 技术栈
- **核心框架**：Vue 3 (Composition API)
- **状态管理**：Pinia
- **可视化库**：ECharts 5.x (由主图表的 Canvas 模式和布局图的 Canvas 模式驱动)
- **构建工具**：Vite + TypeScript
- **后台处理**：Web Workers (用于大数据量 JSON 的异步解析)

### 2. 文件结构 breakdown
```text
src/
├── components/          # 组件目录
│   ├── chart/           # 主时间轴图表组件 (ECharts 封装)
│   ├── memLayout/       # 内存热力图及页面详情组件
│   ├── sidebar/         # 侧边栏及管理项组件
│   └── FileDropZone.vue # 全局拖拽上传遮罩
├── store/               # Pinia 状态中心 (管理序列、选点及全局配置)
├── services/            # 业务辅助逻辑 (文件处理、Worker 调度)
├── utils/               # 通用工具 (颜色算法、Hash 生成)
├── types/               # TypeScript 类型定义中心
└── workers/             # 多线程解析逻辑
```

### 3. 组件构成与职责
| 组件 | 目录 | 关键职责 |
| :--- | :--- | :--- |
| **App.vue** | `src/` | 根布局，管理侧边栏、主视图和全局弹窗。 |
| **EChartsChart** | `chart/` | 处理时间序列渲染，核心逻辑包括**相对时间转换**和 **LTTB 采样优化**。 |
| **EChartsMemLayout** | `memLayout/` | 将 **RLE Bitmaps** 解析并渲染为热力图，展示页面分布及生存率。 |
| **PageDetailViewer** | `memLayout/` | 高分辨率 Canvas 渲染，展示页面内部的 8-byte 分配位图（基于 RLE 流解码）。 |
| **Sidebar** | `sidebar/` | 复用组件，通过 `type` 区分“序列管理”与“选点管理”。 |
| **FileDropZone** | `components/` | 监听全局拖放事件，并分发文件到 `fileHandler`。 |

### 4. 数据流与架构
应用采用**集中式状态流**。
1. `fileHandler` 调用 `ImportWorker` 异步读取数据。
2. 数据存储在 `Pinia Main Store`。
3. `EChartsChart` 与 `Sidebar` 订阅 Store 修改，实现实时响应。
4. 所有的 UI 色彩均基于 `utils/color.ts` 的 Hash 算法保持一致性。

---

## 📄 数据契约
本应用采用 **Memory Dump V2** 标准，支持以下格式：
- **JSON (.json)**: 推荐使用优化后的 RLE Hex Bitmap 格式以减小体积。
- **Binary (.mb)**: 极度压缩的二进制格式，支持 Gzip 和 Varint 编码。

详细的说明及示例请参阅：
- [数据格式指南](./mock/DATA_FORMAT.md)
