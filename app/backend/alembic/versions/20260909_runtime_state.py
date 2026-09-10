"""Add isolated application state storage."""
from alembic import op
import sqlalchemy as sa

revision = '20260909_runtime_state'
down_revision = '20260908_generation_jobs'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table('runtime_states', sa.Column('version_id', sa.Integer, primary_key=True),
                    sa.Column('user_id', sa.String, nullable=False),
                    sa.Column('revision', sa.Integer, nullable=False),
                    sa.Column('state', sa.JSON, nullable=True))
    op.create_table('version_verifications', sa.Column('version_id', sa.Integer, primary_key=True), sa.Column('user_id', sa.String, nullable=False), sa.Column('verified_at', sa.DateTime(timezone=True), nullable=False))
    op.create_index('ix_runtime_states_user_id', 'runtime_states', ['user_id'])


def downgrade():
    op.drop_table('version_verifications')
    op.drop_table('runtime_states')
