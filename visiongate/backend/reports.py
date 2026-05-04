from datetime import date, datetime, time as Time, timedelta

from sqlalchemy import text

from .config import HORARIOS, MIN_PRESENCA


def para_datetime(valor):
    return valor if isinstance(valor, datetime) else datetime.fromisoformat(str(valor))


def dias_uteis(inicio: date, fim: date):
    dias = []
    atual = inicio
    limite = min(fim, date.today())

    while atual <= limite:
        if atual.weekday() < 5:
            dias.append(atual)
        atual += timedelta(days=1)

    return dias


def eventos_dia(aluno: str, dia: date, db):
    rows = db.execute(
        text(
            "SELECT acao, hora FROM eventos "
            "WHERE aluno=:aluno AND hora>=:inicio AND hora<=:fim "
            "ORDER BY hora"
        ),
        {
            "aluno": aluno,
            "inicio": datetime.combine(dia, Time.min),
            "fim": datetime.combine(dia, Time.max),
        },
    )

    entradas, saidas = [], []
    for acao, hora in rows:
        destino = entradas if acao == "ENTRADA" else saidas
        destino.append(para_datetime(hora))
    return entradas, saidas


def presenca_valida(entradas, saidas, inicio: Time, fim: Time) -> bool:
    for entrada in entradas:
        saida = next((s for s in saidas if s > entrada), None)
        tempo_ok = saida is None or (saida - entrada).total_seconds() >= MIN_PRESENCA
        if inicio <= entrada.time() <= fim and tempo_ok:
            return True
    return False


def frequencia(aluno: str, periodo: str, inicio: date, fim: date, db):
    dias = dias_uteis(inicio, fim)
    horarios = HORARIOS.get(periodo, HORARIOS["manha"])
    presencas = 0
    faltas_manha = []
    faltas_tarde = []

    for dia in dias:
        entradas, saidas = eventos_dia(aluno, dia, db)
        for indice, (inicio_turno, fim_turno) in enumerate(horarios):
            if presenca_valida(entradas, saidas, inicio_turno, fim_turno):
                presencas += 1
            elif periodo == "integral" and indice == 1:
                faltas_tarde.append(dia)
            else:
                faltas_manha.append(dia)

    total_aulas = len(dias) * len(horarios)
    faltas = len(faltas_manha) + len(faltas_tarde)

    return {
        "dias_uteis": len(dias),
        "total_aulas": total_aulas,
        "presencas": presencas,
        "faltas": faltas,
        "faltas_manha": [str(d) for d in faltas_manha],
        "faltas_tarde": [str(d) for d in faltas_tarde],
        "frequencia": round(presencas / total_aulas * 100, 1) if total_aulas else 0,
    }


def ativos(db):
    return db.execute(
        text(
            "SELECT nome, apelido, turma, periodo, status, data_transferencia "
            "FROM alunos WHERE status='ativo' ORDER BY turma, nome"
        )
    ).fetchall()


def linha_relatorio(row, inicio: date, fim: date, db):
    nome, apelido, turma, periodo, status, data_transferencia = row
    periodo = periodo or "manha"
    return {
        "aluno": nome,
        "apelido": apelido or "",
        "turma": turma or "-",
        "periodo": periodo,
        "status": status,
        "data_transferencia": data_transferencia or "",
        **frequencia(nome, periodo, inicio, fim, db),
    }


def intervalo_tri(numero: int, ano: int):
    mes = 1 + (numero - 1) * 3
    inicio = date(ano, mes, 1)
    fim = date(ano, mes + 3, 1) - timedelta(days=1) if numero < 4 else date(ano, 12, 31)
    return inicio, fim
