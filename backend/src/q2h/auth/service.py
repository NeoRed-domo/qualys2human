from datetime import datetime, timedelta, timezone

import bcrypt
from jose import jwt

SECRET_KEY = "dev-secret-change-in-prod"  # Loaded from config in production
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 15
REFRESH_TOKEN_EXPIRE_HOURS = 8


class AuthService:
    def hash_password(self, password: str) -> str:
        return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")

    def verify_password(self, plain: str, hashed: str) -> bool:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))

    def create_access_token(self, user_id: int, username: str, profile: str) -> str:
        expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
        return jwt.encode(
            {"sub": str(user_id), "username": username, "profile": profile, "exp": expire},
            SECRET_KEY, algorithm=ALGORITHM,
        )

    def create_refresh_token(self, user_id: int) -> str:
        expire = datetime.now(timezone.utc) + timedelta(hours=REFRESH_TOKEN_EXPIRE_HOURS)
        return jwt.encode(
            {"sub": str(user_id), "type": "refresh", "exp": expire},
            SECRET_KEY, algorithm=ALGORITHM,
        )

    def decode_token(self, token: str) -> dict:
        return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
