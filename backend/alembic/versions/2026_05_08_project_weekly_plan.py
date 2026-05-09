"""Add project_weekly_status and project_weekly_member_allocation tables

Revision ID: 2026_05_08_pwp
"""
from alembic import op

revision = "2026_05_08_pwp"
down_revision = "2026_05_07_cascade"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("PRAGMA foreign_keys=OFF")

    op.execute("""
        CREATE TABLE project_weekly_status (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            project_id INTEGER NOT NULL,
            week_start_date DATE NOT NULL,
            status VARCHAR(20) DEFAULT 'normal',
            risk_desc VARCHAR(500),
            weekly_progress VARCHAR(500),
            next_week_plan VARCHAR(500),
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
            UNIQUE (project_id, week_start_date)
        )
    """)

    op.execute("""
        CREATE TABLE project_weekly_member_allocation (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            project_weekly_status_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            weekday INTEGER NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (project_weekly_status_id) REFERENCES project_weekly_status(id) ON DELETE CASCADE,
            FOREIGN KEY (user_id) REFERENCES users(id),
            UNIQUE (project_weekly_status_id, user_id, weekday)
        )
    """)

    op.execute("CREATE INDEX idx_pws_week ON project_weekly_status(week_start_date)")
    op.execute("CREATE INDEX idx_pwma_status ON project_weekly_member_allocation(project_weekly_status_id)")

    op.execute("PRAGMA foreign_keys=ON")


def downgrade() -> None:
    op.execute("PRAGMA foreign_keys=OFF")
    op.execute("DROP TABLE IF EXISTS project_weekly_member_allocation")
    op.execute("DROP TABLE IF EXISTS project_weekly_status")
    op.execute("PRAGMA foreign_keys=ON")
