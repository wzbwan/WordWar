"use client";
import { useEffect, useState } from "react";

export default function AdminPage() {
  const [key, setKey] = useState("");
  const [monsters, setMonsters] = useState<any[]>([]);
  const [coins, setCoins] = useState<any[]>([]);
  const [schedules, setSchedules] = useState<any[]>([]);
  const [items, setItems] = useState<any[]>([]);

  async function loadAll() {
    const headers:any = {}; if (key) headers['x-admin-key']=key;
    const [m,c,s,i] = await Promise.all([
      fetch('/api/admin/monster_templates', { headers }).then(r=>r.json()).catch(()=>({data:[]})),
      fetch('/api/admin/coinrain_templates', { headers }).then(r=>r.json()).catch(()=>({data:[]})),
      fetch('/api/admin/schedule', { headers }).then(r=>r.json()).catch(()=>({data:[]})),
      fetch('/api/admin/items', { headers }).then(r=>r.json()).catch(()=>({data:[]})),
    ]);
    setMonsters(m.data||[]); setCoins(c.data||[]); setSchedules(s.data||[]); setItems(i.data||[]);
  }
  useEffect(()=>{ loadAll(); },[]);

  async function spawn(type: 'monster'|'coinrain', template_id:number) {
    const headers:any = { 'Content-Type':'application/json' }; if (key) headers['x-admin-key']=key;
    await fetch('/api/admin/spawn', { method:'POST', headers, body: JSON.stringify({ type, template_id }) });
  }

  async function saveMonster(e: any) {
    e.preventDefault(); const f = e.target; const fd = new FormData(f); const body:any = {}; fd.forEach((v,k)=>{ body[k]=v; });
    body.hp=Number(body.hp); body.atk=Number(body.atk); body.def=Number(body.def); body.exp_pool=Number(body.exp_pool); body.money_pool=Number(body.money_pool); body.counter_chance=Number(body.counter_chance);
    body.question_bank_id = body.question_bank_id ? Number(body.question_bank_id) : null;
    body.question_time_ms = body.question_time_ms ? Number(body.question_time_ms) : 0;
    const headers:any = { 'Content-Type':'application/json' }; if (key) headers['x-admin-key']=key;
    await fetch('/api/admin/monster_templates', { method:'POST', headers, body: JSON.stringify(body) });
    f.reset(); await loadAll();
  }
  async function saveCoin(e: any) {
    e.preventDefault(); const f = e.target; const fd = new FormData(f); const body:any = {}; fd.forEach((v,k)=>{ body[k]=v; });
    body.duration_ms=Number(body.duration_ms); body.coin_count=Number(body.coin_count); body.coin_value=Number(body.coin_value); body.per_user_cap=Number(body.per_user_cap);
    const headers:any = { 'Content-Type':'application/json' }; if (key) headers['x-admin-key']=key;
    await fetch('/api/admin/coinrain_templates', { method:'POST', headers, body: JSON.stringify(body) });
    f.reset(); await loadAll();
  }
  async function saveSchedule(e:any) {
    e.preventDefault(); const f=e.target; const fd = new FormData(f); const body:any = {}; fd.forEach((v,k)=>{ body[k]=v; });
    body.interval_sec=Number(body.interval_sec); body.template_id=Number(body.template_id); body.enabled = body.enabled === 'on';
    const headers:any = { 'Content-Type':'application/json' }; if (key) headers['x-admin-key']=key;
    await fetch('/api/admin/schedule', { method:'POST', headers, body: JSON.stringify(body) });
    f.reset(); await loadAll();
  }
  async function saveItem(e:any) {
    e.preventDefault(); const f=e.target; const fd = new FormData(f); const body:any = {}; fd.forEach((v,k)=>{ body[k]=v; });
    ['add_atk','add_def','add_max_hp','add_dodge','add_attack_speed','add_crit','add_current_hp'].forEach(k=>body[k]=Number(body[k]||0));
    const headers:any = { 'Content-Type':'application/json' }; if (key) headers['x-admin-key']=key;
    await fetch('/api/admin/items', { method:'POST', headers, body: JSON.stringify(body) });
    f.reset(); await loadAll();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <div className="font-semibold">后台配置</div>
        <input className="px-2 py-1 bg-slate-900 border border-slate-700 rounded" placeholder="Admin Key" type="password" value={key} onChange={e=>setKey(e.target.value)} />
        <button className="px-3 py-1 bg-slate-700 rounded" onClick={loadAll}>刷新</button>
        <a className="px-3 py-1 bg-slate-700 rounded" href="/chat">返回聊天室</a>
        <a className="px-3 py-1 bg-slate-700 rounded" href="/admin/quiz">题库管理</a>
      </div>

      <section className="space-y-2">
        <div className="font-semibold">怪物模板</div>
        <table className="w-full text-sm">
          <thead className="text-slate-400"><tr><th className="text-left">ID</th><th className="text-left">名称</th><th>图</th><th>HP</th><th>ATK</th><th>DEF</th><th>经验池</th><th>金币池</th><th>反击</th><th>随机物品列表</th><th>题库ID</th><th>出题时长ms</th><th>操作</th></tr></thead>
          <tbody>
            {monsters.map((m:any)=> (
              <tr key={m.id} className="border-b border-slate-700">
                <td>{m.id}</td><td>{m.name}</td><td>{m.url ? <img src={m.url} className="w-8 h-8"/>:null}</td><td>{m.hp}</td><td>{m.atk}</td><td>{m.def}</td><td>{m.exp_pool}</td><td>{m.money_pool}</td><td>{m.counter_chance}</td><td className="truncate max-w-[180px]">{m.last_hit_reward_items||''}</td><td>{m.question_bank_id ?? ''}</td><td>{m.question_time_ms ?? 0}</td>
                <td className="space-x-2">
                  <button className="px-2 py-0.5 bg-slate-700 rounded" onClick={()=>{
                    (document.querySelector('input[name=name]') as HTMLInputElement).value=m.name;
                    (document.querySelector('input[name=url]') as HTMLInputElement).value=m.url||'';
                    (document.querySelector('input[name=hp]') as HTMLInputElement).value=String(m.hp);
                    (document.querySelector('input[name=atk]') as HTMLInputElement).value=String(m.atk);
                    (document.querySelector('input[name=def]') as HTMLInputElement).value=String(m.def);
                    (document.querySelector('input[name=exp_pool]') as HTMLInputElement).value=String(m.exp_pool);
                    (document.querySelector('input[name=money_pool]') as HTMLInputElement).value=String(m.money_pool);
                    (document.querySelector('input[name=counter_chance]') as HTMLInputElement).value=String(m.counter_chance);
                    (document.querySelector('input[name=last_hit_reward_item_id]') as HTMLInputElement).value=String(m.last_hit_reward_item_id||'');
                    (document.querySelector('input[name=last_hit_reward_items]') as HTMLInputElement).value=String(m.last_hit_reward_items||'');
                    (document.querySelector('input[name=question_bank_id]') as HTMLInputElement).value=String(m.question_bank_id||'');
                    (document.querySelector('input[name=question_time_ms]') as HTMLInputElement).value=String(m.question_time_ms||0);
                    (document.querySelector('input[name=id]') as HTMLInputElement).value=String(m.id);
                  }}>编辑</button>
                  <button className="px-2 py-0.5 bg-rose-700 rounded" onClick={async()=>{ const headers:any={}; if (key) headers['x-admin-key']=key; await fetch(`/api/admin/monster_templates?id=${m.id}`, { method:'DELETE', headers }); await loadAll(); }}>删除</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <form onSubmit={saveMonster} className="grid grid-cols-7 gap-2">
          <input name="id" placeholder="编辑ID（可选）" className="px-2 py-1 bg-slate-900 border border-slate-700 rounded" />
          <input name="name" placeholder="名称" className="px-2 py-1 bg-slate-900 border border-slate-700 rounded col-span-2" />
          <input name="url" placeholder="图片URL(可选)" className="px-2 py-1 bg-slate-900 border border-slate-700 rounded col-span-2" />
          <input name="hp" placeholder="HP" className="px-2 py-1 bg-slate-900 border border-slate-700 rounded" />
          <input name="atk" placeholder="ATK" className="px-2 py-1 bg-slate-900 border border-slate-700 rounded" />
          <input name="def" placeholder="DEF" className="px-2 py-1 bg-slate-900 border border-slate-700 rounded" />
          <input name="exp_pool" placeholder="经验池" className="px-2 py-1 bg-slate-900 border border-slate-700 rounded" />
          <input name="money_pool" placeholder="金币池" className="px-2 py-1 bg-slate-900 border border-slate-700 rounded" />
          <input name="counter_chance" placeholder="反击概率0-1" className="px-2 py-1 bg-slate-900 border border-slate-700 rounded col-span-2" />
          <input name="question_bank_id" placeholder="题库ID(可选)" className="px-2 py-1 bg-slate-900 border border-slate-700 rounded" />
          <input name="question_time_ms" placeholder="出题时长ms(可选)" className="px-2 py-1 bg-slate-900 border border-slate-700 rounded" />
          <input name="last_hit_reward_item_id" placeholder="最后一击物品ID(可选)" className="px-2 py-1 bg-slate-900 border border-slate-700 rounded col-span-2" />
          <input name="last_hit_reward_items" placeholder="随机物品列表CSV(例如:1,2,4,4)" className="px-2 py-1 bg-slate-900 border border-slate-700 rounded col-span-3" />
          <button className="px-3 py-1 bg-emerald-600 rounded col-span-1">保存</button>
        </form>
        <div className="flex items-center gap-2">
          <input id="spawn_monster_id" placeholder="模板ID" className="px-2 py-1 bg-slate-900 border border-slate-700 rounded" />
          <button className="px-3 py-1 bg-slate-700 rounded" onClick={()=>{
            const id=(document.getElementById('spawn_monster_id') as HTMLInputElement).value; spawn('monster', Number(id||1));
          }}>手动放出</button>
        </div>
      </section>

      <section className="space-y-2">
        <div className="font-semibold">金币雨模板</div>
        <div className="text-xs text-slate-400">现有：{coins.map((c:any)=>`${c.id}(cap${c.per_user_cap},${c.duration_ms}ms,${c.coin_value}x${c.coin_count})`).join('，')||'无'}</div>
        <form onSubmit={saveCoin} className="grid grid-cols-5 gap-2">
          <input name="duration_ms" placeholder="持续ms" className="px-2 py-1 bg-slate-900 border border-slate-700 rounded" />
          <input name="coin_count" placeholder="数量" className="px-2 py-1 bg-slate-900 border border-slate-700 rounded" />
          <input name="coin_value" placeholder="每枚金币" className="px-2 py-1 bg-slate-900 border border-slate-700 rounded" />
          <input name="per_user_cap" placeholder="每人上限" className="px-2 py-1 bg-slate-900 border border-slate-700 rounded" />
          <button className="px-3 py-1 bg-emerald-600 rounded">保存</button>
        </form>
        <div className="flex items-center gap-2">
          <input id="spawn_coin_id" placeholder="模板ID" className="px-2 py-1 bg-slate-900 border border-slate-700 rounded" />
          <button className="px-3 py-1 bg-slate-700 rounded" onClick={()=>{
            const id=(document.getElementById('spawn_coin_id') as HTMLInputElement).value; spawn('coinrain', Number(id||1));
          }}>手动触发</button>
        </div>
      </section>

      <section className="space-y-2">
        <div className="font-semibold">自动事件</div>
        <table className="w-full text-sm">
          <thead className="text-slate-400"><tr><th>ID</th><th>类型</th><th>模板</th><th>间隔(s)</th><th>启用</th><th>操作</th></tr></thead>
          <tbody>
            {schedules.map((s:any)=> (
              <tr key={s.id} className="border-b border-slate-700">
                <td>{s.id}</td><td>{s.type}</td><td>{s.template_id}</td><td>{s.interval_sec}</td><td>{s.enabled? '是':'否'}</td>
                <td className="space-x-2">
                  <button className="px-2 py-0.5 bg-slate-700 rounded" onClick={async()=>{
                    const headers:any = { 'Content-Type':'application/json' }; if (key) headers['x-admin-key']=key;
                    await fetch('/api/admin/schedule', { method:'POST', headers, body: JSON.stringify({ id: s.id, type: s.type, template_id: s.template_id, interval_sec: s.interval_sec, enabled: !s.enabled }) });
                    await loadAll();
                  }}>{s.enabled?'停用':'启用'}</button>
                  <button className="px-2 py-0.5 bg-rose-700 rounded" onClick={async()=>{ const headers:any={}; if (key) headers['x-admin-key']=key; await fetch(`/api/admin/schedule?id=${s.id}`, { method:'DELETE', headers }); await loadAll(); }}>删除</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <form onSubmit={saveSchedule} className="grid grid-cols-5 gap-2">
          <select name="type" className="px-2 py-1 bg-slate-900 border border-slate-700 rounded">
            <option value="monster">monster</option>
            <option value="coinrain">coinrain</option>
          </select>
          <input name="template_id" placeholder="模板ID" className="px-2 py-1 bg-slate-900 border border-slate-700 rounded" />
          <input name="interval_sec" placeholder="间隔秒" className="px-2 py-1 bg-slate-900 border border-slate-700 rounded" />
          <label className="flex items-center gap-1 text-sm"><input name="enabled" type="checkbox" />启用</label>
          <button className="px-3 py-1 bg-emerald-600 rounded">保存</button>
        </form>
      </section>

      <section className="space-y-2">
        <div className="font-semibold">物品模板</div>
        <table className="w-full text-sm">
          <thead className="text-slate-400"><tr><th>ID</th><th>名称</th><th>类别</th><th>图片</th><th>+ATK</th><th>+DEF</th><th>+MaxHP</th><th>+Dodge</th><th>+AS</th><th>+Crit</th><th>+HP</th><th>操作</th></tr></thead>
          <tbody>
            {items.map((it:any)=> (
              <tr key={it.id} className="border-b border-slate-700">
                <td>{it.id}</td><td>{it.name}</td><td>{it.category}</td><td>{it.url ? <img src={it.url} alt={it.name} className="w-8 h-8"/>: null}</td><td>{it.add_atk}</td><td>{it.add_def}</td><td>{it.add_max_hp}</td><td>{it.add_dodge}</td><td>{it.add_attack_speed}</td><td>{it.add_crit}</td><td>{it.add_current_hp}</td>
                <td className="space-x-2">
                  <button className="px-2 py-0.5 bg-slate-700 rounded" onClick={()=>{
                    (document.querySelector('input[name=name]') as HTMLInputElement).value=it.name;
                    (document.querySelector('select[name=category]') as HTMLSelectElement).value=it.category;
                    (document.querySelector('input[name=add_atk]') as HTMLInputElement).value=String(it.add_atk||0);
                    (document.querySelector('input[name=add_def]') as HTMLInputElement).value=String(it.add_def||0);
                    (document.querySelector('input[name=add_max_hp]') as HTMLInputElement).value=String(it.add_max_hp||0);
                    (document.querySelector('input[name=add_dodge]') as HTMLInputElement).value=String(it.add_dodge||0);
                    (document.querySelector('input[name=add_attack_speed]') as HTMLInputElement).value=String(it.add_attack_speed||0);
                    (document.querySelector('input[name=add_crit]') as HTMLInputElement).value=String(it.add_crit||0);
                    (document.querySelector('input[name=add_current_hp]') as HTMLInputElement).value=String(it.add_current_hp||0);
                    (document.querySelector('input[name=url]') as HTMLInputElement).value=String(it.url||'');
                    (document.querySelector('input[name=id]') as HTMLInputElement).value=String(it.id);
                  }}>编辑</button>
                  <button className="px-2 py-0.5 bg-rose-700 rounded" onClick={async()=>{ const headers:any={}; if (key) headers['x-admin-key']=key; await fetch(`/api/admin/items?id=${it.id}`, { method:'DELETE', headers }); await loadAll(); }}>删除</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <form onSubmit={saveItem} className="grid grid-cols-5 gap-2">
          <input name="id" placeholder="编辑ID（可选）" className="px-2 py-1 bg-slate-900 border border-slate-700 rounded" />
          <input name="name" placeholder="名称" className="px-2 py-1 bg-slate-900 border border-slate-700 rounded" />
          <select name="category" className="px-2 py-1 bg-slate-900 border border-slate-700 rounded">
            <option value="weapon">武器</option>
            <option value="hat">帽子</option>
            <option value="clothes">衣服</option>
            <option value="shoes">鞋子</option>
            <option value="necklace">项链</option>
            <option value="ring">戒指</option>
            <option value="consumable">道具</option>
          </select>
          <input name="url" placeholder="图片URL (64x64)" className="px-2 py-1 bg-slate-900 border border-slate-700 rounded col-span-2" />
          <input name="add_atk" placeholder="+ATK" className="px-2 py-1 bg-slate-900 border border-slate-700 rounded" />
          <input name="add_def" placeholder="+DEF" className="px-2 py-1 bg-slate-900 border border-slate-700 rounded" />
          <input name="add_max_hp" placeholder="+MaxHP" className="px-2 py-1 bg-slate-900 border border-slate-700 rounded" />
          <input name="add_dodge" placeholder="+Dodge" className="px-2 py-1 bg-slate-900 border border-slate-700 rounded" />
          <input name="add_attack_speed" placeholder="+AS" className="px-2 py-1 bg-slate-900 border border-slate-700 rounded" />
          <input name="add_crit" placeholder="+Crit" className="px-2 py-1 bg-slate-900 border border-slate-700 rounded" />
          <input name="add_current_hp" placeholder="+当前HP(道具)" className="px-2 py-1 bg-slate-900 border border-slate-700 rounded col-span-2" />
          <button className="px-3 py-1 bg-emerald-600 rounded">保存</button>
        </form>
      </section>
    </div>
  );
}
