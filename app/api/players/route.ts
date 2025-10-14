import { NextRequest } from "next/server";
import path from "path";
const getDB = () => (eval('require')(path.join(process.cwd(), "server/db.js")).db);

export async function GET(req: NextRequest) {
  const db = getDB();
  const rows = db.prepare("SELECT u.id, u.username, c.level FROM users u LEFT JOIN characters c ON c.user_id=u.id ORDER BY u.id ASC").all();
  return Response.json({ players: rows });
}

