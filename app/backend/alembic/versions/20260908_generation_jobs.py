"""Add durable generation leases and enforce unique project versions."""
from alembic import op
import sqlalchemy as sa

revision = '20260908_generation_jobs'
down_revision = '545fc42d129e'
branch_labels = None
depends_on = None


def upgrade():
    from models.generation_jobs import GenerationJob
    GenerationJob.__table__.create(op.get_bind(), checkfirst=True)
    # Fails visibly if legacy duplicates exist; never discard user versions.
    op.execute(sa.text('CREATE UNIQUE INDEX IF NOT EXISTS uq_versions_project_number ON versions (project_id, version_number)'))


def downgrade():
    op.drop_index('uq_versions_project_number', table_name='versions')
    op.drop_table('generation_jobs')
