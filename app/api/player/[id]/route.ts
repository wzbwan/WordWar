import { NextRequest } from "next/server";
import path from "path";
const getDB = () => (eval('require')(path.join(process.cwd(), "server/db.js")).db);

function getEquipBonuses(db:any, uid:number){
  const rows = db.prepare(`SELECT it.* FROM inventory inv JOIN item_templates it ON it.id=inv.template_id WHERE inv.user_id=? AND inv.equipped_slot IS NOT NULL`).all(uid);
  return rows.reduce((acc:any, r:any)=>({
    add_atk: acc.add_atk + (r.add_atk||0),
    add_def: acc.add_def + (r.add_def||0),
    add_max_hp: acc.add_max_hp + (r.add_max_hp||0),
  }), {add_atk:0,add_def:0,add_max_hp:0});
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const db = getDB();
  const uid = Number(params.id);
  if (!Number.isFinite(uid)) return Response.json({ error: 'bad id' }, { status: 400 });
  const ch = db.prepare("SELECT level, exp, money, atk, def, hp, hp_max, dodge_index, crit_index, dead_remaining_ms FROM characters WHERE user_id=?").get(uid);
  const user = db.prepare("SELECT id, username FROM users WHERE id=?").get(uid);
  if (!user || !ch) return Response.json({ error: 'not found' }, { status: 404 });
  const b = getEquipBonuses(db, uid);
  const eff = { ...ch, atk: ch.atk + b.add_atk, def: ch.def + b.add_def, hp_max: (ch.hp_max||ch.hp) + b.add_max_hp, dodge_index: (ch.dodge_index||10) + (b.add_dodge||0), crit_index: (ch.crit_index||10) + (b.add_crit||0) };
  return Response.json({ player: { ...eff, id: user.id, username: user.username, maxHp: eff.hp_max, deadRemaining: ch.dead_remaining_ms || 0 } });
}
