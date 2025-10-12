"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { create } from "zustand";

type Msg = { id: string; type: "chat" | "system" | "battle"; user?: string; content: string; ts: number; details?: string[] };
type User = { id: number; username: string; level?: number };
type Player = { id?: number; username?: string; level: number; exp: number; money: number; atk: number; def: number; hp: number; maxHp?: number; dodge_index?: number; crit_index?: number; deadRemaining?: number };

type Store = {
  messages: Msg[];
  users: User[];
  player?: Player;
  coinrain?: { event_id: string | number; endAt: number };
  monster?: { hp: number; max_hp: number; cell: number; endsAt: number };
  pushMsg: (m: Msg) => void;
  setUsers: (u: User[]) => void;
  setPlayer: (p: Player) => void;
  setCoinrain: (c?: { event_id: string; endAt: number }) => void;
  setMonster: (m?: { hp: number; max_hp: number; cell: number; endsAt: number }) => void;
};

const useStore = create<Store>((set) => ({
  messages: [],
  users: [],
  pushMsg: (m) => set((s) => ({ messages: [...s.messages, m].slice(-500) })),
  setUsers: (u) => set({ users: u }),
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
  const { messages, users, player, pushMsg, setUsers, setPlayer, coinrain, setCoinrain, monster, setMonster } = useStore();
  const [pvpDetails, setPvpDetails] = useState<string[] | null>(null);
  const [nextHitAt, setNextHitAt] = useState<number>(0);
  const listRef = useRef<HTMLDivElement | null>(null);
  const [invOpen, setInvOpen] = useState(false);
  const [bag, setBag] = useState<any[]>([]);
  const [equip, setEquip] = useState<any[]>([]);

  useEffect(() => {
    if (!token) {
      window.location.href = "/";
      return;
    }
    fetch("/api/player", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((d) => setPlayer(d.player))
      .catch(() => {});

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
      }
      if (msg.type === "monster.spawn") {
        pushMsg({ id: uid(), type: "system", content: msg.payload.text, ts: Date.now() });
      }
      if (msg.type === "monster.state") {
        setMonster({ hp: msg.payload.hp, max_hp: msg.payload.max_hp, cell: msg.payload.cell, endsAt: msg.payload.endsAt });
      }
      if (msg.type === "monster.end") {
        setMonster(undefined);
        pushMsg({ id: uid(), type: "system", content: msg.payload.text, ts: Date.now() });
      }
    };
    const ping = setInterval(() => {
      ws.readyState === 1 && ws.send(JSON.stringify({ type: "ping" }));
    }, 30000);
    return () => {
      clearInterval(ping);
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
    if (details && details.length) setPvpDetails(details);
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
          <div className="font-semibold mb-2">在线玩家</div>
          <OnlineUsers users={users} selfId={player?.id} onChallenge={challenge} />
        </div>
      </div>
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
            <button disabled={!!(player?.deadRemaining && player.deadRemaining>0)} onClick={storeExp} className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-500 rounded disabled:opacity-50">存点</button>
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
                       <span className="text-2xl">👾</span>
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

function OnlineUsers({ users, selfId, onChallenge }: { users: User[]; selfId?: number; onChallenge: (id: number) => void }) {
  const [details, setDetails] = useState<any | null>(null);
  const [open, setOpen] = useState(false);
  async function viewUser(id: number) {
    const res = await fetch(`/api/player/${id}`);
    const data = await res.json();
    if (res.ok) {
      setDetails(data.player);
      setOpen(true);
    }
  }
  return (
    <div>
      <div className="space-y-1">
        {users.map((u) => (
          <div key={u.id} className="flex items-center justify-between text-sm">
            <button className="text-left hover:underline" onClick={() => viewUser(u.id)}>{u.username} {u.level ? `(Lv.${u.level})` : ''}</button>
            {selfId && selfId !== u.id && (
              <button onClick={() => onChallenge(u.id)} className="text-xs text-indigo-300 hover:text-white">切磋</button>
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
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
