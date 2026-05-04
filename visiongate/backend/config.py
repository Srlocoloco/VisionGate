from datetime import time as Time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
UI_DIR = ROOT / "ui"
PAGES_DIR = UI_DIR / "pages"
FACES_DIR = ROOT / "data" / "faces"
FACES_DIR.mkdir(parents=True, exist_ok=True)

MODELO = "Facenet512"
DETECTOR = "mtcnn"
LIMIAR = 0.35
TEMPO_SAIDA = 15 * 60
MIN_PRESENCA = 30 * 60

HORARIOS = {
    "manha": [(Time(7, 45), Time(11, 50))],
    "integral": [(Time(7, 45), Time(11, 50)), (Time(12, 50), Time(16, 45))],
    "noite": [(Time(19, 0), Time(23, 0))],
}
