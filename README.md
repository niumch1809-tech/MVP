# AI 成本核验平台

面向制造业/硬件项目的 BOM 成本核验 MVP，用于多供应商 BOM 报价上传、解析、标准化展示和物料级成本对比。

## 当前能力

- 上传 Excel / CSV 格式的供应商 BOM 或历史 BOM。
- 自动识别常见 BOM 字段并映射到标准字段。
- 支持宽表格式报价：同一 BOM 中多列供应商报价可拆成多供应商明细。
- 按供应商、品类、物料搜索进行筛选。
- 供应商支持多选，便于 2-3 家或更多供应商并排对比。
- 全部品类视图展示品类横坐标的供应商成本对比。
- 单品类视图展示该品类下物料级供应商单价对比。
- 保留原始字段和来源行，便于追溯。
- 支持导出当前筛选结果为 CSV。

## 技术栈

- Next.js App Router
- React + TypeScript
- Tailwind CSS
- TanStack Table
- Recharts
- SheetJS / xlsx
- 本地 JSON 存储

## 本地运行

```bash
npm install
npm run dev
```

打开：

```text
http://localhost:3000
```

## 常用命令

```bash
npm run typecheck
npm run build
```

## 项目说明

后续开发请先阅读 `AGENTS.md`。本项目不是泛数据分析平台，所有功能应围绕 BOM、物料、供应商报价、历史价格和成本核验展开。
