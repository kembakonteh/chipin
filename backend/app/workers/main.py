# ARQ worker entry point.
# Referenced by the chipin-worker systemd service:
#   python -m arq app.workers.main.WorkerSettings
from app.workers.tasks import WorkerSettings

__all__ = ["WorkerSettings"]
