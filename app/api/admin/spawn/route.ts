import { NextRequest } from "next/server";

function checkAdmin(req: NextRequest) {
  const key = req.headers.get('x-admin-key');
  const need = process.env.ADMIN_KEY;
  if (need && key !== need) return false;
  return true;
}

export async function POST(req: NextRequest) {
  if (!checkAdmin(req)) return Response.json({ error: 'forbidden' }, { status: 403 });
  const body = await req.json();
  const type = body.type;
  const tpl = body.template_id || 1;
  const url = new URL(`http://localhost:${process.env.WS_PORT || 3001}/admin/${type === 'coinrain' ? 'coinrain' : 'monster'}`);
  url.searchParams.set('tpl', String(tpl));
  if (process.env.ADMIN_KEY) url.searchParams.set('key', process.env.ADMIN_KEY);
  const res = await fetch(url.toString());
  const text = await res.text();
  if (!res.ok) return Response.json({ error: text || 'spawn failed' }, { status: 500 });
  return Response.json({ ok: true });
}

