import { NextRequest } from "next/server";
import path from "path";
const getDB = () => (eval('require')(path.join(process.cwd(), "server/db.js")).db);

export async function GET(_req: NextRequest) {
  const db = getDB();
  const rows = db.prepare('SELECT id, code, name, idle_url, hurt_url, attack_url, walk_url, die_url FROM jobs').all();
  return Response.json({ jobs: rows });
}

