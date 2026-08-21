"""SentinelPass backend API tests - covers auth, vault, sessions, user salt."""
import os
import secrets
import base64
import pytest
import requests

BASE_URL = os.environ.get("EXPO_BACKEND_URL") or "https://secure-vault-sync-2.preview.emergentagent.com"
BASE_URL = BASE_URL.rstrip("/")
API = f"{BASE_URL}/api"


def _rand_email():
    # Backend lowercases emails on store; keep test emails lowercase for equality checks.
    return f"test_{secrets.token_hex(6)}@sentineltest.dev"


def _rand_salt():
    return base64.b64encode(secrets.token_bytes(16)).decode()


@pytest.fixture(scope="module")
def client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def registered_user(client):
    """Register a fresh user shared across auth/vault/session tests."""
    email = _rand_email()
    password = "StrongPass!2026"
    salt = _rand_salt()
    r = client.post(f"{API}/auth/register", json={"email": email, "password": password, "kdf_salt": salt})
    assert r.status_code == 201, f"register failed: {r.status_code} {r.text}"
    data = r.json()
    return {"email": email, "password": password, "salt": salt, **data}


# ---- Health ----
class TestHealth:
    def test_root(self, client):
        r = client.get(f"{API}/")
        assert r.status_code == 200
        assert r.json().get("status") == "ok"


# ---- Auth: register / login / refresh ----
class TestAuth:
    def test_register_returns_tokens_and_user(self, registered_user):
        assert "access_token" in registered_user and registered_user["access_token"]
        assert "refresh_token" in registered_user and registered_user["refresh_token"]
        assert registered_user["user"]["email"] == registered_user["email"]
        assert "password_hash" not in registered_user["user"]

    def test_register_duplicate_email_409(self, client, registered_user):
        r = client.post(f"{API}/auth/register", json={
            "email": registered_user["email"],
            "password": "AnotherPass!23",
            "kdf_salt": _rand_salt(),
        })
        assert r.status_code == 409

    def test_register_short_password_422_or_400(self, client):
        r = client.post(f"{API}/auth/register", json={
            "email": _rand_email(), "password": "short", "kdf_salt": _rand_salt(),
        })
        assert r.status_code in (400, 422)

    def test_login_success(self, client, registered_user):
        r = client.post(f"{API}/auth/login", json={
            "email": registered_user["email"], "password": registered_user["password"],
        })
        assert r.status_code == 200
        d = r.json()
        assert d["access_token"] and d["refresh_token"]
        assert d["user"]["email"] == registered_user["email"]

    def test_login_wrong_password_401(self, client, registered_user):
        r = client.post(f"{API}/auth/login", json={
            "email": registered_user["email"], "password": "WrongPass!123",
        })
        assert r.status_code == 401

    def test_login_unknown_email_401(self, client):
        r = client.post(f"{API}/auth/login", json={
            "email": _rand_email(), "password": "Whatever!123",
        })
        assert r.status_code == 401

    def test_refresh_rotates_token(self, client, registered_user):
        old = registered_user["refresh_token"]
        r = client.post(f"{API}/auth/refresh", json={"refresh_token": old})
        assert r.status_code == 200
        d = r.json()
        assert d["refresh_token"] and d["refresh_token"] != old
        assert d["access_token"]
        # update fixture for later tests
        registered_user["refresh_token"] = d["refresh_token"]
        registered_user["access_token"] = d["access_token"]

        # old token must now be invalid (rotated)
        r2 = client.post(f"{API}/auth/refresh", json={"refresh_token": old})
        assert r2.status_code == 401

    def test_refresh_invalid_token_401(self, client):
        r = client.post(f"{API}/auth/refresh", json={"refresh_token": "not-a-real-token"})
        assert r.status_code == 401


# ---- User salt (no enumeration) ----
class TestUserSalt:
    def test_salt_for_known_email(self, client, registered_user):
        r = client.get(f"{API}/user/salt", params={"email": registered_user["email"]})
        assert r.status_code == 200
        assert r.json()["kdf_salt"] == registered_user["salt"]

    def test_salt_for_unknown_email_returns_fake(self, client):
        unknown = _rand_email()
        r = client.get(f"{API}/user/salt", params={"email": unknown})
        assert r.status_code == 200
        assert "kdf_salt" in r.json() and r.json()["kdf_salt"]
        # deterministic per-email: repeat call returns same fake salt
        r2 = client.get(f"{API}/user/salt", params={"email": unknown})
        assert r2.json()["kdf_salt"] == r.json()["kdf_salt"]


# ---- Auth guard on protected endpoints ----
class TestAuthGuard:
    def test_vault_requires_auth(self, client):
        r = client.get(f"{API}/vault")
        assert r.status_code == 401

    def test_vault_invalid_token_401(self, client):
        r = client.get(f"{API}/vault", headers={"Authorization": "Bearer bogus.jwt.token"})
        assert r.status_code == 401

    def test_sessions_requires_auth(self, client):
        r = client.get(f"{API}/sessions")
        assert r.status_code == 401


# ---- Vault CRUD ----
class TestVault:
    def _auth(self, user):
        return {"Authorization": f"Bearer {user['access_token']}"}

    def test_initial_vault_empty(self, client, registered_user):
        r = client.get(f"{API}/vault", headers=self._auth(registered_user))
        assert r.status_code == 200
        d = r.json()
        assert d["version"] == 0
        assert d["blob"] in (None, "")

    def test_put_vault_and_readback(self, client, registered_user):
        blob = base64.b64encode(b"ciphertext-v1").decode()
        r = client.put(f"{API}/vault", headers=self._auth(registered_user),
                       json={"blob": blob, "version": 1})
        assert r.status_code == 200, r.text
        assert r.json()["version"] == 1
        # readback
        r2 = client.get(f"{API}/vault", headers=self._auth(registered_user))
        assert r2.status_code == 200
        assert r2.json()["blob"] == blob
        assert r2.json()["version"] == 1

    def test_put_vault_stale_version_409(self, client, registered_user):
        # after previous test, version=1; reuse version 1 should conflict
        blob = base64.b64encode(b"ciphertext-stale").decode()
        r = client.put(f"{API}/vault", headers=self._auth(registered_user),
                       json={"blob": blob, "version": 1})
        assert r.status_code == 409

    def test_put_vault_newer_version_ok(self, client, registered_user):
        blob = base64.b64encode(b"ciphertext-v2").decode()
        r = client.put(f"{API}/vault", headers=self._auth(registered_user),
                       json={"blob": blob, "version": 2})
        assert r.status_code == 200
        r2 = client.get(f"{API}/vault", headers=self._auth(registered_user))
        assert r2.json()["version"] == 2


# ---- Sessions list & revoke ----
class TestSessions:
    def _auth(self, user):
        return {"Authorization": f"Bearer {user['access_token']}"}

    def test_list_sessions_contains_current(self, client, registered_user):
        r = client.get(f"{API}/sessions", headers=self._auth(registered_user))
        assert r.status_code == 200
        arr = r.json()
        assert isinstance(arr, list) and len(arr) >= 1
        assert all("session_id" in s or "id" in s for s in arr)
        # ensure token_hash NOT leaked
        assert all("token_hash" not in s for s in arr)

    def test_revoke_session(self, client, registered_user):
        # login again -> creates a second session we can safely revoke
        r = client.post(f"{API}/auth/login", json={
            "email": registered_user["email"], "password": registered_user["password"],
        })
        assert r.status_code == 200
        # find newest session
        rl = client.get(f"{API}/sessions", headers=self._auth(registered_user))
        sessions = rl.json()
        # revoke the last one (not necessarily current)
        target = sessions[-1]
        sid = target.get("session_id") or target.get("id")
        rd = client.delete(f"{API}/sessions/{sid}", headers=self._auth(registered_user))
        assert rd.status_code == 200
        # confirm removed from list
        rl2 = client.get(f"{API}/sessions", headers=self._auth(registered_user))
        remaining_ids = [s.get("session_id") or s.get("id") for s in rl2.json()]
        assert sid not in remaining_ids

    def test_revoke_unknown_session_404(self, client, registered_user):
        r = client.delete(f"{API}/sessions/does-not-exist", headers=self._auth(registered_user))
        assert r.status_code == 404


# ---- Google OAuth session exchange (invalid session) ----
class TestGoogleSession:
    def test_invalid_session_id_401(self, client):
        r = client.post(f"{API}/auth/google/session", json={"session_id": "invalid_fake_session_xyz_123"})
        assert r.status_code == 401, f"expected 401 got {r.status_code}: {r.text}"

    def test_missing_session_id_422(self, client):
        r = client.post(f"{API}/auth/google/session", json={})
        assert r.status_code in (400, 422)


# ---- KDF salt setter for Google users ----
class TestKdfSaltPut:
    def _auth(self, user):
        return {"Authorization": f"Bearer {user['access_token']}"}

    def test_put_kdf_salt_conflict_when_already_set(self, client, registered_user):
        # registered_user already has kdf_salt from register → expect 409
        r = client.put(f"{API}/user/kdf-salt",
                       headers=self._auth(registered_user),
                       json={"kdf_salt": _rand_salt()})
        assert r.status_code == 409, r.text

    def test_put_kdf_salt_requires_auth(self, client):
        r = client.put(f"{API}/user/kdf-salt", json={"kdf_salt": _rand_salt()})
        assert r.status_code == 401


# ---- Encrypted files: upload / download / delete ----
class TestFiles:
    def _auth(self, user):
        return {"Authorization": f"Bearer {user['access_token']}"}

    def test_upload_download_delete_flow(self, registered_user):
        import uuid, requests as rq
        auth_headers = self._auth(registered_user)
        file_id = f"TEST_{uuid.uuid4().hex[:12]}"
        blob = secrets.token_bytes(2048)  # pretend-encrypted blob

        # Upload
        files = {"file": (f"{file_id}.bin", blob, "application/octet-stream")}
        data = {"file_id": file_id, "mime": "image/png"}
        r = rq.post(f"{API}/files/upload", headers=auth_headers, files=files, data=data)
        assert r.status_code == 200, f"upload failed: {r.status_code} {r.text}"
        j = r.json()
        assert j["file_id"] == file_id
        assert j["size"] == len(blob)

        # Download
        r2 = rq.get(f"{API}/files/{file_id}", headers=auth_headers)
        assert r2.status_code == 200
        assert r2.content == blob

        # Delete (soft)
        r3 = rq.delete(f"{API}/files/{file_id}", headers=auth_headers)
        assert r3.status_code == 200

        # Delete unknown → 404
        r4 = rq.delete(f"{API}/files/does_not_exist_xxx", headers=auth_headers)
        assert r4.status_code == 404

    def test_files_require_auth(self, client):
        r = client.get(f"{API}/files/anything")
        assert r.status_code == 401


# ---- User ID format regression ----
class TestUserIdFormat:
    def test_user_id_is_u_prefixed(self, registered_user):
        uid = registered_user["user"].get("user_id") or registered_user["user"].get("id")
        assert uid and uid.startswith("u_"), f"user_id format unexpected: {uid}"
