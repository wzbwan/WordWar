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

export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) return Response.json({ error: "未登录" }, { status: 401 });
  const p = verifyToken(token);
  if (!p) return Response.json({ error: "无效令牌" }, { status: 401 });
  const { itemId } = await req.json();
  const db = getDB();
  const row = db.prepare(`SELECT inv.*, it.category, it.add_current_hp FROM inventory inv JOIN item_templates it ON it.id=inv.template_id WHERE inv.id=? AND inv.user_id=?`).get(itemId, p.uid);
  if (!row) return Response.json({ error: '物品不存在' }, { status: 404 });
  if (row.category !== 'consumable') return Response.json({ error: '该物品不可使用' }, { status: 400 });
  const ch = db.prepare('SELECT hp, hp_max FROM characters WHERE user_id=?').get(p.uid);
  const inc = Math.max(0, row.add_current_hp || 0);
  const newHp = Math.min(ch.hp_max, ch.hp + inc);
  db.prepare('UPDATE characters SET hp=? WHERE user_id=?').run(newHp, p.uid);
  if (row.count > 1) {
    db.prepare('UPDATE inventory SET count=count-1 WHERE id=?').run(row.id);
  } else {
    db.prepare('DELETE FROM inventory WHERE id=?').run(row.id);
  }
  const b = getEquipBonuses(db, p.uid);
  const eff = { ...ch, hp: newHp, atk: ch.atk + b.add_atk, def: ch.def + b.add_def, hp_max: (ch.hp_max||ch.hp) + b.add_max_hp, dodge_index: (ch.dodge_index||10) + (b.add_dodge||0), crit_index: (ch.crit_index||10) + (b.add_crit||0) };
  return Response.json({ ok: true, hp: newHp, player: { ...eff, maxHp: eff.hp_max } });
}
