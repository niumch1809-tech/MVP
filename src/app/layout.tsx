import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI 成本核验平台 MVP",
  description: "上传 BOM 报价表，解析、对比并生成成本核验报告。"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
