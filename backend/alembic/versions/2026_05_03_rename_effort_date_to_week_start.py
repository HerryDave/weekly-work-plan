"""rename effort_date -> week_start_date in actual_efforts

Revision ID: 2026_05_03_rename
Revises: 9e6028f80b5f
Create Date: 2026-05-03 17:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = '2026_05_03_rename'
down_revision: Union[str, None] = '9e6028f80b5f'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # SQLite 重构表策略：创建新表 → 迁移数据 → 删除旧表 → 重命名新表
    op.execute("""
        CREATE TABLE actual_efforts_new (
            id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            project_id INTEGER NOT NULL,
            week_start_date DATE NOT NULL,
            actual_man_days FLOAT NOT NULL DEFAULT 0.0,
            team_id INTEGER,
            created_by INTEGER NOT NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id),
            FOREIGN KEY (project_id) REFERENCES projects(id),
            FOREIGN KEY (team_id) REFERENCES groups(id),
            FOREIGN KEY (created_by) REFERENCES users(id),
            CONSTRAINT uq_user_project_week UNIQUE (user_id, project_id, week_start_date)
        )
    """)

    # 迁移数据：历史数据的 effort_date 直接作为 week_start_date（已经是周期粒度）
    op.execute("""
        INSERT INTO actual_efforts_new (id, user_id, project_id, week_start_date, actual_man_days, team_id, created_by, created_at, updated_at)
        SELECT id, user_id, project_id, effort_date, actual_man_days, team_id, created_by, created_at, updated_at
        FROM actual_efforts
    """)

    op.execute("DROP TABLE actual_efforts")
    op.execute("ALTER TABLE actual_efforts_new RENAME TO actual_efforts")


def downgrade() -> None:
    op.execute("""
        CREATE TABLE actual_efforts_old (
            id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            project_id INTEGER NOT NULL,
            effort_date DATE NOT NULL,
            actual_man_days FLOAT NOT NULL DEFAULT 0.0,
            team_id INTEGER,
            created_by INTEGER NOT NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id),
            FOREIGN KEY (project_id) REFERENCES projects(id),
            FOREIGN KEY (team_id) REFERENCES groups(id),
            FOREIGN KEY (created_by) REFERENCES users(id),
            CONSTRAINT uq_user_project_effort_date UNIQUE (user_id, project_id, effort_date)
        )
    """)

    op.execute("""
        INSERT INTO actual_efforts_old (id, user_id, project_id, effort_date, actual_man_days, team_id, created_by, created_at, updated_at)
        SELECT id, user_id, project_id, week_start_date, actual_man_days, team_id, created_by, created_at, updated_at
        FROM actual_efforts
    """)

    op.execute("DROP TABLE actual_efforts")
    op.execute("ALTER TABLE actual_efforts_old RENAME TO actual_efforts")
