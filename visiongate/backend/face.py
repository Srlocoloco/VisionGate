from datetime import datetime
from collections import defaultdict

import cv2
import numpy as np
from deepface import DeepFace
from sqlalchemy import text

from .config import DETECTOR, FACES_DIR, LIMIAR, MIN_PRESENCA, MODELO, TEMPO_SAIDA
from .database import DB, Evento

faces = defaultdict(list)
estado = {}
permitidos = set()
apelidos = {}
transferidos = set()


def frame(dados: bytes):
    return cv2.imdecode(np.frombuffer(dados, np.uint8), cv2.IMREAD_COLOR)


def gerar_embedding(img, obrigatorio=True):
    try:
        rostos = DeepFace.represent(
            img_path=img,
            model_name=MODELO,
            detector_backend=DETECTOR,
            enforce_detection=obrigatorio,
            align=True,
        )
        return np.array(rostos[0]["embedding"], dtype=np.float32) if rostos else None
    except Exception:
        return None


def carregar_rostos():
    faces.clear()
    apelidos.clear()
    transferidos.clear()

    for foto in sorted(FACES_DIR.iterdir()):
        if foto.suffix.lower() not in {".jpg", ".jpeg", ".png"}:
            continue
        nome = foto.stem.rsplit("_", 1)[0].replace("_", " ").title()
        embedding = gerar_embedding(str(foto))
        if embedding is not None:
            faces[nome].append(embedding)

    db = DB()
    try:
        alunos = db.execute(text("SELECT nome, apelido, status FROM alunos"))
        for nome, apelido, status in alunos:
            if apelido:
                apelidos[nome] = apelido
            if status == "transferido":
                transferidos.add(nome)
    finally:
        db.close()

    print(f"Rostos carregados: {len(faces)}")


def identificar(embedding):
    nome_final = "Desconhecido"
    menor_distancia = float("inf")
    alvo = embedding / (np.linalg.norm(embedding) + 1e-9)

    for aluno, amostras in faces.items():
        if aluno in transferidos:
            continue
        for amostra in amostras:
            base = amostra / (np.linalg.norm(amostra) + 1e-9)
            distancia = 1 - float(np.dot(alvo, base))
            if distancia < menor_distancia:
                nome_final = aluno
                menor_distancia = distancia

    if menor_distancia > LIMIAR:
        return "Desconhecido", menor_distancia
    return nome_final, menor_distancia


def abrir_portao() -> bool:
    try:
        import serial

        with serial.Serial("COM3", 9600, timeout=1) as arduino:
            arduino.write(b"ABRIR\n")
        return True
    except Exception as erro:
        print(f"Arduino indisponivel: {erro}")
        return False


def salvar_evento(db, aluno: str, acao: str, hora: datetime):
    db.add(Evento(aluno=aluno, acao=acao, hora=hora))
    db.commit()
    abrir_portao()


def processar_acesso(nome: str, agora: datetime, db):
    dados = estado.setdefault(nome, {"dentro": False, "entrada": None, "saida": None})

    if not dados["dentro"]:
        dados.update(dentro=True, entrada=agora)
        salvar_evento(db, nome, "ENTRADA", agora)
        return "ENTRADA", False, 0

    espera = (agora - dados["saida"]).total_seconds() if dados["saida"] else TEMPO_SAIDA + 1
    if nome not in permitidos and espera < TEMPO_SAIDA:
        return None, True, int(TEMPO_SAIDA - espera)

    tempo_dentro = (agora - dados["entrada"]).total_seconds() if dados["entrada"] else MIN_PRESENCA
    dados.update(dentro=False, entrada=None, saida=agora)
    permitidos.discard(nome)
    salvar_evento(db, nome, "SAIDA", agora)

    acao = "SAIDA_RAPIDA" if tempo_dentro < MIN_PRESENCA else "SAIDA"
    return acao, False, 0


def salvar_foto(nome: str, imagem):
    arquivo = FACES_DIR / f"{nome.lower().replace(' ', '_')}_{len(faces[nome])}.jpg"
    cv2.imwrite(str(arquivo), imagem)


def limpar_cache():
    faces.clear()
    estado.clear()
    permitidos.clear()
    apelidos.clear()
    transferidos.clear()
