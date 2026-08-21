import "./globals.css";

export const metadata = {
  title: "重要讲话智能匹配与政企沟通材料平台 · M1 演示",
  description:
    "企业画像 → 重要讲话证据 → 企业话语资产 → 场景化材料 的人工可控工作流（M1 本地演示）",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body className="bg-paper font-sans text-ink antialiased">{children}</body>
    </html>
  );
}
