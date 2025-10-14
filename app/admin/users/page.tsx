"use client";
import { useEffect, useState } from "react";

export default function AdminUsersPage() {
  const [key, setKey] = useState("");
  const [users, setUsers] = useState<any[]>([]);
  async function load() {
    const headers:any={}; if (key) headers['x-admin-key']=key;
    const res = await fetch('/api/admin/users', { headers });
    const data = await res.json();
    setUsers(data.users||[]);
  }
  useEffect(()=>{ load(); },[]);
  async function save(u:any) {
    const headers:any={'Content-Type':'application/json'}; if (key) headers['x-admin-key']=key;
    await fetch('/api/admin/users', { method:'POST', headers, body: JSON.stringify(u) });
    await load();
  }
  async function del(id:number) {
    const headers:any={}; if (key) headers['x-admin-key']=key;
    await fetch(`/api/admin/users?id=${id}`, { method:'DELETE', headers });
    await load();
  }
  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center gap-2">
        <div className="font-semibold">用户管理</div>
        <input className="px-2 py-1 bg-slate-900 border border-slate-700 rounded" placeholder="Admin Key" value={key} onChange={e=>setKey(e.target.value)} />
        <button onClick={load} className="px-3 py-1 bg-slate-700 rounded">刷新</button>
        <a href="/admin" className="px-3 py-1 bg-slate-700 rounded">返回</a>
      </div>
      <table className="w-full text-sm">
        <thead className="text-slate-400"><tr>
          <th>ID</th><th>用户名</th><th>等级</th><th>Exp</th><th>Money</th><th>ATK</th><th>DEF</th><th>HP</th><th>HP_MAX</th><th>Dodge</th><th>Crit</th><th>Job</th><th>操作</th>
        </tr></thead>
        <tbody>
          {users.map(u => (
            <tr key={u.id} className="border-b border-slate-700">
              <td>{u.id}</td>
              <td><input defaultValue={u.username} className="w-28 bg-slate-900 border border-slate-700 rounded px-1" onChange={e=>u.username=e.target.value} /></td>
              <td><input type="number" defaultValue={u.level} className="w-16 bg-slate-900 border border-slate-700 rounded px-1" onChange={e=>u.level=+e.target.value} /></td>
              <td><input type="number" defaultValue={u.exp} className="w-20 bg-slate-900 border border-slate-700 rounded px-1" onChange={e=>u.exp=+e.target.value} /></td>
              <td><input type="number" defaultValue={u.money} className="w-24 bg-slate-900 border border-slate-700 rounded px-1" onChange={e=>u.money=+e.target.value} /></td>
              <td><input type="number" defaultValue={u.atk} className="w-16 bg-slate-900 border border-slate-700 rounded px-1" onChange={e=>u.atk=+e.target.value} /></td>
              <td><input type="number" defaultValue={u.def} className="w-16 bg-slate-900 border border-slate-700 rounded px-1" onChange={e=>u.def=+e.target.value} /></td>
              <td><input type="number" defaultValue={u.hp} className="w-16 bg-slate-900 border border-slate-700 rounded px-1" onChange={e=>u.hp=+e.target.value} /></td>
              <td><input type="number" defaultValue={u.hp_max} className="w-16 bg-slate-900 border border-slate-700 rounded px-1" onChange={e=>u.hp_max=+e.target.value} /></td>
              <td><input type="number" defaultValue={u.dodge_index} className="w-16 bg-slate-900 border border-slate-700 rounded px-1" onChange={e=>u.dodge_index=+e.target.value} /></td>
              <td><input type="number" defaultValue={u.crit_index} className="w-16 bg-slate-900 border border-slate-700 rounded px-1" onChange={e=>u.crit_index=+e.target.value} /></td>
              <td><input defaultValue={u.job||''} className="w-24 bg-slate-900 border border-slate-700 rounded px-1" onChange={e=>u.job=e.target.value} /></td>
              <td className="space-x-2">
                <button className="px-2 py-0.5 bg-emerald-600 rounded" onClick={()=>save(u)}>保存</button>
                <button className="px-2 py-0.5 bg-rose-600 rounded" onClick={()=>del(u.id)}>删除</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

