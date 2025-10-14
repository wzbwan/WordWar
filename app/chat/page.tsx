"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { create } from "zustand";

type Msg = { id: string; type: "chat" | "system" | "battle"; user?: string; content: string; ts: number; details?: string[] };
type User = { id: number; username: string; level?: number };
type Player = { id?: number; username?: string; level: number; exp: number; money: number; atk: number; def: number; hp: number; maxHp?: number; dodge_index?: number; crit_index?: number; deadRemaining?: number; bank?: number; job?: string|null };

type Store = {
  messages: Msg[];
  users: User[]; // online users only (WS)
  players: User[]; // all players from API
  player?: Player;
  coinrain?: { event_id: string | number; endAt: number };
  monster?: { hp: number; max_hp: number; cell: number; endsAt: number; url?: string|null };
  pushMsg: (m: Msg) => void;
  setUsers: (u: User[]) => void;
  setPlayers: (u: User[]) => void;
  setPlayer: (p: Player) => void;
  setCoinrain: (c?: { event_id: string; endAt: number }) => void;
  setMonster: (m?: { hp: number; max_hp: number; cell: number; endsAt: number; url?: string|null }) => void;
};

const useStore = create<Store>((set) => ({
  messages: [],
  users: [],
  players: [],
  pushMsg: (m) => set((s) => ({ messages: [...s.messages, m].slice(-500) })),
  setUsers: (u) => set({ users: u }),
  setPlayers: (u) => set({ players: u }),
  setPlayer: (p) => set({ player: p }),
  setCoinrain: (c) => set({ coinrain: c }),
  setMonster: (m) => set({ monster: m }),
}));

function useToken() {
  return useMemo(() => (typeof window !== "undefined" ? localStorage.getItem("token") : null), []);
}

// Cross-platform UUID (polyfill for older Safari/iPadOS)
function uid(): string {
  try {
    const g: any = (typeof globalThis !== 'undefined' ? globalThis : window) as any;
    const c = g?.crypto || g?.msCrypto;
    if (c?.randomUUID) return c.randomUUID();
    if (c?.getRandomValues) {
      const buf = new Uint8Array(16);
      c.getRandomValues(buf);
      buf[6] = (buf[6] & 0x0f) | 0x40; // version 4
      buf[8] = (buf[8] & 0x3f) | 0x80; // variant
      const toHex = (n: number) => n.toString(16).padStart(2, '0');
      const b = Array.from(buf, toHex).join('');
      return `${b.slice(0,8)}-${b.slice(8,12)}-${b.slice(12,16)}-${b.slice(16,20)}-${b.slice(20)}`;
    }
  } catch {}
  // Fallback
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    const v = ch === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export default function ChatPage() {
  const token = useToken();
  const [input, setInput] = useState("");
  const wsRef = useRef<WebSocket | null>(null);
  const { messages, users, players, player, pushMsg, setUsers, setPlayers, setPlayer, coinrain, setCoinrain, monster, setMonster } = useStore();
  const [pvpDetails, setPvpDetails] = useState<string[] | null>(null);
  const [nextHitAt, setNextHitAt] = useState<number>(0);
  const listRef = useRef<HTMLDivElement | null>(null);
  const [invOpen, setInvOpen] = useState(false);
  const [bag, setBag] = useState<any[]>([]);
  const [equip, setEquip] = useState<any[]>([]);
  const [chooseJobOpen, setChooseJobOpen] = useState(false);
  const [battle, setBattle] = useState<{summary: string; logs: string[]; left:string; right:string} | null>(null);

  useEffect(() => {
    if (!token) {
      window.location.href = "/";
      return;
    }
    fetch("/api/player", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((d) => { setPlayer(d.player); if (!d.player?.job) setChooseJobOpen(true); })
      .catch(() => {});
    // fetch all players list
    fetch('/api/players')
      .then(r=>r.json())
      .then(d=> setPlayers(d.players||[]))
      .catch(()=>{});

    const url =(location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host.replace(/:\d+$/, ':3001');
    console.log('chat page websocket url:',url)
    const ws = new WebSocket(url);
    wsRef.current = ws;
    ws.onopen = () => {
      ws.send(JSON.stringify({ type: "connect", token }));
    };
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.type === "chat.message") pushMsg(msg.payload);
      if (msg.type === "system") pushMsg(msg.payload);
      if (msg.type === "user.list") setUsers(msg.payload);
      if (msg.type === "player.update") {
        const prev = useStore.getState().player as any;
        const payload = msg.payload || {};
        const norm = { ...payload } as any;
        if (norm.hp_max && !norm.maxHp) norm.maxHp = norm.hp_max;
        setPlayer({ ...(prev || {}), ...norm });
      }
      if (msg.type === "coinrain.spawn") {
        setCoinrain({ event_id: msg.payload.event_id, endAt: Date.now() + 20000 });
      }
      if (msg.type === "coinrain.end") {
        setCoinrain(undefined);
      }
      if (msg.type === "pvp.result") {
        pushMsg({ id: uid(), type: "battle", content: msg.payload.summary + " [查看详情]", ts: Date.now(), details: msg.payload.log });
        const m = /^(.+?) 对 (.+?) 进行切磋/.exec(msg.payload.summary||'');
        const me = useStore.getState().player?.username;
        const a = m?.[1]||''; const b = m?.[2]||'';
        const left = me && (me===a || me===b) ? me : (a||b);
        const right = left===a? b : a;
        setBattle({ summary: msg.payload.summary, logs: msg.payload.log||[], left, right });
      }
      if (msg.type === "monster.spawn") {
        pushMsg({ id: uid(), type: "system", content: msg.payload.text, ts: Date.now() });
      }
      if (msg.type === "monster.state") {
        setMonster({ hp: msg.payload.hp, max_hp: msg.payload.max_hp, cell: msg.payload.cell, endsAt: msg.payload.endsAt, url: msg.payload.url });
      }
      if (msg.type === "monster.end") {
        setMonster(undefined);
        pushMsg({ id: uid(), type: "system", content: msg.payload.text, ts: Date.now() });
      }
    };
    const ping = setInterval(() => {
      ws.readyState === 1 && ws.send(JSON.stringify({ type: "ping" }));
    }, 30000);
    const refresh = setInterval(() => {
      if (!token) return;
      fetch("/api/player", { headers: { Authorization: `Bearer ${token}` } })
        .then((r) => r.json())
        .then((d) => setPlayer(d.player))
        .catch(() => {});
    }, 60000);
    return () => {
      clearInterval(ping);
      clearInterval(refresh);
      ws.close();
    };
  }, [token]);

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages.length]);

  function sendChat() {
    if (!input.trim()) return;
    wsRef.current?.send(JSON.stringify({ type: "chat.message", payload: { content: input.trim() } }));
    setInput("");
  }

  async function storeExp() {
    if (!token) return;
    const res = await fetch("/api/exp/store", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` } });
    const data = await res.json();
    if (!res.ok) {
      pushMsg({ id: uid(), type: "system", content: data?.error || "存点失败", ts: Date.now() });
    } else {
      pushMsg({ id: uid(), type: "system", content: `成功存点：${data.bank} 分钟，共 +${data.gain} 经验，金钱 +${data.moneyGain}` , ts: Date.now() });
      // 拉取最新属性展示
      fetch("/api/player", { headers: { Authorization: `Bearer ${token}` } })
        .then((r) => r.json())
        .then((d) => setPlayer(d.player))
        .catch(() => {});
    }
  }

  function challenge(userId: number) {
    wsRef.current?.send(JSON.stringify({ type: "pvp.challenge", payload: { targetId: userId } }));
  }

  function hitCoin() {
    if (!coinrain) return;
    wsRef.current?.send(JSON.stringify({ type: "coinrain.hit", payload: { event_id: coinrain.event_id } }));
  }

  function logout() {
    localStorage.removeItem("token");
    location.href = "/";
  }

  function hitMonster(cell: number) {
    const now = Date.now();
    if (now < nextHitAt) return;
    setNextHitAt(now + 1500);
    wsRef.current?.send(JSON.stringify({ type: "monster.hit", payload: { cell } }));
  }

  function openDetails(details?: string[]) {
    if (details && details.length) {
      // Try parse names from logs
      let names = new Set<string>();
      for (const line of details) {
        const m1 = /^(.+?) 对 (.+?) 造成/.exec(line);
        if (m1) { names.add(m1[1]); names.add(m1[2]); if (names.size>=2) break; }
        const m2 = /^(.+?) 躲闪成功/.exec(line);
        if (m2) names.add(m2[1]);
      }
      const arr = Array.from(names);
      const me = useStore.getState().player?.username;
      const left = arr.includes(me||'') ? (me as string) : (arr[0]||'我');
      const right = arr.find(n=>n!==left) || (arr[0]||'对手');
      setBattle({ summary: `${left} 对 ${right} 进行切磋`, logs: details, left, right });
    }
  }

  async function loadInventory() {
    const res = await fetch('/api/inventory', { headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json();
    if (res.ok) { setBag(data.bag||[]); setEquip(data.equip||[]); }
  }

  async function doEquip(id: number) {
    const res = await fetch('/api/inventory/equip', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ itemId: id }) });
    const data = await res.json().catch(()=>({}));
    if (!res.ok) { alert(data?.error||'操作失败'); return; }
    await loadInventory();
    if (data?.player) { const prev = useStore.getState().player as any; setPlayer({ ...(prev||{}), ...data.player }); }
    else fetch("/api/player", { headers: { Authorization: `Bearer ${token}` } }).then(r=>r.json()).then(d=>setPlayer(d.player)).catch(()=>{});
  }
  async function doUnequip(slot: string) {
    const res = await fetch('/api/inventory/unequip', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ slot }) });
    const data = await res.json().catch(()=>({}));
    if (!res.ok) { alert(data?.error||'操作失败'); return; }
    await loadInventory();
    if (data?.player) { const prev = useStore.getState().player as any; setPlayer({ ...(prev||{}), ...data.player }); }
    else fetch("/api/player", { headers: { Authorization: `Bearer ${token}` } }).then(r=>r.json()).then(d=>setPlayer(d.player)).catch(()=>{});
  }
  async function doUse(id: number) {
    const res = await fetch('/api/inventory/use', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ itemId: id }) });
    const data = await res.json();
    if (!res.ok) { alert(data?.error || '使用失败'); return; }
    await loadInventory();
    if (data?.player) { const prev = useStore.getState().player as any; setPlayer({ ...(prev||{}), ...data.player }); }
    else fetch("/api/player", { headers: { Authorization: `Bearer ${token}` } }).then(r=>r.json()).then(d=>setPlayer(d.player)).catch(()=>{});
  }
  async function doDrop(id: number) {
    const res = await fetch('/api/inventory/drop', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ itemId: id }) });
    if (!res.ok) { const t = await res.json().catch(()=>({error:'操作失败'})); alert(t.error||'操作失败'); return; }
    await loadInventory();
  }

  function mapSlot2name(slot: string) {
    ['weapon','hat','clothes','shoes','necklace','ring']
    if (slot === 'weapon') {
      return '武器';
    }else if (slot === 'hat') {
      return '帽子';
    }else if (slot === 'clothes') {
      return '衣服';
    }else if (slot === 'shoes') {
      return '鞋子';
    }else if (slot === 'necklace') {
      return '项链';
    }else if (slot === 'ring') {
      return '戒指';
    }else{
      return '装备？'
    }
  }

  return (
    <div className="grid gap-4" style={{ gridTemplateColumns: '200px 1fr 280px' }}>
      <div>
        <div className="bg-slate-800 border border-slate-700 rounded p-3">
          <div className="font-semibold mb-2">玩家列表</div>
          <OnlineUsers users={users} players={players||[]} selfId={player?.id} onChallenge={challenge} />
        </div>
      </div>
      {chooseJobOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-slate-800 border border-slate-700 rounded p-4 w-[90vw] max-w-md">
            <div className="font-semibold mb-2">选择职业</div>
            <div className="grid grid-cols-2 gap-3">
              {[
                { code:'swordsman', name:'剑客' },
                { code:'knifeman', name:'刀客' },
              ].map(opt => (
                <button key={opt.code} className="p-3 bg-slate-900 rounded border border-slate-700 hover:border-emerald-500" onClick={async()=>{
                  await fetch('/api/player/job', { method:'POST', headers:{ 'Content-Type':'application/json', Authorization:`Bearer ${token}` }, body: JSON.stringify({ job: opt.code }) });
                  const d = await fetch('/api/player', { headers:{ Authorization:`Bearer ${token}` } }).then(r=>r.json());
                  setPlayer(d.player); setChooseJobOpen(false);
                }}>{opt.name}</button>
              ))}
            </div>
          </div>
        </div>
      )}
      {battle && (
        <BattleViewer battle={battle} onClose={()=>setBattle(null)} />
      )}
      <div>
        <div className="bg-slate-800 border border-slate-700 rounded p-3 h-[70vh] flex flex-col">
          <div ref={listRef} className="flex-1 overflow-y-auto space-y-2 scrollbar">
            {messages.map((m) => (
              <div key={m.id} className="text-sm">
                <span className="text-slate-500 mr-2">{new Date(m.ts).toLocaleTimeString()}</span>
                <span className={m.type === "system" ? "text-amber-300" : m.type === "battle" ? "text-pink-300" : "text-slate-100"}>
                  {m.user ? `[${m.user}] ` : ""}
                  {m.details ? (
                    <button className="underline decoration-dotted" onClick={() => openDetails(m.details)}>{m.content}</button>
                  ) : (
                    m.content
                  )}
                </span>
              </div>
            ))}
          </div>
          <div className="mt-3 flex gap-2">
            <input className="flex-1 px-3 py-2 bg-slate-900 border border-slate-700 rounded outline-none" value={input} onChange={e=>setInput(e.target.value)} onKeyDown={(e)=>{ if(e.key==='Enter') sendChat(); }} />
            <button onClick={sendChat} className="px-4 bg-indigo-600 hover:bg-indigo-500 rounded">发送</button>
          </div>
        </div>
      </div>
      <div className="space-y-3">
        <div className="bg-slate-800 border border-slate-700 rounded p-3">
          <div className="flex justify-between items-center mb-2">
            <div className="font-semibold">角色信息</div>
            <button onClick={logout} className="text-xs text-slate-300 hover:text-white">退出</button>
          </div>
          {player ? (
            <div className="space-y-2 text-sm text-slate-300">
              <div>{player?.username}（Lv.{player.level}）</div>
              <div>Exp:{player.exp}</div>
              <div>
                <div className="flex justify-between text-xs text-slate-400"><span>HP</span><span>{player.hp}/{player.maxHp ?? player.hp}</span></div>
                <div className="h-2 bg-slate-900 rounded">
                  <div className="h-full bg-emerald-600 rounded" style={{ width: `${Math.max(0, Math.min(100, Math.round(((player.hp) / (player.maxHp ?? player.hp)) * 100)))}%` }} />
                </div>
              </div>
              {player.deadRemaining && player.deadRemaining > 0 && (
                <div className="text-rose-300 text-xs">已阵亡，复活倒计时：{Math.ceil((player.deadRemaining)/1000)}s</div>
              )}
              <div className="w-full flex flex-row justify-between">
                <div>武力：{player.atk}</div>
                <div>防御：{player.def}</div>
              </div>
              <div className="w-full flex flex-row justify-between">
                <div>闪避指数：{player.dodge_index ?? '-'}</div>
                <div>暴击指数：{player.crit_index ?? '-'}</div>
              </div>
              <div>存款：{player.money}</div>
               
            </div>
          ) : (
            <div className="text-sm text-slate-400">加载中...</div>
          )}
          <div className="mt-3 flex gap-2">
            <button disabled={!!(player?.deadRemaining && player.deadRemaining>0) || !((player?.bank||0) > 0)} onClick={storeExp} className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-500 rounded disabled:opacity-50">存点</button>
            <button onClick={async()=>{ setInvOpen(true); await loadInventory(); }} className="px-3 py-2 bg-slate-700 hover:bg-slate-600 rounded">物品栏</button>
          </div>
        </div>
        <div className="bg-slate-800 border border-slate-700 rounded p-3">
          <div className="flex items-center justify-between">
            <div className="font-semibold">活动</div>
            <div className="text-xs space-x-2">
              {coinrain && <span className="text-amber-300">金币雨</span>}
              {monster && <span className="text-rose-300">怪物</span>}
            </div>
          </div>
          {coinrain && (
            <button disabled={!!(player?.deadRemaining && player.deadRemaining>0)} onClick={hitCoin} className="mt-3 w-full py-2 bg-amber-600 hover:bg-amber-500 rounded disabled:opacity-50">抢金币</button>
          )}
          {monster ? (
            <div className="mt-3">
              <div className="grid grid-cols-3 gap-2">
                {Array.from({ length: 9 }).map((_, i) => (
                   <div key={i} className="aspect-square bg-slate-900 rounded flex items-center justify-center cursor-pointer select-none"
                        onClick={() => { if (!(player?.deadRemaining && player.deadRemaining>0)) hitMonster(i); }}>
                     {monster.cell === i && (
                       monster.url ? (
                         <img src={monster.url} alt="monster" className="w-14 h-14 object-contain" />
                       ) : (
                         <span className="text-2xl">👾</span>
                       )
                     )}
                   </div>
                ))}
              </div>
              <div className="mt-3 h-3 bg-slate-900 rounded">
                <div className="h-full bg-rose-600 rounded" style={{ width: `${Math.max(0, Math.min(100, Math.round((monster.hp / monster.max_hp) * 100)))}%` }} />
              </div>
              <div className="flex items-center justify-between text-xs text-slate-400 mt-1">
                <span>HP {monster.hp}/{monster.max_hp}</span>
                <span>{Math.max(0, Math.ceil((nextHitAt - Date.now())/100)/10)}s 冷却</span>
              </div>
            </div>
          ) : (!coinrain && (
            <div className="text-sm text-slate-400 mt-2">暂无活动</div>
          ))}
        </div>
      </div>
      {pvpDetails && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-slate-800 border border-slate-700 rounded p-4 w-[90vw] max-w-2xl max-h-[70vh] overflow-y-auto scrollbar">
            <div className="flex items-center justify-between mb-2">
              <div className="font-semibold">切磋详情</div>
              <button onClick={() => setPvpDetails(null)} className="text-slate-300 hover:text-white">关闭</button>
            </div>
            <div className="space-y-1 text-sm">
              {pvpDetails.map((line, idx) => (
                <div key={idx} className="text-slate-200">{line}</div>
              ))}
            </div>
          </div>
        </div>
      )}
      {invOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-slate-800 border border-slate-700 rounded p-2 w-[90vw] max-w-3xl max-h-[80vh] overflow-y-auto scrollbar">
            <div className="flex items-center justify-between mb-3">
              <div className="font-semibold">物品栏</div>
              <button onClick={() => setInvOpen(false)} className="text-slate-300 hover:text-white">关闭</button>
            </div>
            <div className="">
              <div>
                <div className="font-semibold mb-2">已装备</div>
                <div className="flex flex-row justify-around mb-2">
                {['weapon','hat','clothes','shoes','necklace','ring'].map((slot) => {
                  const it = equip.find((e:any)=>e.slot===slot);
                  return (
                    <div key={slot} className="p-2 bg-slate-900 rounded text-xs flex flex-col items-center gap-1 relative group">
                        <div>{mapSlot2name(slot)}</div>
                        <div className="w-16 h-16 bg-slate-800 rounded flex items-center justify-center overflow-hidden">
                          {it ? (
                            <img src={it.url || 'https://word-war.tos-cn-beijing.volces.com/fc13.png'} alt={it.name} className="w-8 h-8 object-contain" />
                          ) : (
                            <span className="text-slate-600">空</span>
                          )}
                        </div>
                        {it && (
                          <div className="hidden group-hover:block absolute left-full top-0 ml-2 z-50 w-56 p-2 rounded bg-slate-800 border border-slate-700 shadow-lg">
                            <div className="text-slate-100 font-semibold mb-1">{it.name}（{it.category}）</div>
                            <div className="text-slate-300 space-y-0.5">
                              {(() => {
                                const rows: string[] = [];
                                if (it.add_atk) rows.push(`增加攻击 +${it.add_atk}`);
                                if (it.add_def) rows.push(`增加防御 +${it.add_def}`);
                                if (it.add_max_hp) rows.push(`增加最大血量 +${it.add_max_hp}`);
                                if (it.add_dodge) rows.push(`增加闪避指数 +${it.add_dodge}`);
                                if (it.add_attack_speed) rows.push(`增加攻速 +${it.add_attack_speed}`);
                                if (it.add_crit) rows.push(`增加暴击指数 +${it.add_crit}`);
                                if (it.add_current_hp) rows.push(`使用：立刻恢复HP +${it.add_current_hp}`);
                                return rows.map((r, idx) => (<div key={idx}>{r}</div>));
                              })()}
                            </div>
                          </div>
                        )}
                        <div className="min-h-[16px] text-center break-all px-1">{it ? `${it.name}${it.count>1?` x${it.count}`:''}` : ''}</div>
                        {it && (
                          <div className="flex flex-wrap gap-1">
                            {it.category !== 'consumable' && <button className="px-0.5 bg-slate-700 rounded" onClick={()=>doUnequip(slot)}>卸下</button>}
                          </div>
                        )}
                      </div>
                  );
                })}
                </div>
              </div>
              <div>
                <div className="font-semibold mb-2">背包</div>
                <div className="grid grid-cols-6 gap-2">
                  {Array.from({ length: 24 }).map((_, i) => {
                    const it = bag.find((b:any)=>b.bag_slot===i);
                    return (
                      <div key={i} className="p-2 bg-slate-900 rounded text-xs flex flex-col items-center gap-1 relative group">
                        <div className="w-16 h-16 bg-slate-800 rounded flex items-center justify-center overflow-hidden">
                          {it ? (
                            <img src={it.url || 'https://word-war.tos-cn-beijing.volces.com/fc13.png'} alt={it.name} className="w-8 h-8 object-contain" />
                          ) : (
                            <span className="text-slate-600">空</span>
                          )}
                        </div>
                        {it && (
                          <div className="hidden group-hover:block absolute left-full top-0 ml-2 z-50 w-56 p-2 rounded bg-slate-800 border border-slate-700 shadow-lg">
                            <div className="text-slate-100 font-semibold mb-1">{it.name}（{it.category}）</div>
                            <div className="text-slate-300 space-y-0.5">
                              {(() => {
                                const rows: string[] = [];
                                if (it.add_atk) rows.push(`增加攻击 +${it.add_atk}`);
                                if (it.add_def) rows.push(`增加防御 +${it.add_def}`);
                                if (it.add_max_hp) rows.push(`增加最大血量 +${it.add_max_hp}`);
                                if (it.add_dodge) rows.push(`增加闪避指数 +${it.add_dodge}`);
                                if (it.add_attack_speed) rows.push(`增加攻速 +${it.add_attack_speed}`);
                                if (it.add_crit) rows.push(`增加暴击指数 +${it.add_crit}`);
                                if (it.add_current_hp) rows.push(`使用：立刻恢复HP +${it.add_current_hp}`);
                                return rows.map((r, idx) => (<div key={idx}>{r}</div>));
                              })()}
                            </div>
                          </div>
                        )}
                        <div className="min-h-[16px] text-center break-all px-1">{it ? `${it.name}${it.count>1?` x${it.count}`:''}` : ''}</div>
                        {it && (
                          <div className="flex flex-wrap gap-1">
                            {it.category !== 'consumable' && <button className="px-0.5 bg-slate-700 rounded" onClick={()=>doEquip(it.inv_id)}>装备</button>}
                            {it.category === 'consumable' && <button className="px-0.5 bg-slate-700 rounded" onClick={()=>doUse(it.inv_id)}>使用</button>}
                            <button className="px-0.5 bg-slate-700 rounded" onClick={()=>doDrop(it.inv_id)}>丢弃</button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function OnlineUsers({ users, players, selfId, onChallenge }: { users: User[]; players: User[]; selfId?: number; onChallenge: (id: number) => void }) {
  const [details, setDetails] = useState<any | null>(null);
  const [equip, setEquip] = useState<any[] | null>(null);
  const [open, setOpen] = useState(false);
  async function viewUser(id: number) {
    const res = await fetch(`/api/player/${id}`);
    const data = await res.json();
    const inv = await fetch(`/api/player/${id}/inventory`).then(r=>r.json()).catch(()=>({equip:[]}));
    if (res.ok) {
      const eq = inv.equip||[];
      const addDodge = eq.reduce((s:any,e:any)=> s + (e.add_dodge||0), 0);
      const addCrit  = eq.reduce((s:any,e:any)=> s + (e.add_crit||0), 0);
      const d = data.player || {};
      const eff = { ...d, dodge_index: (d.dodge_index||0) + addDodge, crit_index: (d.crit_index||0) + addCrit };
      setDetails(eff);
      setEquip(eq);
      setOpen(true);
    }
  }
  const onlineIds = new Set(users.map(u=>u.id));
  const ordered = [...players].sort((a,b)=> {
    const ao = onlineIds.has(a.id) ? 0 : 1;
    const bo = onlineIds.has(b.id) ? 0 : 1;
    if (ao !== bo) return ao - bo;
    return a.username.localeCompare(b.username);
  });
  return (
    <div>
      <div className="space-y-1">
        {ordered.map((u) => (
          <div key={u.id} className="flex items-center justify-between text-sm">
            <button className={`text-left hover:underline ${onlineIds.has(u.id) ? 'text-emerald-300' : 'text-slate-500'}`} onClick={() => viewUser(u.id)}>
              {u.username} {u.level ? `(Lv.${u.level})` : ''}
            </button>
            {selfId && selfId !== u.id && onlineIds.has(u.id) ? (
              <button onClick={() => onChallenge(u.id)} className="text-xs text-indigo-300 hover:text-white">切磋</button>
            ) : (
              <span className="text-xs text-slate-600">{onlineIds.has(u.id)? '' : '离线'}</span>
            )}
          </div>
        ))}
      </div>
      {open && details && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-slate-800 border border-slate-700 rounded p-4 w-[90vw] max-w-md">
            <div className="flex items-center justify-between mb-2">
              <div className="font-semibold">{details.username} 的角色</div>
              <button onClick={() => setOpen(false)} className="text-slate-300 hover:text-white">关闭</button>
            </div>
            <div className="space-y-1 text-sm text-slate-300">
              <div>等级：{details.level}</div>
              <div>经验：{details.exp}</div>
              <div>金钱：{details.money}</div>
              <div>武力：{details.atk}</div>
              <div>防御：{details.def}</div>
              <div className="flex justify-between"><span>闪避指数：{details.dodge_index ?? '-'}</span><span>暴击指数：{details.crit_index ?? '-'}</span></div>
              <div>
                <div className="flex justify-between text-xs text-slate-400"><span>HP</span><span>{details.hp}/{details.maxHp ?? details.hp}</span></div>
                <div className="h-2 bg-slate-900 rounded">
                  <div className="h-full bg-emerald-600 rounded" style={{ width: `${Math.max(0, Math.min(100, Math.round(((details.hp) / (details.maxHp ?? details.hp)) * 100)))}%` }} />
                </div>
              </div>
              <div>
                <div className="font-semibold mt-2 mb-1">装备</div>
                <div className="grid grid-cols-3 gap-2">
                  {['weapon','hat','clothes','shoes','necklace','ring'].map((slot) => {
                    const it = (equip||[]).find((e:any)=>e.slot===slot);
                    return (
                      <div key={slot} className="p-2 bg-slate-900 rounded text-xs flex items-center gap-2 relative group">
                        <div className="w-8 h-8 bg-slate-800 rounded flex items-center justify-center overflow-hidden">
                          {it ? (
                            <img src={it.url || 'https://word-war.tos-cn-beijing.volces.com/fc13.png'} alt={it.name} className="w-8 h-8 object-contain" />
                          ) : (
                            <span className="text-slate-600">空</span>
                          )}
                        </div>
                        <div className="truncate">{slot}</div>
                        {it && (
                          <div className="hidden group-hover:block absolute left-full top-0 ml-2 z-50 w-56 p-2 rounded bg-slate-800 border border-slate-700 shadow-lg">
                            <div className="text-slate-100 font-semibold mb-1">{it.name}（{it.category}）</div>
                            <div className="text-slate-300 space-y-0.5">
                              {(() => {
                                const rows: string[] = [];
                                if (it.add_atk) rows.push(`增加攻击 +${it.add_atk}`);
                                if (it.add_def) rows.push(`增加防御 +${it.add_def}`);
                                if (it.add_max_hp) rows.push(`增加最大血量 +${it.add_max_hp}`);
                                if (it.add_dodge) rows.push(`增加闪避指数 +${it.add_dodge}`);
                                if (it.add_attack_speed) rows.push(`增加攻速 +${it.add_attack_speed}`);
                                if (it.add_crit) rows.push(`增加暴击指数 +${it.add_crit}`);
                                return rows.map((r, idx) => (<div key={idx}>{r}</div>));
                              })()}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function BattleViewer({ battle, onClose }: { battle: {summary:string; logs:string[]; left:string; right:string}; onClose: ()=>void }) {
  const [leftPos, setLeftPos] = useState<number>(0); // percent shift from base
  const [rightPos, setRightPos] = useState<number>(0); // percent shift from base (negative to move left)
  const [leftAction, setLeftAction] = useState<'idle'|'walk'|'attack'|'hurt'|'die'>('idle');
  const [rightAction, setRightAction] = useState<'idle'|'walk'|'attack'|'hurt'|'die'>('idle');
  const [leftHP, setLeftHP] = useState<number|undefined>(undefined);
  const [rightHP, setRightHP] = useState<number|undefined>(undefined);
  const [leftMax, setLeftMax] = useState<number>(100);
  const [rightMax, setRightMax] = useState<number>(100);
  const [leftStatus, setLeftStatus] = useState<string>("");
  const [rightStatus, setRightStatus] = useState<string>("");
  const player = useStore.getState().player;
  const players = useStore.getState().players;

  useEffect(() => {
    if (player?.username === battle.left) {
      setLeftHP(player.hp); setLeftMax(player.maxHp || player.hp);
    }
    const other = players.find(p=>p.username===battle.right);
    if (other) {
      fetch(`/api/player/${other.id}`).then(r=>r.json()).then(d=>{ setRightHP(d.player.hp); setRightMax(d.player.maxHp||d.player.hp); });
    }
    // run replay
    let i = 0;
    const run = async () => {
      const sleep = (ms:number)=>new Promise(r=>setTimeout(r,ms));
      for (const line of battle.logs) {
        // parse
        const dodgeM = /^(.+?) 躲闪成功/.exec(line);
        const hitM = /^(.+?)( 暴击)? 对 (.+?) 造成 (\d+) 伤害，剩余HP (\d+)/.exec(line);
        if (hitM) {
          const attacker = hitM[1];
          const crit = !!hitM[2];
          const victim = hitM[3];
          const dmg = parseInt(hitM[4],10);
          const rem = parseInt(hitM[5],10);
          const leftAtk = attacker===battle.left;
          // walk to target
          if (leftAtk) { setLeftAction('walk'); setLeftPos(35); } else { setRightAction('walk'); setRightPos(-35); }
          await sleep(300);
          // attack
          if (leftAtk) setLeftAction('attack'); else setRightAction('attack');
          // victim hurt
          await sleep(200);
          if (leftAtk) { setRightAction('hurt'); setRightHP(rem); setLeftStatus(`造成 ${dmg}${crit?' (暴击)':''} 伤害`); setRightStatus(rem<=0? '阵亡' : `受到 ${dmg} 伤害`); if (rem<=0) setRightAction('die'); }
          else { setLeftAction('hurt'); setLeftHP(rem); setRightStatus(`造成 ${dmg}${crit?' (暴击)':''} 伤害`); setLeftStatus(rem<=0? '阵亡' : `受到 ${dmg} 伤害`); if (rem<=0) setLeftAction('die'); }
          await sleep(300);
          // move back
          if (leftAtk) { setLeftAction('walk'); setLeftPos(0); } else { setRightAction('walk'); setRightPos(0); }
          await sleep(300);
          setLeftAction('idle'); setRightAction('idle');
        } else if (dodgeM) {
          const dodger = dodgeM[1];
          const leftAtk = dodger===battle.right; // if right dodged, left was attacker
          if (leftAtk) { setLeftAction('walk'); setLeftPos(35); await new Promise(r=>setTimeout(r,300)); setLeftAction('attack'); setRightStatus('闪避'); await new Promise(r=>setTimeout(r,200)); setRightAction('idle'); } else { setRightAction('walk'); setRightPos(-35); await new Promise(r=>setTimeout(r,300)); setRightAction('attack'); setLeftStatus('闪避'); await new Promise(r=>setTimeout(r,200)); setLeftAction('idle'); }
          // move back
          await new Promise(r=>setTimeout(r,200));
          if (leftAtk) { setLeftPos(0); setLeftAction('idle'); } else { setRightPos(0); setRightAction('idle'); }
        }
        i++;
      }
    };
    run();
  }, []);

  // assets mapping (placeholder same image for all actions; replace with actual webp assets when available)
  const DEFAULT = 'https://word-war.tos-cn-beijing.volces.com/fc13.png';
  function sprite(job?:string|null, action?:string) {
    // TODO: switch by job+action when you have assets; use same for now
    return DEFAULT;
  }
  const leftPct = Math.max(0, Math.min(100, Math.round(((leftHP ?? leftMax) / (leftMax||1)) * 100)));
  const rightPct = Math.max(0, Math.min(100, Math.round(((rightHP ?? rightMax) / (rightMax||1)) * 100)));

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center">
      <div className="bg-slate-900 border border-slate-700 rounded w-[90vw] max-w-3xl p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="font-semibold">切磋 · {battle.left} vs {battle.right}</div>
          <button onClick={onClose} className="text-slate-300 hover:text-white">关闭</button>
        </div>
        <div className="flex items-center justify-between mb-2">
          <div className="flex-1 mr-2">
            <div className="text-xs text-slate-400 mb-1">{battle.left} HP {leftHP ?? leftMax}/{leftMax}</div>
            <div className="h-2 bg-slate-800 rounded"><div className="h-full bg-emerald-600 rounded" style={{ width: `${leftPct}%` }} /></div>
          </div>
          <div className="flex-1 ml-2 text-right">
            <div className="text-xs text-slate-400 mb-1">{battle.right} HP {rightHP ?? rightMax}/{rightMax}</div>
            <div className="h-2 bg-slate-800 rounded"><div className="h-full bg-rose-600 rounded" style={{ width: `${rightPct}%` }} /></div>
          </div>
        </div>
        <div className="relative h-64 bg-slate-800 border border-slate-700 rounded overflow-hidden">
          <img src={sprite(player?.job, leftAction)} className="absolute bottom-10 transition-all duration-300" style={{ left: `calc(15% + ${leftPos}%)` }} />
          <img src={sprite('opponent', rightAction)} className="absolute bottom-10 transition-all duration-300" style={{ left: `calc(85% + ${rightPos}%)`, transform: 'scaleX(-1)' }} />
          <div className="absolute left-4 bottom-2 text-xs text-slate-200">{leftStatus}</div>
          <div className="absolute right-4 bottom-2 text-xs text-slate-200 text-right">{rightStatus}</div>
        </div>
      </div>
    </div>
  );
}
