# AI 成本核验平台 MVP 初始化方案

## 推荐项目目录结构

```text
src/
  app/
    api/bom/upload/route.ts       # 上传并解析 Excel/CSV
    api/bom/records/route.ts      # 本地 BOM 记录查询与清空
    api/bom/analysis/route.ts     # mock 成本分析报告
    page.tsx                      # MVP 工作台
  components/
    BomTable.tsx                  # TanStack Table 明细表
    CostDashboard.tsx             # Recharts 图表与风险事项
  lib/
    bom/
      analyzer.ts                 # 价差、缺项、字段缺失规则
      field-map.ts                # 中英文表头映射
      normalize.ts                # 物料名称标准化
      parser.ts                   # SheetJS 解析
    storage.ts                    # 本地 JSON 存储
  types/
    bom.ts                        # 数据模型
data/
  bom-records.json                # 运行后生成，本地样本数据
```

## 数据模型设计

- `BomFileRecord`: 一次上传记录，包含文件名、供应商、类型、上传时间、行数和解析后的 BOM 行。
- `CanonicalBomRow`: 标准 BOM 明细行，统一料号、物料名、标准名、规格、单位、用量、单价、总价、币种和原始行。
- `SupplierSummary`: 按供应商和文件类型聚合的金额、文件数、行数。
- `CostIssue`: 成本风险事项，覆盖价差、异常/缺失用量、缺项和字段不完整。
- `AnalysisReport`: 报告生成时间、供应商汇总、风险事项和 Markdown 报告正文。

## 第一版 MVP 功能清单

- 上传 `.xlsx`、`.xls`、`.csv` 文件。
- 支持供应商报价和历史 BOM 两类文件。
- 自动识别常见中英文表头并标准化字段。
- 标准化常见物料名称，如电阻、电容、IC、连接器。
- 展示解析后的 BOM 明细，支持表头排序。
- 按供应商展示金额对比图。
- mock 成本核验规则：供应商价差、历史 BOM 缺项、关键字段缺失。
- 生成半自动 Markdown 成本分析报告。
- 本地 JSON 存储，支持一键清空样本。

## 分阶段开发计划

### 阶段 1：可运行骨架

- Next.js + TypeScript + Tailwind 初始化。
- API Routes 完成上传、记录查询、分析报告。
- SheetJS 解析 Excel/CSV。
- 单页工作台闭环上传、解析、展示。

### 阶段 2：核验规则增强

- 增加异常用量识别：历史均值、供应商报价均值、单位换算。
- 增加物料匹配置信度，区分同名不同规格。
- 支持手动确认字段映射和物料标准名。

### 阶段 3：报告与协作

- 报告导出为 PDF/Excel。
- 风险事项状态流转：待确认、已确认、已忽略。
- 增加项目维度、版本维度和上传批次管理。

### 阶段 4：AI 接口接入

- 接入真实模型，对异常原因和议价建议生成解释。
- 用 embedding 或规则+模型混合方式做物料名称归一。
- 对供应商报价附件做多表、多页、多币种解析。

### 阶段 5：生产化

- SQLite 迁移 PostgreSQL。
- 增加用户、权限、审计日志。
- 文件对象存储、后台任务队列、批量导入进度。
