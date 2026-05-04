const $ = (id) => document.getElementById(id);
const $$ = (sel) => document.querySelectorAll(sel);

async function api(url, op = {}) {
  const r = await fetch(url, op),
    data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.detail || data.mensagem || r.statusText);
  return data;
}

const jsonReq = (url, method, body) =>
  api(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

const usuarioLogado = () => JSON.parse(sessionStorage.getItem("vg") || "null");

function exigirLogin() {
  const user = usuarioLogado();
  if (!user) return (location.href = "/"), null;
  if ($("usuario")) $("usuario").textContent = user.nome;
  return user;
}

function sair() {
  sessionStorage.removeItem("vg");
  location.href = "/";
}
