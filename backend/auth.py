"""
GitMind Auth Module — JWT + GitHub OAuth 2.0
Phase A.1: Stateless JWT authentication with GitHub as identity provider.

Flow:
  1. Frontend redirects to GET /auth/github
  2. GitHub redirects back to GET /auth/github/callback?code=...
  3. We exchange code for access token, fetch user profile, issue our own JWT
  4. All protected endpoints use get_current_user() dependency
"""

import os
import secrets
import hashlib
import time
from datetime import datetime, timezone, timedelta
from typing import Optional, Dict, Any

import httpx
from fastapi import APIRouter, HTTPException, Depends, Request, Response
from fastapi.responses import RedirectResponse, JSONResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy import select
from database import User, AsyncSessionLocal

try:
    import jwt as pyjwt
    _HAS_JWT = True
except ImportError:
    _HAS_JWT = False

# ── Config ─────────────────────────────────────────────────────────────────────
SECRET_KEY = os.getenv("JWT_SECRET_KEY", secrets.token_hex(32))
JWT_ALGORITHM = "HS256"
JWT_EXPIRE_HOURS = 24

GITHUB_CLIENT_ID = os.getenv("GITHUB_CLIENT_ID", "")
GITHUB_CLIENT_SECRET = os.getenv("GITHUB_CLIENT_SECRET", "")
GITHUB_REDIRECT_URI = os.getenv("GITHUB_REDIRECT_URI", "http://localhost:8000/auth/github/callback")
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:4200")

# OAuth state nonces (CSRF protection)
_oauth_states: Dict[str, float] = {}  # { state: created_at_timestamp }

router = APIRouter(prefix="/auth", tags=["Authentication"])
security = HTTPBearer(auto_error=False)


# ── JWT Utilities ──────────────────────────────────────────────────────────────

def create_access_token(user_id: int, login: str, avatar_url: str) -> str:
    """Issue a signed JWT access token."""
    if not _HAS_JWT:
        raise RuntimeError("PyJWT not installed. Run: pip install PyJWT")
    payload = {
        "sub": str(user_id),
        "login": login,
        "avatar": avatar_url,
        "iat": datetime.now(timezone.utc),
        "exp": datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRE_HOURS),
    }
    return pyjwt.encode(payload, SECRET_KEY, algorithm=JWT_ALGORITHM)


def decode_access_token(token: str) -> Optional[Dict[str, Any]]:
    """Decode and verify a JWT. Returns payload or None."""
    if not _HAS_JWT:
        return None
    try:
        return pyjwt.decode(token, SECRET_KEY, algorithms=[JWT_ALGORITHM])
    except Exception:
        return None


# ── Dependency: Current User ───────────────────────────────────────────────────

async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security)
) -> Optional[Dict[str, Any]]:
    """
    FastAPI dependency. Returns current user dict or None if not authenticated.
    """
    if not credentials:
        return None
    payload = decode_access_token(credentials.credentials)
    if not payload:
        return None
    
    user_id = int(payload.get("sub", 0))
    async with AsyncSessionLocal() as session:
        result = await session.execute(select(User).where(User.github_id == user_id))
        db_user = result.scalar_one_or_none()
        if db_user:
            return {
                "id": db_user.id,
                "github_id": db_user.github_id,
                "login": db_user.login,
                "name": db_user.name,
                "avatar_url": db_user.avatar_url,
                "email": db_user.email,
            }
            
    # Fallback to payload for stateless access if not in DB yet
    return {
        "id": user_id,
        "github_id": user_id,
        "login": payload.get("login", "unknown"),
        "avatar_url": payload.get("avatar", ""),
        "email": None,
    }


async def require_auth(
    current_user: Optional[Dict] = Depends(get_current_user)
) -> Dict[str, Any]:
    """Dependency that enforces authentication. Raises 401 if not logged in."""
    if not current_user:
        raise HTTPException(
            status_code=401,
            detail="Authentication required. Please log in via GitHub.",
            headers={"WWW-Authenticate": "Bearer"}
        )
    return current_user


# ── OAuth Endpoints ────────────────────────────────────────────────────────────

from fastapi import Form
from fastapi.responses import RedirectResponse, JSONResponse, HTMLResponse

@router.get("/github", summary="Initiate GitHub OAuth login")
async def github_login():
    """
    Redirects the user to GitHub's authorization page.
    Generates a secure state nonce for CSRF protection.
    """
    if not GITHUB_CLIENT_ID:
        raise HTTPException(
            status_code=503,
            detail="GitHub OAuth not configured. Set GITHUB_CLIENT_ID in environment."
        )
    state = secrets.token_urlsafe(32)
    _oauth_states[state] = time.time()
    # Clean up stale states (older than 10 minutes)
    stale = [s for s, t in _oauth_states.items() if time.time() - t > 600]
    for s in stale:
        del _oauth_states[s]

    github_auth_url = (
        f"https://github.com/login/oauth/authorize"
        f"?client_id={GITHUB_CLIENT_ID}"
        f"&redirect_uri={GITHUB_REDIRECT_URI}"
        f"&scope=read:user,user:email"
        f"&state={state}"
    )
    return RedirectResponse(url=github_auth_url)


@router.get("/github/callback", summary="GitHub OAuth callback")
async def github_callback(code: str, state: str):
    """
    Handles the GitHub OAuth callback.
    Exchanges the authorization code for an access token,
    fetches user info, issues our JWT, and redirects to frontend.
    """
    # CSRF state validation
    if state not in _oauth_states:
        raise HTTPException(status_code=400, detail="Invalid OAuth state. Possible CSRF attack.")
    del _oauth_states[state]

    # Exchange code for GitHub access token
    async with httpx.AsyncClient(timeout=15.0) as client:
        token_res = await client.post(
            "https://github.com/login/oauth/access_token",
            json={
                "client_id": GITHUB_CLIENT_ID,
                "client_secret": GITHUB_CLIENT_SECRET,
                "code": code,
                "redirect_uri": GITHUB_REDIRECT_URI,
            },
            headers={"Accept": "application/json"},
        )
        if token_res.status_code != 200:
            raise HTTPException(status_code=502, detail="Failed to exchange OAuth code with GitHub.")

        token_data = token_res.json()
        github_access_token = token_data.get("access_token")
        if not github_access_token:
            raise HTTPException(status_code=502, detail=f"GitHub OAuth error: {token_data.get('error_description', 'Unknown error')}")

        # Fetch user profile
        user_res = await client.get(
            "https://api.github.com/user",
            headers={
                "Authorization": f"Bearer {github_access_token}",
                "Accept": "application/vnd.github.v3+json",
            },
        )
        if user_res.status_code != 200:
            raise HTTPException(status_code=502, detail="Failed to fetch GitHub user profile.")

        github_user = user_res.json()

        # Fetch primary email if not public
        email = github_user.get("email")
        if not email:
            email_res = await client.get(
                "https://api.github.com/user/emails",
                headers={"Authorization": f"Bearer {github_access_token}", "Accept": "application/vnd.github.v3+json"},
            )
            if email_res.status_code == 200:
                emails = email_res.json()
                primary = next((e["email"] for e in emails if e.get("primary") and e.get("verified")), None)
                email = primary

    # Upsert user in Postgres DB
    user_id = github_user["id"]
    async with AsyncSessionLocal() as session:
        # Check if user exists
        result = await session.execute(select(User).where(User.github_id == user_id))
        db_user = result.scalar_one_or_none()
        
        if db_user:
            # Update existing
            db_user.login = github_user["login"]
            db_user.name = github_user.get("name") or github_user["login"]
            db_user.avatar_url = github_user.get("avatar_url", "")
            db_user.email = email
        else:
            # Create new
            db_user = User(
                github_id=user_id,
                login=github_user["login"],
                name=github_user.get("name") or github_user["login"],
                avatar_url=github_user.get("avatar_url", ""),
                email=email
            )
            session.add(db_user)
        
        await session.commit()

    # Issue our JWT
    jwt_token = create_access_token(user_id, github_user["login"], github_user.get("avatar_url", ""))

    # Redirect to frontend with token as query param
    # (Frontend stores in memory or httpOnly cookie via a token exchange)
    return RedirectResponse(url=f"{FRONTEND_URL}/auth/callback?token={jwt_token}")


@router.get("/me", summary="Get current user profile")
async def get_me(current_user: Dict = Depends(require_auth)):
    """Returns the authenticated user's profile."""
    return {
        "id": current_user.get("id"),
        "login": current_user.get("login"),
        "name": current_user.get("name"),
        "avatar_url": current_user.get("avatar_url"),
        "email": current_user.get("email"),
    }


@router.post("/logout", summary="Invalidate current session")
async def logout(current_user: Dict = Depends(require_auth)):
    """
    Stateless JWT logout — client should discard the token.
    With refresh tokens (Phase B), this will also invalidate the refresh token in Redis.
    """
    return {"message": f"Goodbye, {current_user.get('login')}. Token discarded on client side."}


@router.get("/status", summary="Auth system status")
async def auth_status():
    """Returns whether GitHub OAuth is configured."""
    return {
        "github_oauth_configured": bool(GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET),
        "jwt_enabled": _HAS_JWT,
    }
