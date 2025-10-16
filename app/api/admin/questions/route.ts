import { NextRequest } from "next/server";
import path from "path";
const getDB = () => (eval('require')(path.join(process.cwd(), "server/db.js")).db);

function checkAdmin(req: NextRequest) {
  const key = req.headers.get('x-admin-key');
  const need = process.env.ADMIN_KEY;
  if (need && key !== need) return false;
  return true;
}

export async function GET(req: NextRequest) {
  if (!checkAdmin(req)) return Response.json({ error: 'forbidden' }, { status: 403 });
  const { searchParams } = new URL(req.url);
  const bankId = searchParams.get('bank_id');
  const db = getDB();
  let rows;
  if (bankId) rows = db.prepare('SELECT * FROM questions WHERE bank_id=? ORDER BY id ASC').all(Number(bankId));
  else rows = db.prepare('SELECT * FROM questions ORDER BY id ASC').all();
  return Response.json({ data: rows });
}

export async function POST(req: NextRequest) {
  if (!checkAdmin(req)) return Response.json({ error: 'forbidden' }, { status: 403 });
  const body = await req.json();
  const db = getDB();
  const bank_id = Number(body.bank_id);
  if (!bank_id) return Response.json({ error: 'missing bank_id' }, { status: 400 });
  const type = String(body.type||'').toLowerCase();
  const content = String(body.content||'');
  // normalize options
  let options: string | null = null;
  if (body.options !== undefined && body.options !== null && body.options !== '') {
    try {
      if (typeof body.options === 'string' && body.options.trim().startsWith('[')) options = body.options.trim();
      else if (Array.isArray(body.options)) options = JSON.stringify(body.options);
      else options = JSON.stringify(String(body.options).split(',').map((s)=>s.trim()).filter(Boolean));
    } catch { options = null; }
  }
  // normalize answer
  let answer: string = '';
  try {
    if (type === 'multiple') {
      if (Array.isArray(body.answer)) answer = JSON.stringify(body.answer);
      else if (typeof body.answer === 'string' && body.answer.trim().startsWith('[')) answer = body.answer.trim();
      else answer = JSON.stringify(String(body.answer||'').split(',').map((s)=>s.trim()).filter(Boolean));
    } else if (type === 'true_false') {
      const v = (typeof body.answer === 'boolean') ? body.answer : (String(body.answer).toLowerCase()==='true' || String(body.answer).trim()==='对');
      answer = JSON.stringify(!!v);
    } else {
      answer = JSON.stringify(String(body.answer||'').trim());
    }
  } catch { answer = JSON.stringify(String(body.answer||'')); }

  try {
    if (body.id) {
      db.prepare('UPDATE questions SET bank_id=?, type=?, content=?, options=?, answer=?, explanation=? WHERE id=?')
        .run(bank_id, type, content, options, answer, body.explanation ?? null, Number(body.id));
      return Response.json({ ok: true, id: Number(body.id) });
    } else {
      const res = db.prepare('INSERT INTO questions (bank_id, type, content, options, answer, explanation) VALUES (?,?,?,?,?,?)')
        .run(bank_id, type, content, options, answer, body.explanation ?? null);
      return Response.json({ ok: true, id: Number(res.lastInsertRowid) });
    }
  } catch (e:any) {
    return Response.json({ error: 'save failed' }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest) {
  if (!checkAdmin(req)) return Response.json({ error: 'forbidden' }, { status: 403 });
  const { searchParams } = new URL(req.url);
  const id = Number(searchParams.get('id') || 0);
  if (!id) return Response.json({ error: 'bad id' }, { status: 400 });
  const db = getDB();
  try {
    db.prepare('DELETE FROM questions WHERE id=?').run(id);
    return Response.json({ ok: true });
  } catch (e:any) {
    return Response.json({ error: 'delete failed' }, { status: 400 });
  }
}

