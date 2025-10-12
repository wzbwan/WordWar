import { NextRequest } from "next/server";
import path from "path";
const getDB = () => (eval('require')(path.join(process.cwd(), "server/db.js")).db);
const { verifyToken } = eval('require')(path.join(process.cwd(), "server/auth.js"));

function levelUpExp(level: number) {
  return 12 + 2 * (level - 1);
}

export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) return Response.json({ error: "未登录" }, { status: 401 });
  const payload = verifyToken(token);
  if (!payload) return Response.json({ error: "无效令牌" }, { status: 401 });

  const now = Date.now();
  const db = getDB();
  const ch = db.prepare("SELECT * FROM characters WHERE user_id=?").get(payload.uid);
  if (!ch) return Response.json({ error: "角色不存在" }, { status: 400 });

  // 使用 exp_bank 实现累计在线分钟的存点；若为 0 则提示冷却中
  const bank = Number(ch.exp_bank || 0);
  if (bank <= 0) {
    return Response.json({ error: "冷却中，无可存分钟" }, { status: 429 });
  }

  let { level, exp, atk, def, hp, hp_max, dodge_index = 10, crit_index = 10 } = ch;
  const gain = 12 * bank;
  exp += gain;
  const perMin = 55 + 18 * (Math.max(1, level) - 1);
  const moneyGain = perMin * bank;
  const row = db.prepare("SELECT money FROM characters WHERE user_id=?").get(payload.uid);
  const newMoney = Math.max(0, Number(row?.money || 0) + moneyGain);
  let leveled = false;
  let levelGain = 0;
  while (exp >= levelUpExp(level)) {
    exp -= levelUpExp(level);
    level += 1;
    atk += 4;
    hp += 18;
    hp_max += 18;
    def += 2;
    leveled = true;
    levelGain += 1;
  }

  if (leveled) {
    // Level up restores full health
    hp = hp_max;
    dodge_index += levelGain;
    crit_index += levelGain;
  }

  db.prepare("UPDATE characters SET level=?, exp=?, atk=?, def=?, hp=?, hp_max=?, dodge_index=?, crit_index=?, exp_bank=?, money=? WHERE user_id=?").run(
    level, exp, atk, def, hp, hp_max, dodge_index, crit_index, 0, newMoney, payload.uid
  );

  if (leveled) {
    const text = `玩家${payload.username} 升至 ${level} 级！`;
    db.prepare("INSERT INTO messages (user_id, content, type, ts) VALUES (?,?,?,?)").run(payload.uid, text, "system", now);
  }

  return Response.json({ ok: true, bank, gain, moneyGain });
}
