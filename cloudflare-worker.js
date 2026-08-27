/**
 * 组会求生舱 · AI 公共额度代理（部署到 Cloudflare Worker）
 *
 * 部署步骤：
 * 1. 注册/登录 https://dash.cloudflare.com
 * 2. 左侧 Workers & Pages → Create application → Create Worker → 名字填 zuhuisurvive → Deploy
 * 3. 点 Edit code，把本文件全部内容粘贴进去替换默认代码
 * 4. 右上 Deploy
 * 5. 回到该 Worker 的 Settings → Variables and Secrets → Add：
 *    Type 选 Secret，Name 填 SF_KEY，Value 粘贴你的硅基流动 Key（sk-…）→ Deploy
 * 6. 把 Worker 的访问地址（形如 https://zuhuisurvive.<你的子域>.workers.dev）发给我
 */

const MODEL = 'deepseek-ai/DeepSeek-V4-Flash';
const ALLOWED_ORIGIN = 'https://huanglihui123456789-web.github.io';

// 轻量防刷：每 IP 每日调用上限（内存计数，重启清零——够拦截脚本级薅羊毛）
const ipCount = new Map();
const LIMIT_PER_IP = 60; // 每天/IP 最多 60 次 AI 调用

const cors = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

    const origin = request.headers.get('Origin') || '';
    if (!origin.startsWith(ALLOWED_ORIGIN)) {
      return json({ error: 'forbidden origin' }, 403);
    }
    if (request.method !== 'POST') return json({ error: 'method not allowed' }, 405);

    // 限额检查
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    const today = new Date().toISOString().slice(0, 10);
    const key = today + '|' + ip;
    const n = (ipCount.get(key) || 0) + 1;
    ipCount.set(key, n);
    // 清理过期键，防止无限膨胀
    if (ipCount.size > 5000) for (const k of ipCount.keys()) if (!k.startsWith(today)) ipCount.delete(k);
    if (n > LIMIT_PER_IP) return json({ error: '今日免费额度已用完，明天再来' }, 429);

    let body;
    try { body = await request.json(); } catch (e) { return json({ error: 'bad json' }, 400); }
    const msgs = body.messages;
    if (!Array.isArray(msgs) || msgs.length === 0 || msgs.length > 6) return json({ error: 'bad messages' }, 400);

    const sfResp = await fetch('https://api.siliconflow.cn/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + env.SF_KEY },
      body: JSON.stringify({
        model: MODEL,
        messages: msgs,
        temperature: body.temperature ?? 0.75,
        max_tokens: Math.min(body.max_tokens ?? 900, 1200),
      }),
      signal: AbortSignal.timeout(35000),
    });

    const data = await sfResp.text();
    return new Response(data, { status: sfResp.status, headers: { ...cors, 'Content-Type': 'application/json' } });
  },
};

function json(obj, status) {
  return new Response(JSON.stringify(obj), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}
