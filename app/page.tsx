"use client";
import { useEffect, useState } from "react";

export default function HomePage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"login" | "register">("login");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (token) {
      window.location.href = "/chat";
    }
  }, []);

  async function submit() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "请求失败");
      if (data.token) localStorage.setItem("token", data.token);
      window.location.href = "/chat";
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-md mx-auto bg-slate-800 p-6 rounded-lg border border-slate-700">
      <h2 className="text-xl font-semibold mb-4">
        {mode === "login" ? "登录" : "注册"}
      </h2>
      <div className="space-y-3">
        <input
          className="w-full px-3 py-2 rounded bg-slate-900 border border-slate-700 outline-none"
          placeholder="用户名"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
        <input
          className="w-full px-3 py-2 rounded bg-slate-900 border border-slate-700 outline-none"
          type="password"
          placeholder="密码"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error && <div className="text-red-400 text-sm">{error}</div>}
        <button
          onClick={submit}
          disabled={loading}
          className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 rounded disabled:opacity-60"
        >
          {loading ? "请稍候..." : mode === "login" ? "登录" : "注册"}
        </button>
        <div className="text-sm text-slate-400">
          {mode === "login" ? (
            <span>
              没有账号？
              <button className="text-indigo-400 ml-1" onClick={() => setMode("register")}>去注册</button>
            </span>
          ) : (
            <span>
              已有账号？
              <button className="text-indigo-400 ml-1" onClick={() => setMode("login")}>去登录</button>
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

