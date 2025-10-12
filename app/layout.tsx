import "./globals.css";
import React from "react";

export const metadata = {
  title: "墨客 WordWar",
  description: "多人在线文字聊天室网页游戏 (MVP)",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body className="h-screen">
        <div className="h-full flex flex-col">
          <header className="px-4 py-2 border-b border-slate-700 bg-slate-800/60 backdrop-blur">
            <div className="w-full flex items-center justify-between">
              <h1 className="text-lg font-semibold">墨客 · WordWar</h1>
              <a href="/chat" className="text-sm text-slate-300 hover:text-white">进入聊天室</a>
            </div>
          </header>
          <main className="flex-1 w-full p-4">{children}</main>
        </div>
      </body>
    </html>
  );
}
