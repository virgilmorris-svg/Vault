import hashlib
import os
import secrets
import uuid
import logging
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional, List

import bcrypt
import jwt
import httpx
import requests
from dotenv import load_dotenv
from fastapi import FastAPI, APIRouter, Depends, HTTPException, status, Header, UploadFile, File, Form, Response
from starlette.middleware.cors import CORSMiddleware
from starlette.concurrency import run_in_threadpool
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, EmailStr, Field

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

# ---- Config ----
MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]
JWT_SECRET = os.environ.get("JWT_SECRET", "dev-secret-change-in-prod-" + secrets.token_hex(16))
JWT_ISSUER = "sentinelpass-api"
JWT_AUDIENCE = "sentinelpass-mobile"
JWT_ALG = "HS256"
ACCESS_MINUTES = 60
REFRESH_DAYS = 30

# Object storage
STORAGE_BASE = (os.environ.get("INTEGRATION_PROXY_URL") or "").strip() or "https://integrations.emergentagent.com"
STORAGE_URL = STORAGE_BASE.rstrip("/") + "/objstore/api/v1/storage"
EMERGENT_KEY = os.environ.get("EMERGENT_LLM_KEY")
APP_NAME = "sentinelpass"
_storage_key = None


def _init_storage():
    global _storage_key
    if _storage_key:
        return _storage_key
    resp = requests.post(f"{STORAGE_URL}/init", json={"emergent_key": EMERGENT_KEY}, timeout=30)
    resp.raise_for_status()
    _storage_key = resp.json()["storage_key"]
    return _storage_key


def _put_object(path: str, data: bytes, content_type: str) -> dict:
    key = _init_storage()
    resp = requests.put(
        f"{STORAGE_URL}/objects/{path}",
        headers={"X-Storage-Key": key, "Content-Type": content_type},
        data=data,
        timeout=120,
    )
    if resp.status_code == 503:
        # stale key, reset and retry once
        globals()["_storage_key"] = None
        key = _init_storage()
        resp = requests.put(
            f"{STORAGE_URL}/objects/{path}",
            headers={"X-Storage-Key": key, "Content-Type": content_type},
            data=data,
            timeout=120,
        )
    resp.raise_for_status()
    return resp.json()


def _get_object(path: str):
    key = _init_storage()
    resp = requests.get(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": key}, timeout=60)
    resp.raise_for_status()
    return resp.content, resp.headers.get("Content-Type", "application/octet-stream")


client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

app = FastAPI(title="SentinelPass API")
api = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO)
log = logging.getLogger(__name__)


def now() -> datetime:
    return datetime.now(timezone.utc)


def pwd_hash(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt(rounds=12)).decode()


def pwd_verify(password: str, stored: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode(), stored.encode())
    except Exception:
        return False


def make_access(user_id: str) -> str:
    t = now()
    return jwt.encode(
        {"sub": user_id, "type": "access", "iss": JWT_ISSUER, "aud": JWT_AUDIENCE,
         "iat": t, "exp": t + timedelta(minutes=ACCESS_MINUTES), "jti": secrets.token_urlsafe(16)},
        JWT_SECRET, algorithm=JWT_ALG,
    )


def token_digest(t: str) -> str:
    return hashlib.sha256(t.encode()).hexdigest()


def new_refresh() -> str:
    return secrets.token_urlsafe(48)


async def current_user_id(authorization: Optional[str] = Header(None)) -> str:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Missing token")
    token = authorization.split(" ", 1)[1]
    try:
        claims = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG], issuer=JWT_ISSUER, audience=JWT_AUDIENCE)
        if claims.get("type") != "access":
            raise HTTPException(status_code=401, detail="Bad token type")
        return claims["sub"]
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")


# ---- Models ----
class RegisterBody(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)
    kdf_salt: str


class LoginBody(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: dict


class RefreshBody(BaseModel):
    refresh_token: str


class VaultPutBody(BaseModel):
    blob: str
    version: int


class OAuthSessionBody(BaseModel):
    session_id: str


class KdfSaltBody(BaseModel):
    kdf_salt: str


@app.on_event("startup")
async def _init():
    await db.users.create_index("email", unique=True)
    await db.sessions.create_index("token_hash", unique=True)
    await db.sessions.create_index("expires_at", expireAfterSeconds=0)
    await db.vaults.create_index("user_id", unique=True)
    await db.files.create_index([("user_id", 1), ("file_id", 1)])
    try:
        if EMERGENT_KEY:
            _init_storage()
            log.info("Object storage initialized")
    except Exception as e:
        log.error(f"Storage init failed: {e}")
    log.info("SentinelPass API ready")


@app.on_event("shutdown")
async def _close():
    client.close()


@api.get("/")
async def root():
    return {"service": "SentinelPass API", "status": "ok"}


async def _issue_tokens(user_id: str, email: str, device_name: str) -> TokenResponse:
    refresh = new_refresh()
    access = make_access(user_id)
    session_id = secrets.token_urlsafe(12)
    await db.sessions.insert_one({
        "session_id": session_id, "user_id": user_id, "token_hash": token_digest(refresh),
        "device_name": device_name, "created_at": now().isoformat(),
        "last_used_at": now().isoformat(), "expires_at": now() + timedelta(days=REFRESH_DAYS),
    })
    user = await db.users.find_one({"user_id": user_id}, {"_id": 0, "password_hash": 0})
    return TokenResponse(access_token=access, refresh_token=refresh, user=user)


@api.post("/auth/register", response_model=TokenResponse, status_code=201)
async def register(body: RegisterBody):
    email = body.email.lower().strip()
    if len(body.password) < 8:
        raise HTTPException(400, "Password must be at least 8 characters")
    existing = await db.users.find_one({"email": email}, {"_id": 1})
    if existing:
        raise HTTPException(409, "An account with this email already exists")
    user_id = "u_" + secrets.token_urlsafe(9)
    await db.users.insert_one({
        "user_id": user_id, "email": email, "password_hash": pwd_hash(body.password),
        "kdf_salt": body.kdf_salt, "provider": "password",
        "created_at": now().isoformat(),
    })
    await db.vaults.insert_one({"user_id": user_id, "blob": None, "version": 0, "updated_at": now().isoformat()})
    return await _issue_tokens(user_id, email, "New device")


@api.post("/auth/login", response_model=TokenResponse)
async def login(body: LoginBody, x_device_name: Optional[str] = Header(None)):
    email = body.email.lower().strip()
    user = await db.users.find_one({"email": email})
    if not user or not user.get("password_hash") or not pwd_verify(body.password, user["password_hash"]):
        raise HTTPException(401, "Invalid email or password")
    return await _issue_tokens(user["user_id"], email, x_device_name or "Unknown device")


@api.post("/auth/refresh", response_model=TokenResponse)
async def refresh(body: RefreshBody):
    h = token_digest(body.refresh_token)
    sess = await db.sessions.find_one({"token_hash": h})
    if not sess or sess.get("revoked"):
        raise HTTPException(401, "Invalid refresh token")
    if sess["expires_at"].replace(tzinfo=timezone.utc) < now():
        raise HTTPException(401, "Refresh token expired")
    new_r = new_refresh()
    await db.sessions.update_one({"_id": sess["_id"]}, {"$set": {
        "token_hash": token_digest(new_r), "last_used_at": now().isoformat(),
        "expires_at": now() + timedelta(days=REFRESH_DAYS),
    }})
    user = await db.users.find_one({"user_id": sess["user_id"]}, {"_id": 0, "password_hash": 0})
    return TokenResponse(access_token=make_access(sess["user_id"]), refresh_token=new_r, user=user)


@api.post("/auth/logout")
async def logout(body: RefreshBody):
    await db.sessions.update_one({"token_hash": token_digest(body.refresh_token)}, {"$set": {"revoked": True}})
    return {"ok": True}


# ---- Google OAuth via Emergent ----
@api.post("/auth/google/session", response_model=TokenResponse)
async def google_session(body: OAuthSessionBody, x_device_name: Optional[str] = Header(None)):
    """Exchange Emergent session_id for our JWT tokens."""
    try:
        async with httpx.AsyncClient(timeout=15) as c:
            r = await c.get(
                "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
                headers={"X-Session-ID": body.session_id},
            )
        if r.status_code != 200:
            raise HTTPException(401, "Invalid or expired session")
        data = r.json()
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(401, "Failed to verify session")

    email = (data.get("email") or "").lower().strip()
    if not email:
        raise HTTPException(400, "No email in session data")

    user = await db.users.find_one({"email": email})
    if not user:
        user_id = "u_" + secrets.token_urlsafe(9)
        await db.users.insert_one({
            "user_id": user_id, "email": email, "password_hash": None,
            "kdf_salt": None, "provider": "google",
            "name": data.get("name"), "picture": data.get("picture"),
            "created_at": now().isoformat(),
        })
        await db.vaults.insert_one({"user_id": user_id, "blob": None, "version": 0, "updated_at": now().isoformat()})
    else:
        user_id = user["user_id"]

    return await _issue_tokens(user_id, email, x_device_name or "Google Sign-In")


@api.put("/user/kdf-salt")
async def set_kdf_salt(body: KdfSaltBody, user_id: str = Depends(current_user_id)):
    """Set kdf_salt for Google-authenticated users creating their master password."""
    u = await db.users.find_one({"user_id": user_id})
    if not u:
        raise HTTPException(404, "User not found")
    if u.get("kdf_salt"):
        raise HTTPException(409, "Master password already established")
    await db.users.update_one({"user_id": user_id}, {"$set": {"kdf_salt": body.kdf_salt}})
    return {"ok": True}


@api.get("/me")
async def me(user_id: str = Depends(current_user_id)):
    user = await db.users.find_one({"user_id": user_id}, {"_id": 0, "password_hash": 0})
    if not user:
        raise HTTPException(404, "User not found")
    return user


# ---- Vault ----
@api.get("/vault")
async def get_vault(user_id: str = Depends(current_user_id)):
    row = await db.vaults.find_one({"user_id": user_id}, {"_id": 0})
    if not row:
        return {"blob": None, "version": 0}
    return row


@api.put("/vault")
async def put_vault(body: VaultPutBody, user_id: str = Depends(current_user_id)):
    if len(body.blob) > 10_000_000:
        raise HTTPException(413, "Vault too large")
    existing = await db.vaults.find_one({"user_id": user_id})
    if existing and existing.get("version", 0) >= body.version:
        raise HTTPException(409, "Stale vault version")
    await db.vaults.update_one(
        {"user_id": user_id},
        {"$set": {"blob": body.blob, "version": body.version, "updated_at": now().isoformat()}},
        upsert=True,
    )
    return {"version": body.version, "updated_at": now().isoformat()}


# ---- Files (encrypted media) ----
@api.post("/files/upload")
async def upload_file(
    file: UploadFile = File(...),
    file_id: str = Form(...),
    mime: str = Form(default="application/octet-stream"),
    user_id: str = Depends(current_user_id),
):
    """Upload an already-client-side-encrypted blob. The server never sees plaintext."""
    data = await file.read()
    if len(data) > 25 * 1024 * 1024:
        raise HTTPException(413, "File too large (max 25MB)")
    path = f"{APP_NAME}/uploads/{user_id}/{file_id}.bin"
    try:
        result = await run_in_threadpool(_put_object, path, data, "application/octet-stream")
    except Exception as e:
        log.error(f"Upload failed: {e}")
        raise HTTPException(500, "Upload failed")
    await db.files.update_one(
        {"user_id": user_id, "file_id": file_id},
        {"$set": {
            "user_id": user_id, "file_id": file_id, "path": result.get("path", path),
            "size": len(data), "mime": mime, "created_at": now().isoformat(),
        }},
        upsert=True,
    )
    return {"file_id": file_id, "size": len(data)}


@api.get("/files/{file_id}")
async def download_file(file_id: str, user_id: str = Depends(current_user_id)):
    meta = await db.files.find_one({"user_id": user_id, "file_id": file_id, "deleted": {"$ne": True}}, {"_id": 0})
    if not meta:
        raise HTTPException(404, "File not found")
    try:
        content, _ = await run_in_threadpool(_get_object, meta["path"])
    except Exception as e:
        log.error(f"Download failed: {e}")
        raise HTTPException(500, "Download failed")
    return Response(content=content, media_type="application/octet-stream")


@api.delete("/files/{file_id}")
async def delete_file(file_id: str, user_id: str = Depends(current_user_id)):
    """Soft delete — mark deleted in DB. Storage retains blob (no delete API)."""
    r = await db.files.update_one({"user_id": user_id, "file_id": file_id}, {"$set": {"deleted": True}})
    if r.matched_count == 0:
        raise HTTPException(404, "File not found")
    return {"ok": True}


# ---- Sessions ----
@api.get("/sessions")
async def list_sessions(user_id: str = Depends(current_user_id)):
    cursor = db.sessions.find({"user_id": user_id, "revoked": {"$ne": True}}, {"_id": 0, "token_hash": 0, "user_id": 0})
    out = []
    async for s in cursor:
        s["expires_at"] = s["expires_at"].isoformat() if isinstance(s.get("expires_at"), datetime) else s.get("expires_at")
        out.append(s)
    return out


@api.delete("/sessions/{session_id}")
async def revoke_session(session_id: str, user_id: str = Depends(current_user_id)):
    r = await db.sessions.update_one({"session_id": session_id, "user_id": user_id}, {"$set": {"revoked": True}})
    if r.matched_count == 0:
        raise HTTPException(404, "Session not found")
    return {"ok": True}


@api.get("/user/salt")
async def get_salt(email: EmailStr):
    u = await db.users.find_one({"email": email.lower().strip()}, {"_id": 0, "kdf_salt": 1})
    if not u or not u.get("kdf_salt"):
        fake_salt = hashlib.sha256(("saltfor:" + email.lower()).encode()).hexdigest()[:32]
        return {"kdf_salt": fake_salt, "needs_setup": bool(u and not u.get("kdf_salt"))}
    return {"kdf_salt": u["kdf_salt"], "needs_setup": False}


# ---- Breach check (HaveIBeenPwned k-anonymity) ----
class BreachCheckBody(BaseModel):
    prefix: str  # 5-char SHA-1 hex prefix (client-computed)


@api.post("/breach/check")
async def breach_check(body: BreachCheckBody, user_id: str = Depends(current_user_id)):
    """K-anonymity breach lookup. Client sends only the first 5 SHA-1 hex chars.
    We return the list of suffixes+counts from HIBP; the client matches locally.
    """
    prefix = (body.prefix or "").strip().upper()
    if len(prefix) != 5 or not all(c in "0123456789ABCDEF" for c in prefix):
        raise HTTPException(400, "Invalid prefix — must be 5 hex chars")
    try:
        async with httpx.AsyncClient(timeout=10) as c:
            r = await c.get(
                f"https://api.pwnedpasswords.com/range/{prefix}",
                headers={"Add-Padding": "true", "User-Agent": "VauLt-App"},
            )
        if r.status_code != 200:
            raise HTTPException(502, "Breach service unavailable")
        # Response is text: SUFFIX:count per line
        return {"suffixes": r.text}
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(502, "Breach service unavailable")


app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)
