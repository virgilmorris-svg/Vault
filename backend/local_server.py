import hashlib
import mimetypes
import os
from pathlib import Path

from starlette.responses import JSONResponse

import server

# Store encrypted media directly on the VPS instead of Emergent object storage.
# The Android app already encrypts media before upload; the backend stores only ciphertext.
STORAGE_ROOT = Path(os.environ.get("LOCAL_STORAGE_DIR", "/data/storage")).resolve()
STORAGE_ROOT.mkdir(parents=True, exist_ok=True)


def _physical_path(logical_path: str) -> Path:
    # Never use user-controlled path fragments as filesystem paths.
    # Hash the logical object key into a flat, traversal-safe filename.
    digest = hashlib.sha256(logical_path.encode("utf-8")).hexdigest()
    return STORAGE_ROOT / f"{digest}.bin"


def _put_local_object(path: str, data: bytes, content_type: str) -> dict:
    target = _physical_path(path)
    tmp = target.with_suffix(".tmp")
    tmp.write_bytes(data)
    os.replace(tmp, target)
    return {"path": path, "size": len(data), "content_type": content_type}


def _get_local_object(path: str):
    target = _physical_path(path)
    if not target.is_file():
        raise FileNotFoundError(path)
    content_type = mimetypes.guess_type(path)[0] or "application/octet-stream"
    return target.read_bytes(), content_type


# Disable Emergent object storage and replace storage functions used by server.py.
# Emergent remains used only by the Google sign-in flow in server.py.
server.EMERGENT_KEY = None
server._put_object = _put_local_object
server._get_object = _get_local_object


# The original backend exposes a HaveIBeenPwned route. The self-hosted deployment
# deliberately blocks it so runtime traffic cannot leave IONOS except for Google sign-in.
@server.app.middleware("http")
async def block_external_breach_lookup(request, call_next):
    if request.url.path == "/api/breach/check":
        return JSONResponse({"detail": "External breach checks are disabled"}, status_code=404)
    return await call_next(request)


app = server.app
