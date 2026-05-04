const user = exigirLogin();

async function carregar() {
  const dot = $("dot");
  dot.style.color = "#3FB950";
  setTimeout(() => (dot.style.color = "#484F58"), 500);
  $("hora").textContent =
    "Ultima atualizacao: " + new Date().toLocaleTimeString("pt-BR");
  try {
    const [resumo, eventos] = await Promise.all([
      api("/resumo"),
      api("/eventos?limite=15"),
    ]);
    $("c-dentro").textContent = resumo.dentro;
    $("c-fora").textContent = resumo.fora;
    $("c-total").textContent = resumo.total;
    $("c-taxa").textContent = resumo.total
      ? Math.round((resumo.dentro / resumo.total) * 100) + "%"
      : "-";
    $("tabela").innerHTML = eventos.length
      ? eventos
          .map(
            (r) => `<tr>
          <td style="font-weight:600">${r.aluno}</td>
          <td><span class="${r.acao === "ENTRADA" ? "badge-entrada" : "badge-saida"}">
            ${r.acao === "ENTRADA" ? "ENTRADA" : "SAIDA"}
          </span></td>
          <td style="color:#8B949E">${r.hora}</td>
        </tr>`,
          )
          .join("")
      : '<tr><td colspan="3" style="color:#484F58;text-align:center;padding:24px">Nenhum evento ainda.</td></tr>';
  } catch (e) {
    console.warn(e);
  }
}

carregar();
setInterval(carregar, 5000);

async function limparEventos() {
  if (!confirm("Apagar todo o historico de eventos? Os alunos serao mantidos."))
    return;
  const data = await api("/admin/eventos", { method: "DELETE" });
  $("msg-admin").textContent = data.mensagem;
  $("msg-admin").style.color = "#3FB950";
  carregar();
}

async function limparTudo() {
  if (
    !confirm(
      "ATENCAO: Isso vai apagar todos os alunos, fotos e eventos. Tem certeza?",
    )
  )
    return;
  const data = await api("/admin/limpar", { method: "DELETE" });
  $("msg-admin").textContent =
    `${data.mensagem} (${data.fotos_removidas} fotos removidas)`;
  $("msg-admin").style.color = "#F85149";
  carregar();
}
