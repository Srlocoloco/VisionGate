"""
VisionGate - API principal.
Rodar: uvicorn api:app --port 8000
"""

from contextlib import asynccontextmanager
from datetime import date, datetime, timedelta

import numpy as np
from deepface import DeepFace
from fastapi import Depends, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.orm import Session

from backend.config import DETECTOR, FACES_DIR, MODELO, PAGES_DIR, UI_DIR
from backend.database import Aluno, iniciar_banco, senha_hash, sessao
from backend.face import (
    abrir_portao,
    apelidos,
    carregar_rostos,
    faces,
    frame,
    gerar_embedding,
    estado,
    identificar,
    limpar_cache,
    permitidos,
    processar_acesso,
    salvar_foto,
    transferidos,
)
from backend.reports import ativos, frequencia, intervalo_tri, linha_relatorio


class LoginInput(BaseModel):
    usuario: str
    senha: str


class EditarInput(BaseModel):
    apelido: str = ""
    turma: str = ""
    periodo: str = ""


class TransferenciaInput(BaseModel):
    tipo: str = "escola"
    nova_turma: str = ""
    obs: str = ""


def pagina(nome: str):
    return FileResponse(PAGES_DIR / f"{nome}.html")


def aluno_ou_404(nome: str, db: Session):
    existe = db.execute(text("SELECT id FROM alunos WHERE nome=:nome"), {"nome": nome}).fetchone()
    if not existe:
        raise HTTPException(404, f"Aluno '{nome}' nao encontrado.")


@asynccontextmanager
async def ao_iniciar(app):
    iniciar_banco()
    carregar_rostos()
    yield


app = FastAPI(title="VisionGate", version="2.0", lifespan=ao_iniciar)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
app.mount("/styles", StaticFiles(directory=UI_DIR / "styles"), name="styles")
app.mount("/scripts", StaticFiles(directory=UI_DIR / "scripts"), name="scripts")


@app.get("/", include_in_schema=False)
def pg_login():
    return pagina("login")


@app.get("/camera", include_in_schema=False)
def pg_camera():
    return pagina("camera")


@app.get("/dashboard", include_in_schema=False)
def pg_dashboard():
    return pagina("dashboard")


@app.get("/relatorio", include_in_schema=False)
def pg_relatorio():
    return pagina("relatorio")


@app.post("/login")
def login(body: LoginInput, db: Session = Depends(sessao)):
    user = db.execute(
        text("SELECT id, nome FROM usuarios WHERE nome=:usuario AND senha=:senha"),
        {"usuario": body.usuario, "senha": senha_hash(body.senha)},
    ).fetchone()

    if not user:
        raise HTTPException(401, "Usuario ou senha incorretos.")
    return {"id": user[0], "nome": user[1]}


@app.post("/reconhecer")
async def reconhecer(foto: UploadFile = File(...), db: Session = Depends(sessao)):
    imagem = frame(await foto.read())
    if imagem is None:
        raise HTTPException(400, "Imagem invalida.")

    try:
        rostos = DeepFace.represent(
            img_path=imagem,
            model_name=MODELO,
            detector_backend=DETECTOR,
            enforce_detection=False,
            align=True,
        )
    except Exception:
        return {"rostos": 0, "resultados": []}

    resultados = []
    for rosto in rostos:
        nome, distancia = identificar(np.array(rosto["embedding"], dtype=np.float32))
        area = rosto.get("facial_area", {})

        if nome == "Desconhecido":
            resultados.append({
                "nome": nome,
                "exibir": nome,
                "acao": None,
                "bloqueado": False,
                "segundos_restantes": 0,
                "area": area,
            })
            continue

        acao, bloqueado, segundos = processar_acesso(nome, datetime.now(), db)
        resultados.append({
            "nome": nome,
            "exibir": apelidos.get(nome, nome),
            "confianca": round(1 - distancia, 3),
            "acao": acao,
            "bloqueado": bloqueado,
            "segundos_restantes": segundos,
            "area": area,
        })

    return {"rostos": len(resultados), "resultados": resultados}


@app.post("/permitir/{nome}")
def permitir(nome: str):
    permitidos.add(nome)
    abrir_portao()
    return {"mensagem": f"{nome} liberado para saida."}


@app.post("/portao/abrir")
def portao_abrir():
    mensagem = "Portao aberto." if abrir_portao() else "Arduino nao conectado (simulado)."
    return {"mensagem": mensagem}


@app.get("/eventos")
def listar_eventos(limite: int = 20, db: Session = Depends(sessao)):
    rows = db.execute(
        text("SELECT aluno, acao, hora FROM eventos ORDER BY hora DESC LIMIT :limite"),
        {"limite": limite},
    )
    return [{"aluno": aluno, "acao": acao, "hora": str(hora)[:19]} for aluno, acao, hora in rows]


@app.post("/cadastrar")
async def cadastrar(
    foto: UploadFile = File(...),
    nome: str = Form(...),
    apelido: str = Form(""),
    turma: str = Form(""),
    periodo: str = Form("manha"),
    db: Session = Depends(sessao),
):
    imagem = frame(await foto.read())
    if imagem is None:
        raise HTTPException(400, "Imagem invalida.")

    embedding = gerar_embedding(imagem)
    if embedding is None:
        raise HTTPException(422, "Nenhum rosto detectado na imagem.")

    faces[nome].append(embedding)
    if apelido:
        apelidos[nome] = apelido
    salvar_foto(nome, imagem)

    existe = db.execute(text("SELECT id FROM alunos WHERE nome=:nome"), {"nome": nome}).fetchone()
    if not existe:
        db.add(Aluno(nome=nome, apelido=apelido or None, turma=turma or None, periodo=periodo))
        db.commit()

    return {"mensagem": f"{nome} cadastrado com sucesso!"}


@app.get("/alunos")
def listar_alunos(status: str = "ativo", db: Session = Depends(sessao)):
    rows = db.execute(
        text(
            "SELECT nome, apelido, turma, periodo, status "
            "FROM alunos WHERE status=:status ORDER BY nome"
        ),
        {"status": status},
    )
    return [
        {
            "nome": nome,
            "apelido": apelido or "",
            "turma": turma or "",
            "periodo": periodo or "manha",
            "status": status,
        }
        for nome, apelido, turma, periodo, status in rows
    ]


@app.get("/alunos/todos")
def listar_todos(db: Session = Depends(sessao)):
    rows = db.execute(
        text(
            "SELECT nome, apelido, turma, periodo, status, data_transferencia "
            "FROM alunos ORDER BY nome"
        )
    )
    return [
        {
            "nome": nome,
            "apelido": apelido or "",
            "turma": turma or "",
            "periodo": periodo or "manha",
            "status": status,
            "data_transferencia": data_transferencia or "",
        }
        for nome, apelido, turma, periodo, status, data_transferencia in rows
    ]


@app.patch("/alunos/{nome}/editar")
def editar_aluno(nome: str, body: EditarInput, db: Session = Depends(sessao)):
    aluno_ou_404(nome, db)
    campos = []
    params = {"nome": nome}

    for coluna, valor in body.dict().items():
        if valor != "":
            campos.append(f"{coluna}=:{coluna}")
            params[coluna] = valor

    if body.apelido != "":
        apelidos[nome] = body.apelido
    if campos:
        db.execute(text(f"UPDATE alunos SET {', '.join(campos)} WHERE nome=:nome"), params)
        db.commit()

    return {"mensagem": f"Dados de {nome} atualizados."}


@app.patch("/alunos/{nome}/transferir")
def transferir(nome: str, body: TransferenciaInput, db: Session = Depends(sessao)):
    aluno_ou_404(nome, db)

    if body.tipo == "turma":
        db.execute(
            text("UPDATE alunos SET turma=:turma WHERE nome=:nome"),
            {"turma": body.nova_turma, "nome": nome},
        )
        db.commit()
        return {"mensagem": f"{nome} transferido para a turma {body.nova_turma}."}

    db.execute(
        text(
            "UPDATE alunos SET status='transferido', data_transferencia=:data, "
            "obs_transferencia=:obs WHERE nome=:nome"
        ),
        {"data": date.today().isoformat(), "obs": body.obs, "nome": nome},
    )
    db.commit()
    transferidos.add(nome)
    return {"mensagem": f"{nome} transferido para outra escola."}


@app.patch("/alunos/{nome}/reativar")
def reativar(nome: str, db: Session = Depends(sessao)):
    aluno_ou_404(nome, db)
    db.execute(
        text(
            "UPDATE alunos SET status='ativo', data_transferencia='', "
            "obs_transferencia='' WHERE nome=:nome"
        ),
        {"nome": nome},
    )
    db.commit()
    transferidos.discard(nome)
    return {"mensagem": f"{nome} reativado."}


@app.get("/resumo")
def resumo(db: Session = Depends(sessao)):
    total = db.execute(text("SELECT COUNT(*) FROM alunos WHERE status='ativo'")).scalar() or 0
    dentro = sum(1 for aluno in estado.values() if aluno["dentro"])
    return {"dentro": dentro, "fora": total - dentro, "total": total}


@app.get("/relatorio/semanal")
def relatorio_semanal(semana: int = 0, db: Session = Depends(sessao)):
    hoje = date.today()
    inicio = hoje - timedelta(days=hoje.weekday()) + timedelta(weeks=semana)
    fim = inicio + timedelta(days=4)
    return {
        "inicio": str(inicio),
        "fim": str(fim),
        "alunos": [linha_relatorio(row, inicio, fim, db) for row in ativos(db)],
    }


@app.get("/relatorio/mensal")
def relatorio_mensal(mes: int = 0, ano: int = 0, db: Session = Depends(sessao)):
    hoje = date.today()
    mes = mes or hoje.month
    ano = ano or hoje.year
    inicio = date(ano, mes, 1)
    fim = date(ano + (mes == 12), (mes % 12) + 1, 1) - timedelta(days=1)
    return {
        "mes": mes,
        "ano": ano,
        "inicio": str(inicio),
        "fim": str(fim),
        "alunos": [linha_relatorio(row, inicio, fim, db) for row in ativos(db)],
    }


@app.get("/relatorio/trimestral")
def relatorio_trimestral(trimestre: int = 0, db: Session = Depends(sessao)):
    numero = trimestre or ((date.today().month - 1) // 3 + 1)
    numero = max(1, min(4, numero))
    inicio, fim = intervalo_tri(numero, date.today().year)
    return {
        "trimestre": numero,
        "inicio": str(inicio),
        "fim": str(fim),
        "alunos": [linha_relatorio(row, inicio, fim, db) for row in ativos(db)],
    }


@app.get("/relatorio/aluno/{nome}")
def relatorio_aluno(nome: str, db: Session = Depends(sessao)):
    row = db.execute(
        text(
            "SELECT nome, apelido, turma, periodo, status, data_transferencia, "
            "obs_transferencia FROM alunos WHERE nome=:nome"
        ),
        {"nome": nome},
    ).fetchone()
    if not row:
        raise HTTPException(404, f"Aluno '{nome}' nao encontrado.")

    aluno, apelido, turma, periodo, status, data_transferencia, obs = row
    periodo = periodo or "manha"
    trimestres = {}

    for numero in range(1, 5):
        inicio, fim = intervalo_tri(numero, date.today().year)
        trimestres[f"T{numero}"] = frequencia(aluno, periodo, inicio, fim, db)

    eventos = db.execute(
        text("SELECT acao, hora FROM eventos WHERE aluno=:nome ORDER BY hora DESC"),
        {"nome": nome},
    )
    return {
        "aluno": aluno,
        "apelido": apelido or "",
        "turma": turma or "-",
        "periodo": periodo,
        "status": status,
        "data_transferencia": data_transferencia or "",
        "obs_transferencia": obs or "",
        "trimestres": trimestres,
        "eventos": [{"acao": acao, "hora": str(hora)[:19]} for acao, hora in eventos],
    }


@app.delete("/admin/limpar")
def limpar_tudo(db: Session = Depends(sessao)):
    db.execute(text("DELETE FROM eventos"))
    db.execute(text("DELETE FROM alunos"))
    db.commit()

    removidas = 0
    for foto in FACES_DIR.iterdir():
        if foto.is_file():
            try:
                foto.unlink()
                removidas += 1
            except Exception:
                pass

    limpar_cache()
    return {"mensagem": "Todos os dados apagados.", "fotos_removidas": removidas}


@app.delete("/admin/eventos")
def limpar_eventos(db: Session = Depends(sessao)):
    db.execute(text("DELETE FROM eventos"))
    db.commit()
    estado.clear()
    return {"mensagem": "Historico de eventos apagado."}
