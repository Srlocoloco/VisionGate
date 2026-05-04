const user = exigirLogin();
let dados = [],
  abaAtiva = "semanal";

$("sel-mes").value = new Date().getMonth() + 1;
$("inp-ano").value = new Date().getFullYear();
$("sel-tri").value = Math.floor(new Date().getMonth() / 3) + 1;

const fmt = (iso) => (!iso ? "-" : iso.split("-").reverse().join("/"));
const safe = (s) => String(s || "").replaceAll("'", "\\'");
const periodo = (p) =>
  p === "integral"
    ? '<span class="badge-i">Integral</span>'
    : p === "noite"
      ? '<span class="badge-n">Noite</span>'
      : '<span class="badge-m">Manha</span>';
const situacao = (f) =>
  f >= 75
    ? '<span class="ok-txt">Aprovado</span>'
    : '<span class="bad-txt">Reprovado</span>';
const corFreq = (f) => (f >= 75 ? "#3FB950" : f >= 50 ? "#E3B341" : "#F85149");

function mudarAba(aba) {
  abaAtiva = aba;
  dados = [];
  ["semanal", "mensal", "trimestral", "transferidos"].forEach((a, i) => {
    $$(".tab")[i].classList.toggle("ativo", a === aba);
    $("ctrl-" + a).classList.toggle("oculto", a !== aba);
  });
  $("cards").classList.add("oculto");
  $("conteudo").innerHTML = '<div class="sem-dados">Calculando...</div>';
  ({
    semanal: carregarSemanal,
    mensal: carregarMensal,
    trimestral: carregarTrimestral,
    transferidos: carregarTransferidos,
  })[aba]();
}

async function carregarSemanal() {
  const r = await buscar(`/relatorio/semanal?semana=${$("sel-sem").value}`);
  if (r) fecharCarga(r, "sem", `Semana: ${fmt(r.inicio)} a ${fmt(r.fim)}`);
}

async function carregarMensal() {
  const r = await buscar(
    `/relatorio/mensal?mes=${$("sel-mes").value}&ano=${$("inp-ano").value}`,
  );
  if (r) fecharCarga(r, "men", `Mes: ${fmt(r.inicio)} a ${fmt(r.fim)}`);
}

async function carregarTrimestral() {
  const r = await buscar(
    `/relatorio/trimestral?trimestre=${$("sel-tri").value}`,
  );
  if (r)
    fecharCarga(
      r,
      "tri",
      `${r.trimestre} Trimestre: ${fmt(r.inicio)} a ${fmt(r.fim)}`,
    );
}

async function carregarTransferidos() {
  const r = await buscar("/alunos/todos");
  if (!r) return;
  dados = r.filter((a) => a.status === "transferido");
  $("cards").classList.add("oculto");
  $("rodape").textContent = "";
  filtrar("trf");
}

async function buscar(url) {
  $("conteudo").innerHTML = '<div class="sem-dados">Calculando...</div>';
  try {
    return await api(url);
  } catch (e) {
    $("conteudo").innerHTML = '<div class="sem-dados">Erro ao carregar.</div>';
  }
}

function fecharCarga(r, suf, rodape) {
  dados = r.alunos;
  atualizarCards();
  filtrar(suf);
  $("rodape").textContent = rodape;
  // Atualiza cabecalho de impressao
  $("ph-periodo").textContent = rodape;
  $("ph-gerado").textContent  = "Gerado em: " + new Date().toLocaleString("pt-BR");
  $("pr-al").textContent = dados.length;
  $("pr-ut").textContent = dados[0]?.dias_uteis || 0;
  $("pr-fa").textContent = dados.reduce((s, a) => s + a.faltas, 0);
  $("pr-fr").textContent =
    (dados.reduce((s, a) => s + a.frequencia, 0) / dados.length).toFixed(1) + "%";
}

function atualizarCards() {
  if (!dados.length) return $("cards").classList.add("oculto");
  $("c-al").textContent = dados.length;
  $("c-ut").textContent = dados[0]?.dias_uteis || 0;
  $("c-fa").textContent = dados.reduce((s, a) => s + a.faltas, 0);
  $("c-fr").textContent =
    (dados.reduce((s, a) => s + a.frequencia, 0) / dados.length).toFixed(1) +
    "%";
  $("cards").classList.remove("oculto");
}

function filtrar(suf) {
  const busca = ($("busca-" + suf)?.value || "").toLowerCase();
  const lista = dados.filter((a) =>
    (a.aluno || a.nome || "").toLowerCase().includes(busca),
  );
  abaAtiva === "transferidos" ? renderTransferidos(lista) : renderTabela(lista);
}

function renderTabela(alunos) {
  if (!alunos.length)
    return ($("conteudo").innerHTML =
      '<div class="sem-dados">Nenhum aluno encontrado.</div>');
  alunos.sort((a, b) => b.faltas - a.faltas);
  $("conteudo").innerHTML =
    `<table><thead><tr><th>ALUNO</th><th>TURMA</th><th>PERIODO</th><th>AULAS</th><th>PRESENCAS</th><th>FALTAS MN</th><th>FALTAS TD</th><th>FREQUENCIA</th><th>SITUACAO</th></tr></thead><tbody>
    ${alunos.map((a, i) => linhaAluno(a, i)).join("")}</tbody></table>`;
}

function linhaAluno(a, i) {
  const c = corFreq(a.frequencia);
  return `<tr>
    <td><button class="btn-exp nome-link" onclick="abrirModal('${safe(a.aluno)}')">+ ${a.apelido ? `${a.aluno} (${a.apelido})` : a.aluno}</button></td>
    <td>${a.turma}</td><td>${periodo(a.periodo)}</td><td>${a.total_aulas}</td><td class="ok-txt">${a.presencas}</td>
    <td>${faltas(a.faltas_manha, "m" + i, "Manha")}</td>
    <td>${a.periodo === "integral" ? faltas(a.faltas_tarde, "t" + i, "Tarde") : "-"}</td>
    <td><div class="freq"><div class="barra"><div class="barra-fill" style="width:${a.frequencia}%;background:${c}"></div></div><b style="color:${c}">${a.frequencia}%</b></div></td>
    <td>${situacao(a.frequencia)}</td></tr>`;
}

function faltas(lista, id, titulo) {
  return `<span class="${lista.length ? "bad-txt" : "ok-txt"}">${lista.length}</span>${lista.length ? `<button class="btn-exp" onclick="toggleFl('${id}')">ver datas</button><div class="faltas-lista" id="fl-${id}">${titulo}: ${lista.map(fmt).join(" / ")}</div>` : ""}`;
}

function renderTransferidos(alunos) {
  if (!alunos.length)
    return ($("conteudo").innerHTML =
      '<div class="sem-dados">Nenhum aluno transferido.</div>');
  $("conteudo").innerHTML =
    `<table><thead><tr><th>ALUNO</th><th>TURMA</th><th>PERIODO</th><th>TRANSFERIDO EM</th><th>HISTORICO</th><th>ACAO</th></tr></thead><tbody>
    ${alunos.map((a) => `<tr class="transferido"><td>${a.nome}${a.apelido ? ` (${a.apelido})` : ""}</td><td>${a.turma || "-"}</td><td>${periodo(a.periodo)}</td><td><span class="badge-t">${fmt(a.data_transferencia)}</span></td><td><button class="btn-g" onclick="abrirModal('${safe(a.nome)}')">Ver Relatorio</button></td><td><button class="btn-s" onclick="reativar('${safe(a.nome)}')">Reativar</button></td></tr>`).join("")}</tbody></table>`;
}

function toggleFl(id) {
  const el = $("fl-" + id),
    bt = el.previousElementSibling,
    aberto = el.style.display === "block";
  el.style.display = aberto ? "none" : "block";
  bt.textContent = aberto ? "ver datas" : "ocultar datas";
}

async function abrirModal(nome) {
  const d = await api("/relatorio/aluno/" + encodeURIComponent(nome));
  $("m-nome").textContent = d.aluno + (d.apelido ? ` (${d.apelido})` : "");
  $("m-sub").textContent =
    `${d.turma} - ${d.periodo}` +
    (d.status === "transferido"
      ? ` - Transferido em ${fmt(d.data_transferencia)}`
      : "") +
    (d.obs_transferencia ? ` (${d.obs_transferencia})` : "");
  $("m-tri").innerHTML = Object.entries(d.trimestres)
    .map(
      ([k, t]) =>
        `<div class="tri-box"><div class="tv" style="color:${corFreq(t.frequencia)}">${t.frequencia}%</div><div class="tl">${k}</div><div class="tf">${t.presencas} pres. / ${t.faltas} faltas</div></div>`,
    )
    .join("");
  $("m-eventos").innerHTML = d.eventos.length
    ? d.eventos
        .map(
          (e) =>
            `<div class="evt-row"><b class="${e.acao === "ENTRADA" ? "ok-txt" : "blue-txt"}">${e.acao}</b><span>${e.hora}</span></div>`,
        )
        .join("")
    : '<div class="sem-dados">Nenhum evento registrado.</div>';
  $("modal-bg").classList.add("aberto");
}

function fecharModal(e) {
  if (!e || e.target === $("modal-bg"))
    $("modal-bg").classList.remove("aberto");
}

async function reativar(nome) {
  if (confirm("Reativar " + nome + "?")) {
    await api("/alunos/" + encodeURIComponent(nome) + "/reativar", {
      method: "PATCH",
    });
    carregarTransferidos();
  }
}

carregarSemanal();

// ── Impressao ─────────────────────────────────────────────────────
function imprimir() {
  try {
    // Aba transferidos tem estrutura diferente — usa listagem simples
    if (abaAtiva === 'transferidos') {
      imprimirTransferidos(); return;
    }

    if (!dados.length) {
      alert('Gere o relatorio antes de imprimir.');
      return;
    }

    const rodape  = $("rodape").textContent;
    const agora   = new Date().toLocaleString("pt-BR");
    const tFaltas = dados.reduce((s, a) => s + (a.faltas || 0), 0);
    const tFreq   = (dados.reduce((s, a) => s + (a.frequencia || 0), 0) / dados.length).toFixed(1);
    const diasU   = dados[0]?.dias_uteis || 0;

    const linhas = dados.map((a) => {
      const c   = corFreq(a.frequencia || 0);
      const per = a.periodo === 'integral' ? 'Integral'
                : a.periodo === 'noite'    ? 'Noite' : 'Manha';
      const sit = (a.frequencia || 0) >= 75
        ? '<span class="pi-ok">Aprovado</span>'
        : '<span class="pi-bad">Reprovado</span>';

      const fmDatas = (a.faltas_manha || []).map(fmt).join(' | ');
      const fmn = (a.faltas_manha || []).length
        ? `<span class="pi-bad">${a.faltas_manha.length}</span>
           <div class="pi-faltas-datas">${fmDatas}</div>`
        : '<span class="pi-ok">0</span>';

      const ftDatas = (a.faltas_tarde || []).map(fmt).join(' | ');
      const ftd = a.periodo === 'integral'
        ? ((a.faltas_tarde || []).length
            ? `<span class="pi-bad">${a.faltas_tarde.length}</span>
               <div class="pi-faltas-datas">${ftDatas}</div>`
            : '<span class="pi-ok">0</span>')
        : '<span class="pi-muted">—</span>';

      const barraW = Math.round((a.frequencia || 0) * 0.5);
      const barra  = `<span class="pi-barra" style="width:${barraW}pt;background:${c}"></span>`;

      return `<tr>
        <td><b>${a.aluno || ''}</b>${a.apelido ? ` <span class="pi-muted">(${a.apelido})</span>` : ''}</td>
        <td>${a.turma || '—'}</td>
        <td>${per}</td>
        <td style="text-align:center">${a.total_aulas || 0}</td>
        <td style="text-align:center" class="pi-ok">${a.presencas || 0}</td>
        <td>${fmn}</td>
        <td>${ftd}</td>
        <td><div class="pi-freq">${barra}&nbsp;<b style="color:${c}">${a.frequencia || 0}%</b></div></td>
        <td>${sit}</td>
      </tr>`;
    }).join('');

    $("area-impressao").innerHTML = `
      <div class="pi-header">
        <div>
          <h1>VISIONGATE — RELATORIO DE FREQUENCIA</h1>
          <p>${rodape}</p>
        </div>
        <div class="pi-meta">
          <p>Gerado em: ${agora}</p>
          <p>Manha: 07:45-11:50 &nbsp;|&nbsp; Tarde: 12:50-16:45 &nbsp;|&nbsp; Noite: 19:00-23:00</p>
        </div>
      </div>

      <div class="pi-resumo">
        <span>Alunos: <b>${dados.length}</b></span>
        <span>Dias uteis: <b>${diasU}</b></span>
        <span>Total faltas: <b>${tFaltas}</b></span>
        <span>Freq. media: <b>${tFreq}%</b></span>
        <span>Aprovados: <b class="pi-ok">${dados.filter(a => (a.frequencia||0) >= 75).length}</b></span>
        <span>Reprovados: <b class="pi-bad">${dados.filter(a => (a.frequencia||0) < 75).length}</b></span>
      </div>

      <table class="pi-tabela">
        <thead><tr>
          <th>ALUNO</th><th>TURMA</th><th>PERIODO</th><th>AULAS</th>
          <th>PRESENCAS</th><th>FALTAS MANHA</th><th>FALTAS TARDE</th>
          <th>FREQUENCIA</th><th>SITUACAO</th>
        </tr></thead>
        <tbody>${linhas}</tbody>
      </table>`;

    window.print();

  } catch (err) {
    console.error('Erro ao imprimir:', err);
    alert('Erro ao preparar impressao: ' + err.message);
  }
}

function imprimirTransferidos() {
  if (!dados.length) { alert('Nenhum aluno transferido para imprimir.'); return; }
  const agora = new Date().toLocaleString('pt-BR');
  const linhas = dados.map(a => `<tr>
    <td><b>${a.nome || ''}</b>${a.apelido ? ` (${a.apelido})` : ''}</td>
    <td>${a.turma || '—'}</td>
    <td>${a.periodo === 'integral' ? 'Integral' : a.periodo === 'noite' ? 'Noite' : 'Manha'}</td>
    <td>${fmt(a.data_transferencia)}</td>
  </tr>`).join('');

  $("area-impressao").innerHTML = `
    <div class="pi-header">
      <div><h1>VISIONGATE — ALUNOS TRANSFERIDOS</h1></div>
      <div class="pi-meta"><p>Gerado em: ${agora}</p></div>
    </div>
    <table class="pi-tabela">
      <thead><tr><th>ALUNO</th><th>TURMA</th><th>PERIODO</th><th>DATA TRANSFERENCIA</th></tr></thead>
      <tbody>${linhas}</tbody>
    </table>`;

  window.print();
}
