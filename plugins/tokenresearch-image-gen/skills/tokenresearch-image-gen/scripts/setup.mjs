import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";

const MAX_BODY_BYTES = 8192;
const SESSION_MS = 15 * 60_000;
const page = readFileSync(new URL("../assets/setup.html", import.meta.url), "utf8");

function send(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
}

async function readForm(req) {
  const body = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new Error("Form too large");
    body.push(chunk);
  }
  return JSON.parse(Buffer.concat(body).toString("utf8"));
}

function verificationMessage(error) {
  if ([401, 403].includes(error.status)) return "密钥无效或无权访问。请从词元智研控制台复制完整密钥后重试。";
  if (error.status === 429) return "验证请求过于频繁，请稍后重试。";
  return "暂时无法连接词元智研验证密钥，请检查网络或稍后重试。";
}

export async function runSetup({ fetchModels, save, currentModel, onReady, sessionMs = SESSION_MS }) {
  const route = "/setup/" + randomBytes(24).toString("hex");
  const nonce = randomBytes(18).toString("base64");
  let origin;
  let host;
  let pending;
  let busy = false;
  let result = null;
  let finish;
  const complete = new Promise((resolve) => { finish = resolve; });

  const server = createServer(async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Security-Policy", `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`);
    if (req.headers.host !== host || req.url !== route) return send(res, 404, {});
    if (req.method === "GET") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      return res.end(page.replaceAll("__NONCE__", nonce));
    }
    if (req.method !== "POST" || req.headers.origin !== origin || req.headers["content-type"] !== "application/json") {
      return send(res, 403, { error: "请重新打开插件提供的设置页面。" });
    }
    if (Number(req.headers["content-length"]) > MAX_BODY_BYTES) return send(res, 413, { error: "输入内容过长。" });
    if (busy || result) return send(res, 409, { error: "正在处理，请稍后再试。" });
    busy = true;
    try {
      let form;
      try {
        form = await readForm(req);
      } catch {
        return send(res, 400, { error: "无法读取设置内容，请重试。" });
      }

      let model = form?.model;
      if (form?.action === "verify") {
        pending = null;
        const key = typeof form.key === "string" ? form.key.trim() : "";
        if (!/^[!-~]{8,4096}$/.test(key)) return send(res, 400, { error: "请粘贴从控制台复制的完整 API 密钥。" });
        let models;
        try {
          models = await fetchModels(key);
        } catch (error) {
          return send(res, 502, { error: verificationMessage(error) });
        }
        if (models.length === 0) {
          return send(res, 422, { error: "此密钥的分组没有插件支持的生图模型。请在控制台选择支持生图的分组，重新创建并粘贴密钥。" });
        }
        model = models.includes(currentModel) ? currentModel : models.length === 1 ? models[0] : null;
        pending = { key, models };
        if (!model) return send(res, 200, { models });
      } else if (form?.action !== "save" || !pending?.models.includes(model)) {
        return send(res, 400, { error: "请选择列表中的生图模型，或重新验证密钥。" });
      }
      if (!server.listening) return send(res, 410, { error: "设置已超时，请回到聊天重新打开。" });
      try {
        if (!save(pending.key, model)) {
          pending = null;
          return send(res, 409, { error: "另一个设置页面已经保存了密钥。请回到聊天继续使用，或重新开始更换密钥。" });
        }
      } catch {
        pending = null;
        return send(res, 500, { error: "无法写入本机配置。请检查客户端是否允许写入个人目录，再粘贴密钥重试。" });
      }
      result = { model };
      pending = null;
      res.once("finish", () => close(result));
      send(res, 200, result);
    } finally {
      busy = false;
    }
  });
  server.requestTimeout = 20_000;
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  host = "127.0.0.1:" + server.address().port;
  origin = "http://" + host;
  const timer = setTimeout(() => close(result), sessionMs);
  function close(saved) {
    clearTimeout(timer);
    pending = null;
    server.close(() => finish(saved));
    server.closeIdleConnections?.();
    if (!saved) server.closeAllConnections?.();
  }
  onReady(origin + route);
  return complete;
}
