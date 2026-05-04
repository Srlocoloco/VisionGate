if (usuarioLogado()) location.href = "/camera";

async function entrar() {
  const usuario = $("usr").value.trim(),
    senha = $("pwd").value;
  if (!usuario || !senha) return erro("Preencha usuario e senha.");
  try {
    sessionStorage.setItem(
      "vg",
      JSON.stringify(await jsonReq("/login", "POST", { usuario, senha })),
    );
    location.href = "/camera";
  } catch (e) {
    erro(e.message);
  }
}

function erro(msg) {
  $("erro").textContent = msg;
  $("erro").style.display = "block";
}
