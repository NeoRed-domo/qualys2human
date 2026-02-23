from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from q2h.auth.service import AuthService
from q2h.db.models import Profile, User

BUILTIN_PROFILES = [
    {
        "name": "admin",
        "type": "builtin",
        "permissions": {"all": True},
        "is_default": False,
    },
    {
        "name": "user",
        "type": "builtin",
        "permissions": {"dashboard": True, "export": True},
        "is_default": True,
    },
    {
        "name": "monitoring",
        "type": "builtin",
        "permissions": {"monitoring": True, "dashboard": True},
        "is_default": False,
    },
]


async def seed_defaults(session: AsyncSession):
    auth = AuthService()

    # Create profiles if not exist
    for p in BUILTIN_PROFILES:
        result = await session.execute(select(Profile).where(Profile.name == p["name"]))
        if result.scalar_one_or_none() is None:
            session.add(Profile(**p))
    await session.flush()

    # Create default admin if no admin exists
    result = await session.execute(
        select(User).join(Profile).where(Profile.name == "admin")
    )
    if result.scalars().first() is None:
        admin_profile = await session.execute(select(Profile).where(Profile.name == "admin"))
        profile = admin_profile.scalar_one()
        session.add(User(
            username="admin",
            password_hash=auth.hash_password("Qualys2Human!"),
            auth_type="local",
            profile_id=profile.id,
            must_change_password=True,
        ))
    await session.commit()
