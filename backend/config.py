import os

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "sqlite+aiosqlite:////Users/mac/Public/Hermes工作区/周计划管理平台/backend/wwp.db"
)

JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY", "wwp-secret-key-change-in-production")
JWT_ALGORITHM = "HS256"
JWT_EXPIRATION_HOURS = 24 * 7  # 7 days
