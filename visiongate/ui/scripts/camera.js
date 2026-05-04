const user = exigirLogin(),
  INTERVALO = 3000,
  ROSTO_MIN = 180;
let streamRec = null,
  auto = false,
  timer = null,
  alunoAtual = "",
  modo = "";

async function usarCamera(id) {
  const s = await navigator.mediaDevices.getUserMedia({
    video: { width: 1280, height: 720 },
  });
  $(`vid-${id}`).srcObject = s;
  return s;
}

async function abrirCam() {
  try {
    streamRec = await usarCamera("rec");
  } catch (e) {
    alert("Camera indisponivel: " + e.message);
  }
}

async function abrirCamCad() {
  try {
    await usarCamera("cad");
    guiaCadastro();
  } catch (e) {
    alert("Camera indisponivel: " + e.message);
  }
}

function capturar(id) {
  const v = $(`vid-${id}`),
    c = $(`cnv-${id}`);
  c.width = v.videoWidth || 640;
  c.height = v.videoHeight || 480;
  c.getContext("2d").drawImage(v, 0, 0);
  return c;
}

function guiaCadastro() {
  const v = $("vid-cad"),
    c = $("guia-cad"),
    ctx = c.getContext("2d");
  function loop() {
    c.width = v.clientWidth || 500;
    c.height = v.clientHeight || 380;
    const w = c.width * 0.35,
      h = c.height * 0.55,
      x = (c.width - w) / 2,
      y = (c.height - h) / 2;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.fillStyle = "#0008";
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.clearRect(x, y, w, h);
    ctx.strokeStyle = "#3FB950";
    ctx.lineWidth = 3;
    ctx.strokeRect(x, y, w, h);
    ctx.fillStyle = "#000a";
    ctx.fillRect(x, y + h + 1, w, 22);
    ctx.fillStyle = "#3FB950";
    ctx.font = "bold 11px Segoe UI";
    ctx.textAlign = "center";
    ctx.fillText("Posicione o rosto aqui", x + w / 2, y + h + 15);
    requestAnimationFrame(loop);
  }
  loop();
}

function toggleAuto() {
  if (!streamRec) return alert("Abra a camera primeiro.");
  auto = !auto;
  $("btn-auto").textContent = auto
    ? "Parar Monitoramento"
    : "Iniciar Monitoramento";
  $("btn-auto").className = "btn " + (auto ? "laranja" : "verde");
  $("barra-status").textContent = auto
    ? "MONITORAMENTO ATIVO"
    : "MONITORAMENTO INATIVO";
  $("barra-status").className = auto ? "escaneando" : "parado";
  auto
    ? ((timer = setInterval(escanear, INTERVALO)), escanear())
    : (clearInterval(timer), limparOverlay());
}

function limparOverlay() {
  const o = $("overlay");
  o.getContext("2d").clearRect(0, 0, o.width || 9999, o.height || 9999);
}

async function escanear() {
  if (!auto) return;
  const c = capturar("rec"),
    fd = new FormData();
  fd.append(
    "foto",
    await new Promise((r) => c.toBlob(r, "image/jpeg", 0.9)),
    "frame.jpg",
  );
  try {
    const data = await api("/reconhecer", { method: "POST", body: fd });
    desenhar(c, data.resultados || []);
    (data.resultados || []).forEach(
      (r) =>
        r.nome !== "Desconhecido" &&
        (r.area?.w || 0) >= ROSTO_MIN &&
        logEvento(r),
    );
  } catch (e) {
    console.warn(e);
  }
}

function desenhar(c, lista) {
  const o = $("overlay"),
    v = $("vid-rec"),
    ctx = o.getContext("2d");
  o.width = v.clientWidth;
  o.height = v.clientHeight;
  ctx.clearRect(0, 0, o.width, o.height);
  lista.forEach((r) => {
    const a = r.area || {},
      sx = o.width / c.width,
      sy = o.height / c.height;
    const x = (a.x || 0) * sx,
      y = (a.y || 0) * sy,
      w = (a.w || 0) * sx,
      h = (a.h || 0) * sy;
    const longe = w < ROSTO_MIN * sx,
      cor = longe
        ? "#484F58"
        : r.acao === "SAIDA_RAPIDA" || r.bloqueado
          ? "#E3B341"
          : r.acao === "ENTRADA"
            ? "#3FB950"
            : "#58A6FF";
    const nome = r.exibir || r.nome,
      txt = longe
        ? "Aproxime-se"
        : r.acao === "SAIDA_RAPIDA"
          ? "Saida rapida: " + nome
          : r.bloqueado
            ? nome
            : r.acao
              ? r.acao + " " + nome
              : nome;
    ctx.strokeStyle = cor;
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, w, h);
    ctx.font = "bold 12px Segoe UI";
    ctx.fillStyle = cor;
    ctx.fillRect(x, y - 22, ctx.measureText(txt).width + 16, 22);
    ctx.fillStyle = "#000";
    ctx.fillText(txt, x + 6, y - 6);
  });
}

function logEvento(r) {
  if (!r.acao && !r.bloqueado) return;
  const nome = r.exibir || r.nome,
    div = document.createElement("div"),
    hora = new Date().toLocaleTimeString("pt-BR");
  if (r.bloqueado) {
    const m = Math.floor(r.segundos_restantes / 60),
      s = r.segundos_restantes % 60;
    div.className = "evento ev-bloq";
    div.innerHTML = `<span class="ev-nome">${nome}</span><span class="timer">${m}m ${s}s restantes</span><button class="btn-perm" onclick="permitir('${r.nome}',this)">PERMITIR</button><span class="ev-hora">${hora}</span>`;
  } else if (r.acao === "SAIDA_RAPIDA") {
    div.className = "evento ev-rapida";
    div.innerHTML = `<span class="ev-nome">${nome}</span><span class="ev-acao">SAIDA</span><span class="aviso-rapida">saida rapida - presenca NAO contabilizada</span><span class="ev-hora">${hora}</span>`;
  } else {
    const entrada = r.acao === "ENTRADA";
    div.className = "evento " + (entrada ? "ev-entrada" : "ev-saida");
    div.innerHTML = `<span class="ev-nome">${nome}</span><span class="ev-acao">${r.acao}</span><span class="ev-hora">${hora}</span>`;
  }
  $("log-eventos").prepend(div);
  while ($("log-eventos").children.length > 40)
    $("log-eventos").lastChild.remove();
}

async function permitir(nome, btn) {
  btn.disabled = true;
  btn.textContent = "...";
  try {
    await api("/permitir/" + encodeURIComponent(nome), { method: "POST" });
    btn.textContent = "Liberado";
  } catch (e) {
    btn.disabled = false;
    btn.textContent = "PERMITIR";
  }
}

async function abrirPortao() {
  alert((await api("/portao/abrir", { method: "POST" })).mensagem);
}

async function cadastrar() {
  const nome = $("nome").value.trim(),
    apelido = $("apelido").value.trim(),
    turma = $("turma").value.trim(),
    periodo = $("periodo").value;
  if (!nome) return statusCad("Insira o nome do aluno.", "erro");
  if (!$("vid-cad").srcObject)
    return statusCad("Abra a camera primeiro.", "erro");
  statusCad("Processando...", "info");
  $("btn-cad").disabled = true;
  const c = capturar("cad"),
    w = c.width * 0.35,
    h = c.height * 0.55,
    x = (c.width - w) / 2,
    y = (c.height - h) / 2;
  const crop = document.createElement("canvas");
  crop.width = w;
  crop.height = h;
  crop.getContext("2d").drawImage(c, x, y, w, h, 0, 0, w, h);
  if (w < ROSTO_MIN) {
    $("dica-cad").style.display = "block";
    $("btn-cad").disabled = false;
    return statusCad("Aproxime o rosto da camera.", "aviso");
  }
  $("dica-cad").style.display = "none";
  $("snapshot").src = crop.toDataURL();
  $("snapshot").style.display = "block";
  const fd = new FormData();
  fd.append(
    "foto",
    await new Promise((r) => crop.toBlob(r, "image/jpeg", 0.95)),
    "face.jpg",
  );
  Object.entries({ nome, apelido, turma, periodo }).forEach(([k, v]) =>
    fd.append(k, v),
  );
  try {
    statusCad(
      (await api("/cadastrar", { method: "POST", body: fd })).mensagem,
      "ok",
    );
    ["nome", "apelido", "turma"].forEach((id) => ($(id).value = ""));
    carregarAlunos();
  } catch (e) {
    statusCad(e.message, "erro");
  }
  $("btn-cad").disabled = false;
}

function statusCad(msg, cls) {
  $("st-cad").textContent = msg;
  $("st-cad").className = "status " + cls;
}
function safe(s) {
  return String(s || "").replaceAll("'", "\\'");
}

async function carregarAlunos() {
  const rows = await api("/alunos"),
    badge = { manha: "badge-m", integral: "badge-i", noite: "badge-n" };
  if (!rows.length)
    return ($("lista-alunos").textContent = "Nenhum aluno cadastrado.");
  $("lista-alunos").innerHTML =
    `<table class="tbl-cad"><thead><tr><th>Nome</th><th>Turma</th><th>Periodo</th><th>Acoes</th></tr></thead><tbody>${rows
      .map(
        (r) => `
    <tr><td>${r.nome}${r.apelido ? `<small>${r.apelido}</small>` : ""}</td><td>${r.turma || "-"}</td>
    <td><span class="badge ${badge[r.periodo] || "badge-m"}">${r.periodo}</span></td>
    <td><button class="btn-sm btn-edit" onclick="abrirEditar('${safe(r.nome)}','${safe(r.apelido)}','${safe(r.turma)}','${safe(r.periodo)}')">Editar</button>
    <button class="btn-sm btn-trf" onclick="abrirTransferir('${safe(r.nome)}')">Transferir</button></td></tr>`,
      )
      .join("")}</tbody></table>`;
}

function abrirEditar(nome, apelido, turma, periodo) {
  alunoAtual = nome;
  modo = "editar";
  $("modal-titulo").textContent = "Editar: " + nome;
  $("modal-sub").textContent = "Altere os dados sem perder o historico.";
  $("ed-apelido").value = apelido || "";
  $("ed-turma").value = turma || "";
  $("ed-periodo").value = periodo || "manha";
  $("sec-editar").style.display = "";
  $("sec-transferir").classList.add("oculto");
  abrirModal();
}

function abrirTransferir(nome) {
  alunoAtual = nome;
  modo = "transferir";
  $("modal-titulo").textContent = "Transferir: " + nome;
  $("modal-sub").textContent = "Escolha o tipo de transferencia.";
  $("sec-editar").style.display = "none";
  $("sec-transferir").classList.remove("oculto");
  $("trf-turma").value = "";
  $("trf-obs").value = "";
  selOpt("turma");
  abrirModal();
}

function abrirModal() {
  $("modal-status").style.display = "none";
  $("modal-bg").classList.add("aberto");
}
function fecharModal(e) {
  if (!e || e.target === $("modal-bg"))
    $("modal-bg").classList.remove("aberto");
}

function selOpt(tipo) {
  modo = "trf-" + tipo;
  $("opt-turma").classList.toggle("sel", tipo === "turma");
  $("opt-escola").classList.toggle("sel", tipo === "escola");
  $("form-turma").classList.toggle("oculto", tipo !== "turma");
  $("form-escola").classList.toggle("oculto", tipo !== "escola");
}

function modalStatus(msg, cls) {
  $("modal-status").textContent = msg;
  $("modal-status").className = "status " + cls;
  $("modal-status").style.display = "block";
}

async function salvarEdicao() {
  const body = {
    apelido: $("ed-apelido").value.trim(),
    turma: $("ed-turma").value.trim(),
    periodo: $("ed-periodo").value,
  };
  try {
    modalStatus(
      (
        await jsonReq(
          "/alunos/" + encodeURIComponent(alunoAtual) + "/editar",
          "PATCH",
          body,
        )
      ).mensagem,
      "ok",
    );
    carregarAlunos();
    setTimeout(fecharModal, 900);
  } catch (e) {
    modalStatus("Erro: " + e.message, "erro");
  }
}

async function confirmarTransferencia() {
  const tipo = modo === "trf-escola" ? "escola" : "turma",
    nova_turma = $("trf-turma").value.trim(),
    obs = $("trf-obs").value.trim();
  if (tipo === "turma" && !nova_turma)
    return modalStatus("Informe a nova turma.", "aviso");
  try {
    modalStatus(
      (
        await jsonReq(
          "/alunos/" + encodeURIComponent(alunoAtual) + "/transferir",
          "PATCH",
          { tipo, nova_turma, obs },
        )
      ).mensagem,
      "ok",
    );
    carregarAlunos();
    setTimeout(fecharModal, 1000);
  } catch (e) {
    modalStatus("Erro: " + e.message, "erro");
  }
}

function mudarAba(aba) {
  $$(".tab").forEach((t, i) =>
    t.classList.toggle(
      "ativo",
      (aba === "rec" && i === 0) || (aba === "cad" && i === 1),
    ),
  );
  $("pg-rec").classList.toggle("ativa", aba === "rec");
  $("pg-cad").classList.toggle("ativa", aba === "cad");
  if (aba === "cad") carregarAlunos();
}

carregarAlunos();
