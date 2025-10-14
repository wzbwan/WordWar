import { NextRequest } from "next/server";
import path from "path";
const getDB = () => (eval('require')(path.join(process.cwd(), "server/db.js")).db);

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const db = getDB();
  const uid = Number(params.id);
  if (!Number.isFinite(uid)) return Response.json({ error: 'bad id' }, { status: 400 });
  const equip = db.prepare(`
    SELECT inv.id AS inv_id, inv.template_id, inv.equipped_slot as slot, it.*
    FROM inventory inv JOIN item_templates it ON it.id=inv.template_id
    WHERE inv.user_id=? AND inv.equipped_slot IS NOT NULL
  `).all(uid);
  return Response.json({ equip });
}

