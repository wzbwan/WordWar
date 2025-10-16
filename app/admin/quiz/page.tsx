"use client";
import { useEffect, useMemo, useState } from "react";

export default function AdminQuizPage() {
  const [key, setKey] = useState("");
  const headers = useMemo(()=>{ const h:any={}; if (key) h['x-admin-key']=key; return h; },[key]);
  const [banks, setBanks] = useState<any[]>([]);
  const [questions, setQuestions] = useState<any[]>([]);
  const [selBank, setSelBank] = useState<number|undefined>(undefined);
  const [importing, setImporting] = useState(false);
  const [importLog, setImportLog] = useState<string[]>([]);

  async function loadBanks() {
    const res = await fetch('/api/admin/question_banks', { headers });
    const data = await res.json();
    setBanks(data.data||[]);
    if (!selBank && (data.data||[]).length) setSelBank(data.data[0].id);
  }
  async function loadQuestions(bankId?:number) {
    const url = bankId ? `/api/admin/questions?bank_id=${bankId}` : '/api/admin/questions';
    const res = await fetch(url, { headers });
    const data = await res.json();
    setQuestions(data.data||[]);
  }
  useEffect(()=>{ loadBanks(); },[]);
  useEffect(()=>{ if (selBank) loadQuestions(selBank); },[selBank, key]);

  async function saveBank(b:any) {
    const h:any = { 'Content-Type':'application/json' }; if (key) h['x-admin-key']=key;
    await fetch('/api/admin/question_banks', { method:'POST', headers: h, body: JSON.stringify(b) });
    await loadBanks();
  }
  async function delBank(id:number) {
    const h:any = {}; if (key) h['x-admin-key']=key;
    await fetch(`/api/admin/question_banks?id=${id}`, { method:'DELETE', headers: h });
    await loadBanks(); if (selBank===id) setSelBank(undefined);
  }
  async function saveQuestion(q:any) {
    const h:any = { 'Content-Type':'application/json' }; if (key) h['x-admin-key']=key;
    await fetch('/api/admin/questions', { method:'POST', headers: h, body: JSON.stringify(q) });
    await loadQuestions(selBank);
  }
  async function delQuestion(id:number) {
    const h:any = {}; if (key) h['x-admin-key']=key;
    await fetch(`/api/admin/questions?id=${id}`, { method:'DELETE', headers: h });
    await loadQuestions(selBank);
  }

  async function handleImport(file: File) {
    if (!file) return;
    setImporting(true); setImportLog([]);
    try {
      const XLSX = await import('xlsx');
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows: any[] = XLSX.utils.sheet_to_json(ws, { defval: '' });
      const log: string[] = [];
      const toType = (s:string) => {
        const t = String(s||'').trim();
        if (/单选/.test(t)) return 'single';
        if (/多选/.test(t)) return 'multiple';
        if (/判断|是非/.test(t)) return 'true_false';
        if (/填空/.test(t)) return 'fill';
        return 'single';
      };
      const toBool = (v:any) => {
        const s = String(v).trim().toLowerCase();
        return (s==='true' || s==='1' || s==='对' || s==='是');
      };
      const normAnswer = (type:string, raw:any, opts:string[]) => {
        if (type==='true_false') return toBool(raw);
        if (type==='multiple') {
          const parts = String(raw||'').split(/[,，；;、]/).map((x)=>String(x).trim()).filter(Boolean);
          // map A-D or 1-4 to option text when possible
          const mapped = parts.map(p => {
            const m = /^(A|B|C|D)$/i.exec(p) ? 'ABCD'.indexOf(p.toUpperCase()) : (/^[1-4]$/.test(p) ? Number(p)-1 : -1);
            if (typeof m==='number' && m>=0 && m<opts.length) return opts[m];
            return p;
          });
          return mapped;
        }
        if (type==='single') {
          const p = String(raw||'').trim();
          const m = /^(A|B|C|D)$/i.exec(p) ? 'ABCD'.indexOf(p.toUpperCase()) : (/^[1-4]$/.test(p) ? Number(p)-1 : -1);
          if (typeof m==='number' && m>=0 && m<opts.length) return opts[m];
          return p;
        }
        // fill
        return String(raw||'').trim();
      };
      const h:any = { 'Content-Type':'application/json' }; if (key) h['x-admin-key']=key;
      let ok = 0, fail = 0;
      for (let i=0;i<rows.length;i++) {
        const r = rows[i];
        const type = toType(r['类型'] || r['题型'] || r['type'] || r['类型（单选、多选、判断、填空）'] || '单选');
        const content = r['题干'] || r['题目'] || r['content'] || '';
        const o1 = r['选项1'] || r['A'] || r['a'] || '';
        const o2 = r['选项2'] || r['B'] || r['b'] || '';
        const o3 = r['选项3'] || r['C'] || r['c'] || '';
        const o4 = r['选项4'] || r['D'] || r['d'] || '';
        const options = [o1,o2,o3,o4].filter((x)=>String(x||'').trim()!=='' );
        const rawAns = r['答案'] || r['answer'] || '';
        const answer = normAnswer(type, rawAns, options);
        const body:any = { bank_id: selBank, type, content, options: (type==='fill'? null : options), answer };
        try {
          await fetch('/api/admin/questions', { method:'POST', headers: h, body: JSON.stringify(body) });
          ok++;
        } catch (e:any) { fail++; log.push(`第${i+2}行导入失败`); }
      }
      setImportLog([`导入完成：成功 ${ok} 条，失败 ${fail} 条`, ...log]);
      await loadQuestions(selBank);
    } catch (e:any) {
      setImportLog([`导入失败：${e?.message||e}`]);
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="space-y-6 p-4">
      <div className="flex items-center gap-2">
        <div className="font-semibold">题库管理</div>
        <input className="px-2 py-1 bg-slate-900 border border-slate-700 rounded" placeholder="Admin Key" type="password" value={key} onChange={e=>setKey(e.target.value)} />
        <button className="px-3 py-1 bg-slate-700 rounded" onClick={()=>{ loadBanks(); if (selBank) loadQuestions(selBank); }}>刷新</button>
        <a className="px-3 py-1 bg-slate-700 rounded" href="/admin">返回</a>
      </div>

      <section className="space-y-2">
        <div className="font-semibold">题库</div>
        <table className="w-full text-sm">
          <thead className="text-slate-400"><tr><th>ID</th><th>名称</th><th>描述</th><th>启用</th><th>操作</th></tr></thead>
          <tbody>
            {banks.map((b:any)=> (
              <tr key={b.id} className="border-b border-slate-700">
                <td>{b.id}</td>
                <td><input defaultValue={b.name} className="w-40 bg-slate-900 border border-slate-700 rounded px-1" onChange={e=>b.name=e.target.value} /></td>
                <td><input defaultValue={b.description||''} className="w-64 bg-slate-900 border border-slate-700 rounded px-1" onChange={e=>b.description=e.target.value} /></td>
                <td><input type="checkbox" defaultChecked={!!b.enabled} onChange={e=>b.enabled=e.target.checked} /></td>
                <td className="space-x-2">
                  <button className="px-2 py-0.5 bg-emerald-600 rounded" onClick={()=>saveBank({ id: b.id, name: b.name, description: b.description, enabled: !!b.enabled })}>保存</button>
                  <button className="px-2 py-0.5 bg-rose-600 rounded" onClick={()=>delBank(b.id)}>删除</button>
                  <button className={`px-2 py-0.5 rounded ${selBank===b.id? 'bg-indigo-600':'bg-slate-700'}`} onClick={()=>setSelBank(b.id)}>选中</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <NewBank onSave={saveBank} />
      </section>

      <section className="space-y-2">
        <div className="font-semibold">题目（{selBank? `当前题库 #${selBank}`:'未选择题库'}）</div>
        {selBank ? (
          <>
            <div className="flex items-center gap-2">
              <input type="file" accept=".xlsx,.xls" onChange={(e)=>{ const f=e.target.files?.[0]; if (f) handleImport(f); }} className="px-2 py-1 bg-slate-900 border border-slate-700 rounded" />
              <span className="text-xs text-slate-400">模板列：类型（单选/多选/判断/填空）、题干、答案、选项1、选项2、选项3、选项4</span>
            </div>
            {importing && <div className="text-xs text-amber-300">正在导入……</div>}
            {importLog.length>0 && (
              <div className="text-xs text-slate-400 space-y-1">
                {importLog.map((l,i)=>(<div key={i}>{l}</div>))}
              </div>
            )}
            <table className="w-full text-sm">
              <thead className="text-slate-400"><tr><th>ID</th><th>类型</th><th>题干</th><th>选项</th><th>答案</th><th>操作</th></tr></thead>
              <tbody>
                {questions.map((q:any)=> (
                  <tr key={q.id} className="border-b border-slate-700">
                    <td>{q.id}</td>
                    <td>
                      <select defaultValue={q.type} className="bg-slate-900 border border-slate-700 rounded px-1" onChange={e=>q.type=e.target.value}>
                        <option value="single">单选</option>
                        <option value="multiple">多选</option>
                        <option value="true_false">判断</option>
                        <option value="fill">填空</option>
                      </select>
                    </td>
                    <td><input defaultValue={q.content} className="w-64 bg-slate-900 border border-slate-700 rounded px-1" onChange={e=>q.content=e.target.value} /></td>
                    <td><input defaultValue={q.options||''} className="w-64 bg-slate-900 border border-slate-700 rounded px-1" onChange={e=>q.options=e.target.value} /></td>
                    <td><input defaultValue={q.answer||''} className="w-40 bg-slate-900 border border-slate-700 rounded px-1" onChange={e=>q.answer=e.target.value} /></td>
                    <td className="space-x-2">
                      <button className="px-2 py-0.5 bg-emerald-600 rounded" onClick={()=>saveQuestion({ id: q.id, bank_id: selBank, type: q.type, content: q.content, options: q.options, answer: q.answer, explanation: q.explanation })}>保存</button>
                      <button className="px-2 py-0.5 bg-rose-600 rounded" onClick={()=>delQuestion(q.id)}>删除</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <NewQuestion bankId={selBank} onSave={saveQuestion} />
          </>
        ) : (
          <div className="text-sm text-slate-400">请先选择题库</div>
        )}
      </section>
    </div>
  );
}

function NewBank({ onSave }: { onSave: (b:any)=>Promise<void> }) {
  const b:any = { enabled: true };
  return (
    <form onSubmit={async (e)=>{ e.preventDefault(); await onSave(b); (e.target as HTMLFormElement).reset(); }} className="grid grid-cols-5 gap-2">
      <input placeholder="名称" className="px-2 py-1 bg-slate-900 border border-slate-700 rounded" onChange={e=>b.name=e.target.value} />
      <input placeholder="描述" className="px-2 py-1 bg-slate-900 border border-slate-700 rounded col-span-3" onChange={e=>b.description=e.target.value} />
      <label className="flex items-center gap-1 text-sm"><input type="checkbox" defaultChecked onChange={e=>b.enabled=e.target.checked} />启用</label>
      <button className="px-3 py-1 bg-emerald-600 rounded">新增题库</button>
    </form>
  );
}

function NewQuestion({ bankId, onSave }: { bankId: number, onSave: (q:any)=>Promise<void> }) {
  const q:any = { bank_id: bankId, type: 'single' };
  return (
    <form onSubmit={async (e)=>{ e.preventDefault(); q.bank_id = bankId; await onSave(q); (e.target as HTMLFormElement).reset(); }} className="grid grid-cols-6 gap-2 mt-3">
      <select className="px-2 py-1 bg-slate-900 border border-slate-700 rounded" defaultValue={'single'} onChange={e=>q.type=e.target.value}>
        <option value="single">单选</option>
        <option value="multiple">多选</option>
        <option value="true_false">判断</option>
        <option value="fill">填空</option>
      </select>
      <input placeholder="题干" className="px-2 py-1 bg-slate-900 border border-slate-700 rounded col-span-2" onChange={e=>q.content=e.target.value} />
      <input placeholder="选项（JSON数组或逗号分隔）" className="px-2 py-1 bg-slate-900 border border-slate-700 rounded col-span-2" onChange={e=>q.options=e.target.value} />
      <input placeholder="答案（true/false，字符串或逗号分隔）" className="px-2 py-1 bg-slate-900 border border-slate-700 rounded" onChange={e=>q.answer=e.target.value} />
      <button className="px-3 py-1 bg-emerald-600 rounded">新增题目</button>
    </form>
  );
}
