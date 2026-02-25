from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError

from q2h.auth.service import AuthService

security = HTTPBearer()
auth_service = AuthService()


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> dict:
    try:
        payload = auth_service.decode_token(credentials.credentials)
        return payload
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token"
        )


async def require_admin(user: dict = Depends(get_current_user)) -> dict:
    if user.get("profile") != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Admin required"
        )
    return user


async def require_data_access(user: dict = Depends(get_current_user)) -> dict:
    """Block monitoring-only profiles from accessing vulnerability data."""
    if user.get("profile") == "monitoring":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Monitoring profile cannot access vulnerability data",
        )
    return user
