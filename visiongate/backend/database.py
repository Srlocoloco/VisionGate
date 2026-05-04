import hashlib

from sqlalchemy import Column, DateTime, Integer, String, create_engine, text
from sqlalchemy.orm import declarative_base, sessionmaker
from sqlalchemy.sql import func

from .config import ROOT

engine = create_engine(
    "sqlite:///" + str(ROOT / "visiongate.db").replace("\\", "/"),
    connect_args={"check_same_thread": False},
)
DB = sessionmaker(bind=engine, autoflush=False, autocommit=False)
Base = declarative_base()


class Usuario(Base):
    __tablename__ = "usuarios"

    id = Column(Integer, primary_key=True)
    nome = Column(String, unique=True)
    senha = Column(String)


class Aluno(Base):
    __tablename__ = "alunos"

    id = Column(Integer, primary_key=True)
    nome = Column(String, unique=True)
    apelido = Column(String)
    turma = Column(String)
    periodo = Column(String, default="manha")
    status = Column(String, default="ativo")
    data_transferencia = Column(String)
    obs_transferencia = Column(String)


class Evento(Base):
    __tablename__ = "eventos"

    id = Column(Integer, primary_key=True)
    aluno = Column(String)
    acao = Column(String)
    hora = Column(DateTime, default=func.now())


def sessao():
    db = DB()
    try:
        yield db
    finally:
        db.close()


def senha_hash(senha: str) -> str:
    return hashlib.sha256(senha.encode()).hexdigest()


def migrar_banco():
    colunas = {
        "apelido": "VARCHAR DEFAULT ''",
        "status": "VARCHAR DEFAULT 'ativo'",
        "data_transferencia": "VARCHAR DEFAULT ''",
        "obs_transferencia": "VARCHAR DEFAULT ''",
        "periodo": "VARCHAR DEFAULT 'manha'",
    }
    with engine.begin() as con:
        for nome, tipo in colunas.items():
            try:
                con.execute(text(f"ALTER TABLE alunos ADD COLUMN {nome} {tipo}"))
            except Exception:
                pass


def iniciar_banco():
    Base.metadata.create_all(bind=engine)
    migrar_banco()

    db = DB()
    try:
        admin = db.execute(text("SELECT id FROM usuarios WHERE nome='admin'")).fetchone()
        if not admin:
            db.add(Usuario(nome="admin", senha=senha_hash("VGate#2025")))
            db.commit()
    finally:
        db.close()


def aluno_ou_404(nome: str, db):
    row = db.execute(text("SELECT id FROM alunos WHERE nome=:nome"), {"nome": nome}).fetchone()
    return bool(row)
