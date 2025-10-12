import { NextRequest } from "next/server";
import path from "path";
const getDB = () => (eval('require')(path.join(process.cwd(), "server/db.js")).db);
const { verifyToken } = eval('require')(path.join(process.cwd(), "server/auth.js"));

function getEquipBonuses(db:any, uid:number){
  const rows = db.prepare(`SELECT it.* FROM inventory inv JOIN item_templates it ON it.id=inv.template_id WHERE inv.user_id=? AND inv.equipped_slot IS NOT NULL`).all(uid);
  return rows.reduce((acc:any, r:any)=>({
    add_atk: acc.add_atk + (r.add_atk||0),
    add_def: acc.add_def + (r.add_def||0),
    add_max_hp: acc.add_max_hp + (r.add_max_hp||0),
    add_dodge: acc.add_dodge + (r.add_dodge||0),
    add_crit: acc.add_crit + (r.add_crit||0)
  }), {add_atk:0,add_def:0,add_max_hp:0,add_dodge:0,add_crit:0});
}

function slotFromCategory(cat: string): string | null {
  const map: any = { weapon: 'weapon', hat: 'hat', clothes: 'clothes', shoes: 'shoes', necklace: 'necklace', ring: 'ring' };
  return map[cat] || null;
}

export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) return Response.json({ error: "未登录" }, { status: 401 });
  const p = verifyToken(token);
  if (!p) return Response.json({ error: "无效令牌" }, { status: 401 });
  const { itemId } = await req.json();
  const db = getDB();
  const row = db.prepare(`SELECT inv.*, it.category FROM inventory inv JOIN item_templates it ON it.id=inv.template_id WHERE inv.id=? AND inv.user_id=?`).get(itemId, p.uid);
  if (!row) return Response.json({ error: '物品不存在' }, { status: 404 });
  const slot = slotFromCategory(row.category);
  if (!slot) return Response.json({ error: '该物品不可装备' }, { status: 400 });
  if (row.equipped_slot) return Response.json({ error: '物品已装备' }, { status: 400 });
  // if slot occupied, try to move it to bag
  const occupied = db.prepare('SELECT * FROM inventory WHERE user_id=? AND equipped_slot=?').get(p.uid, slot);
  if (occupied) {
    const used = db.prepare('SELECT bag_slot FROM inventory WHERE user_id=? AND bag_slot IS NOT NULL').all(p.uid).map((r:any)=>r.bag_slot);
    let free = -1; for (let i=0;i<24;i++){ if (!used.includes(i)) { free=i; break; } }
    if (free<0) return Response.json({ error: '背包已满' }, { status: 400 });
    db.prepare('UPDATE inventory SET bag_slot=?, equipped_slot=NULL WHERE id=?').run(free, occupied.id);
  }
  db.prepare('UPDATE inventory SET bag_slot=NULL, equipped_slot=? WHERE id=?').run(slot, row.id);
  // return effective player for immediate UI refresh
  const ch = db.prepare('SELECT level, exp, money, atk, def, hp, hp_max, dodge_index, crit_index, dead_remaining_ms FROM characters WHERE user_id=?').get(p.uid);
  const b = getEquipBonuses(db, p.uid);
  const eff = { ...ch, atk: ch.atk + b.add_atk, def: ch.def + b.add_def, hp_max: (ch.hp_max||ch.hp) + b.add_max_hp, dodge_index: (ch.dodge_index||10) + (b.add_dodge||0), crit_index: (ch.crit_index||10) + (b.add_crit||0) };
  return Response.json({ ok: true, player: { ...eff, maxHp: eff.hp_max, deadRemaining: ch.dead_remaining_ms || 0 } });
}
