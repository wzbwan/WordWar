"use client";
import { useEffect, useState } from "react";

export default function AdminJobsPage() {
  const [key, setKey] = useState("");
  const [jobs, setJobs] = useState<any[]>([]);
  async function load() {
    const headers:any={}; if (key) headers['x-admin-key']=key;
    const res = await fetch('/api/admin/jobs', { headers });
    const data = await res.json();
    setJobs(data.data||[]);
  }
  useEffect(()=>{ load(); },[]);
  async function save(j:any) {
    const headers:any={'Content-Type':'application/json'}; if (key) headers['x-admin-key']=key;
    await fetch('/api/admin/jobs', { method:'POST', headers, body: JSON.stringify(j) });
    await load();
  }
  async function del(id:number) {
    const headers:any={}; if (key) headers['x-admin-key']=key;
    await fetch(`/api/admin/jobs?id=${id}`, { method:'DELETE', headers });
    await load();
  }
  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center gap-2">
        <div className="font-semibold">职业管理</div>
        <input className="px-2 py-1 bg-slate-900 border border-slate-700 rounded" placeholder="Admin Key" value={key} onChange={e=>setKey(e.target.value)} />
        <button onClick={load} className="px-3 py-1 bg-slate-700 rounded">刷新</button>
        <a href="/admin" className="px-3 py-1 bg-slate-700 rounded">返回</a>
      </div>
      <table className="w-full text-sm">
        <thead className="text-slate-400"><tr>
          <th>ID</th><th>Code</th><th>名称</th><th>Idle</th><th>Hurt</th><th>Attack</th><th>Walk</th><th>Die</th><th>操作</th>
        </tr></thead>
        <tbody>
          {jobs.map(j => (
            <tr key={j.id} className="border-b border-slate-700">
              <td>{j.id}</td>
              <td><input defaultValue={j.code} className="w-28 bg-slate-900 border border-slate-700 rounded px-1" onChange={e=>j.code=e.target.value} /></td>
              <td><input defaultValue={j.name} className="w-24 bg-slate-900 border border-slate-700 rounded px-1" onChange={e=>j.name=e.target.value} /></td>
              <td><input defaultValue={j.idle_url||''} className="w-40 bg-slate-900 border border-slate-700 rounded px-1" onChange={e=>j.idle_url=e.target.value} /></td>
              <td><input defaultValue={j.hurt_url||''} className="w-40 bg-slate-900 border border-slate-700 rounded px-1" onChange={e=>j.hurt_url=e.target.value} /></td>
              <td><input defaultValue={j.attack_url||''} className="w-40 bg-slate-900 border border-slate-700 rounded px-1" onChange={e=>j.attack_url=e.target.value} /></td>
              <td><input defaultValue={j.walk_url||''} className="w-40 bg-slate-900 border border-slate-700 rounded px-1" onChange={e=>j.walk_url=e.target.value} /></td>
              <td><input defaultValue={j.die_url||''} className="w-40 bg-slate-900 border border-slate-700 rounded px-1" onChange={e=>j.die_url=e.target.value} /></td>
              <td className="space-x-2">
                <button className="px-2 py-0.5 bg-emerald-600 rounded" onClick={()=>save(j)}>保存</button>
                <button className="px-2 py-0.5 bg-rose-600 rounded" onClick={()=>del(j.id)}>删除</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="font-semibold">新增职业</div>
      <NewJobForm onSave={save} />
    </div>
  );
}

function NewJobForm({ onSave }: { onSave: (j:any)=>void }){
  const j:any = {};
  return (
    <form onSubmit={async (e)=>{ e.preventDefault(); await onSave(j); }} className="grid grid-cols-4 gap-2">
      <input placeholder="code" className="px-2 py-1 bg-slate-900 border border-slate-700 rounded" onChange={e=>j.code=e.target.value} />
      <input placeholder="名称" className="px-2 py-1 bg-slate-900 border border-slate-700 rounded" onChange={e=>j.name=e.target.value} />
      <input placeholder="Idle URL" className="px-2 py-1 bg-slate-900 border border-slate-700 rounded" onChange={e=>j.idle_url=e.target.value} />
      <input placeholder="Hurt URL" className="px-2 py-1 bg-slate-900 border border-slate-700 rounded" onChange={e=>j.hurt_url=e.target.value} />
      <input placeholder="Attack URL" className="px-2 py-1 bg-slate-900 border border-slate-700 rounded" onChange={e=>j.attack_url=e.target.value} />
      <input placeholder="Walk URL" className="px-2 py-1 bg-slate-900 border border-slate-700 rounded" onChange={e=>j.walk_url=e.target.value} />
      <input placeholder="Die URL" className="px-2 py-1 bg-slate-900 border border-slate-700 rounded" onChange={e=>j.die_url=e.target.value} />
      <button className="px-3 py-1 bg-emerald-600 rounded">保存</button>
    </form>
  );
}

