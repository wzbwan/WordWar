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
  }), {add_atk:0,add_def:0,add_max_hp:0});
}

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) return Response.json({ error: "未登录" }, { status: 401 });
  const payload = verifyToken(token);
  if (!payload) return Response.json({ error: "无效令牌" }, { status: 401 });

  const db = getDB();
  const ch = db.prepare("SELECT level, exp, money, atk, def, hp, hp_max, dodge_index, crit_index, dead_remaining_ms FROM characters WHERE user_id=?").get(payload.uid);
  const user = db.prepare("SELECT id, username FROM users WHERE id=?").get(payload.uid);
  const b = getEquipBonuses(db, payload.uid);
  const eff = { ...ch, atk: ch.atk + b.add_atk, def: ch.def + b.add_def, hp_max: (ch.hp_max||ch.hp) + b.add_max_hp, dodge_index: (ch.dodge_index||10) + (b.add_dodge||0), crit_index: (ch.crit_index||10) + (b.add_crit||0) };
  return Response.json({ player: { ...eff, id: user.id, username: user.username, maxHp: eff.hp_max, deadRemaining: ch.dead_remaining_ms || 0 } });
}
