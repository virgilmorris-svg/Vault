import hashlib
import os
import secrets
import logging
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional

import bcrypt
import jwt
from dotenv import load_dotenv
from fastapi import FastAPI, APIRouter, Depends, HTTPException, Header, UploadFile, File, Form, Response
from starlette.middleware.cors import CORSMiddleware
from starlette.concurrency import run_in_threadpool
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, EmailStr, Field
from google.oauth2 import id_token as google_id_token
from google.auth.transport import requests as google_requests

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

# ---- Config ----
MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]
JWT_SECRET = os.environ.get("JWT_SECRET", "dev-secret-change-in-prod-" + secrets.token_hex(16))
GOOGLE_ANDROID_CLIENT_ID = os.environ.get("GOOGLE_ANDROID_CLIENT_ID", "").strip()
JWT_ISSUER = "sentinelpass-api"
JWT_AUDIENCE = "sentinelpass-mobile"
JWT_ALG = "HS256"
ACCESS_MINUTES = 60
REFRESH_DAYS = 30
APP_NAME = "sentinelpass"

# Encrypted media storage lives only on this VPS volume.
STORAGE_ROOT = Path(os.environ.get("LOCAL_STORAGE_DIR", "/data/storage")).resolve()
STORAGE_ROOT.mkdir(parents=True, exist_ok=True)


def _physical_path(logical_path: str) -> Path:
    digest = hashlib.sha256(logical_path.encode("utf-8")).hexdigest()
    return STORAGE_ROOT / f"{digest}.bin"


def _put_object(path: str, data: bytes, content_type: str) -> dict:
    target = _physical_path(path)
    tmp = target.with_suffix(".tmp")
    tmp.write_bytes(data)
    os.replace(tmp, target)
    return {"path": path, "size": len(data), "content_type": content_type}


def _get_object(path: str):
    target = _physical_path(path)
    if not target.is_file():
        raise FileNotFoundError(path)
    return target.read_bytes(), "application/octet-stream"


def _delete_object(path: str) -> None:
    target = _physical_path(path)
    try:
        target.unlink()
    except FileNotFoundError:
        pass


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
        {
            "sub": user_id,
            "type": "access",
            "iss": JWT_ISSUER,
            "aud": JWT_AUDIENCE,
            "iat": t,
            "exp": t + timedelta(minutes=ACCESS_MINUTES),
            "jti": secrets.token_urlsafe(16),
        },
        JWT_SECRET,
        algorithm=JWT_ALG,
    )


def token_digest(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def new_refresh() -> str:
    return secrets.token_urlsafe(48)


async def current_user_id(authorization: Optional[str] = Header(None)) -> str:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Missing token")
    token = authorization.split(" ", 1)[1]
    try:
        claims = jwt.decode(
            token,
            JWT_SECRET,
            algorithms=[JWT_ALG],
            issuer=JWT_ISSUER,
            audience=JWT_AUDIENCE,
        )
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


class GoogleTokenBody(BaseModel):
    # Kept as session_id for compatibility with the existing mobile state layer.
    # It now contains a Google ID token, not an Emergent session identifier.
    session_id: str


class KdfSaltBody(BaseModel):
    kdf_salt: str


@app.on_event("startup")
async def _init():
    await db.users.create_index("email", unique=True)
    await db.users.create_index("google_sub", unique=True, sparse=True)
    await db.sessions.create_index("token_hash", unique=True)
    await db.sessions.create_index("expires_at", expireAfterSeconds=0)
    await db.vaults.create_index("user_id", unique=True)
    await db.files.create_index([("user_id", 1), ("file_id", 1)], unique=True)
    log.info("SentinelPass API ready; local encrypted storage at %s", STORAGE_ROOT)


@app.on_event("shutdown")
async def _close():
    client.close()


@app.get("/health")
async def health():
    return {"status": "ok"}


@api.get("/")
async def root():
    return {"service": "SentinelPass API", "status": "ok"}


async def _issue_tokens(user_id: str, email: str, device_name: str) -> TokenResponse:
    refresh = new_refresh()
    access = make_access(user_id)
    session_id = secrets.token_urlsafe(12)
    await db.sessions.insert_one(
        {
            "session_id": session_id,
            "user_id": user_id,
            "token_hash": token_digest(refresh),
            "device_name": device_name,
            "created_at": now().isoformat(),
            "last_used_at": now().isoformat(),
            "expires_at": now() + timedelta(days=REFRESH_DAYS),
        }
    )
    user = await db.users.find_one({"user_id": user_id}, {"_id": 0, "password_hash": 0})
    return TokenResponse(access_token=access, refresh_token=refresh, user=user)


@api.post("/auth/register", response_model=TokenResponse, status_code=201)
async def register(body: RegisterBody):
    email = body.email.lower().strip()
    existing = await db.users.find_one({"email": email}, {"_id": 1})
    if existing:
        raise HTTPException(409, "An account with this email already exists")
    user_id = "u_" + secrets.token_urlsafe(9)
    await db.users.insert_one(
        {
            "user_id": user_id,
            "email": email,
            "password_hash": pwd_hash(body.password),
            "kdf_salt": body.kdf_salt,
            "provider": "password",
            "created_at": now().isoformat(),
        }
    )
    await db.vaults.insert_one(
        {"user_id": user_id, "blob": None, "version": 0, "updated_at": now().isoformat()}
    )
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
    expires_at = sess.get("expires_at")
    if not expires_at:
        raise HTTPException(401, "Refresh token expired")
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at < now():
        raise HTTPException(401, "Refresh token expired")
    new_r = new_refresh()
    await db.sessions.update_one(
        {"_id": sess["_id"]},
        {
            "$set": {
                "token_hash": token_digest(new_r),
                "last_used_at": now().isoformat(),
                "expires_at": now() + timedelta(days=REFRESH_DAYS),
            }
        },
    )
    user = await db.users.find_one({"user_id": sess["user_id"]}, {"_id": 0, "password_hash": 0})
    return TokenResponse(access_token=make_access(sess["user_id"]), refresh_token=new_r, user=user)


@api.post("/auth/logout")
async def logout(body: RefreshBody):
    await db.sessions.update_one(
        {"token_hash": token_digest(body.refresh_token)}, {"$set": {"revoked": True}}
    )
    return {"ok": True}


# ---- Google OAuth, verified directly by this VPS ----
@api.post("/auth/google/session", response_model=TokenResponse)
async def google_session(body: GoogleTokenBody, x_device_name: Optional[str] = Header(None)):
    if not GOOGLE_ANDROID_CLIENT_ID:
        raise HTTPException(503, "Google Sign-In is not configured on this server")

    try:
        data = await run_in_threadpool(
            google_id_token.verify_oauth2_token,
            body.session_id,
            google_requests.Request(),
            GOOGLE_ANDROID_CLIENT_ID,
        )
    except Exception as exc:
        log.warning("Google ID token verification failed: %s", exc)
        raise HTTPException(401, "Invalid Google ID token")

    google_sub = (data.get("sub") or "").strip()
    email = (data.get("email") or "").lower().strip()
    if not google_sub or not email or data.get("email_verified") is not True:
        raise HTTPException(401, "Google account could not be verified")

    user = await db.users.find_one({"google_sub": google_sub})
    if not user:
        existing = await db.users.find_one({"email": email})
        if existing:
            # Migrate accounts that were previously created through Emergent Google auth.
            if existing.get("provider") != "google":
                raise HTTPException(
                    409,
                    "An account with this email already exists. Sign in with your account password.",
                )
            user = existing
            await db.users.update_one(
                {"_id": user["_id"]},
                {
                    "$set": {
                        "google_sub": google_sub,
                        "email": email,
                        "name": data.get("name"),
                        "picture": data.get("picture"),
                    }
                },
            )
            user_id = user["user_id"]
        else:
            user_id = "u_" + secrets.token_urlsafe(9)
            await db.users.insert_one(
                {
                    "user_id": user_id,
                    "google_sub": google_sub,
                    "email": email,
                    "password_hash": None,
                    "kdf_salt": None,
                    "provider": "google",
                    "name": data.get("name"),
                    "picture": data.get("picture"),
                    "created_at": now().isoformat(),
                }
            )
            await db.vaults.insert_one(
                {"user_id": user_id, "blob": None, "version": 0, "updated_at": now().isoformat()}
            )
    else:
        user_id = user["user_id"]
        await db.users.update_one(
            {"_id": user["_id"]},
            {"$set": {"email": email, "name": data.get("name"), "picture": data.get("picture")}},
        )

    return await _issue_tokens(user_id, email, x_device_name or "Google Sign-In")


@api.put("/user/kdf-salt")
async def set_kdf_salt(body: KdfSaltBody, user_id: str = Depends(current_user_id)):
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


class DeleteAccountBody(BaseModel):
    confirmation: str
    password: Optional[str] = None


@api.delete("/account")
async def delete_account(body: DeleteAccountBody, user_id: str = Depends(current_user_id)):
    user = await db.users.find_one({"user_id": user_id})
    if not user:
        raise HTTPException(404, "User not found")
    if body.confirmation.lower().strip() != user["email"]:
        raise HTTPException(400, "Confirmation does not match your e-mail address")
    if user.get("password_hash"):
        if not body.password or not pwd_verify(body.password, user["password_hash"]):
            raise HTTPException(401, "Incorrect account password")

    cursor = db.files.find({"user_id": user_id}, {"path": 1})
    async for row in cursor:
        path = row.get("path")
        if path:
            await run_in_threadpool(_delete_object, path)

    await db.sessions.delete_many({"user_id": user_id})
    await db.vaults.delete_many({"user_id": user_id})
    await db.files.delete_many({"user_id": user_id})
    await db.users.delete_one({"user_id": user_id})
    log.info("Account deleted: %s", user_id)
    return {"ok": True, "deleted": True}


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


# ---- Files (already encrypted on the phone) ----
@api.post("/files/upload")
async def upload_file(
    file: UploadFile = File(...),
    file_id: str = Form(...),
    mime: str = Form(default="application/octet-stream"),
    user_id: str = Depends(current_user_id),
):
    data = await file.read()
    if len(data) > 25 * 1024 * 1024:
        raise HTTPException(413, "File too large (max 25MB)")
    path = f"{APP_NAME}/uploads/{user_id}/{file_id}.bin"
    try:
        result = await run_in_threadpool(_put_object, path, data, "application/octet-stream")
    except Exception as exc:
        log.error("Upload failed: %s", exc)
        raise HTTPException(500, "Upload failed")
    await db.files.update_one(
        {"user_id": user_id, "file_id": file_id},
        {
            "$set": {
                "user_id": user_id,
                "file_id": file_id,
                "path": result.get("path", path),
                "size": len(data),
                "mime": mime,
                "created_at": now().isoformat(),
                "deleted": False,
            }
        },
        upsert=True,
    )
    return {"file_id": file_id, "size": len(data)}


@api.get("/files/{file_id}")
async def download_file(file_id: str, user_id: str = Depends(current_user_id)):
    meta = await db.files.find_one(
        {"user_id": user_id, "file_id": file_id, "deleted": {"$ne": True}}, {"_id": 0}
    )
    if not meta:
        raise HTTPException(404, "File not found")
    try:
        content, _ = await run_in_threadpool(_get_object, meta["path"])
    except FileNotFoundError:
        raise HTTPException(404, "File not found")
    except Exception as exc:
        log.error("Download failed: %s", exc)
        raise HTTPException(500, "Download failed")
    return Response(content=content, media_type="application/octet-stream")


@api.delete("/files/{file_id}")
async def delete_file(file_id: str, user_id: str = Depends(current_user_id)):
    meta = await db.files.find_one({"user_id": user_id, "file_id": file_id})
    if not meta:
        raise HTTPException(404, "File not found")
    if meta.get("path"):
        await run_in_threadpool(_delete_object, meta["path"])
    await db.files.delete_one({"_id": meta["_id"]})
    return {"ok": True}


# ---- Sessions ----
@api.get("/sessions")
async def list_sessions(user_id: str = Depends(current_user_id)):
    cursor = db.sessions.find(
        {"user_id": user_id, "revoked": {"$ne": True}},
        {"_id": 0, "token_hash": 0, "user_id": 0},
    )
    out = []
    async for session in cursor:
        if isinstance(session.get("expires_at"), datetime):
            session["expires_at"] = session["expires_at"].isoformat()
        out.append(session)
    return out


@api.delete("/sessions/{session_id}")
async def revoke_session(session_id: str, user_id: str = Depends(current_user_id)):
    result = await db.sessions.update_one(
        {"session_id": session_id, "user_id": user_id}, {"$set": {"revoked": True}}
    )
    if result.matched_count == 0:
        raise HTTPException(404, "Session not found")
    return {"ok": True}


@api.get("/user/salt")
async def get_salt(email: EmailStr):
    user = await db.users.find_one({"email": email.lower().strip()}, {"_id": 0, "kdf_salt": 1})
    if not user or not user.get("kdf_salt"):
        fake_salt = hashlib.sha256(("saltfor:" + email.lower()).encode()).hexdigest()[:32]
        return {"kdf_salt": fake_salt, "needs_setup": bool(user and not user.get("kdf_salt"))}
    return {"kdf_salt": user["kdf_salt"], "needs_setup": False}


app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)
