"""add performance indexes for owner lookups

Revision ID: d7e8f9a0b1c2
Revises: c1a2b3d4e5f6
Create Date: 2026-04-13

Adds indexes on:
  - chat_conversations.owner_user_id
  - chat_conversations.owner_anon_id
  - chat_session_sources.owner_user_id
  - chat_session_sources.owner_anon_id
  - chat_messages.conversation_id (chronological ordering)

These are required for the /chat/threads and session lookup queries to
avoid full-table scans as the dataset grows.
"""
from typing import Sequence, Union
from alembic import op


revision: str = "d7e8f9a0b1c2"
down_revision: Union[str, None] = "c1a2b3d4e5f6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # --- chat_conversations ---
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_chat_conversations_owner_user "
        "ON chat_conversations (owner_user_id) WHERE owner_user_id IS NOT NULL"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_chat_conversations_owner_anon "
        "ON chat_conversations (owner_anon_id) WHERE owner_anon_id IS NOT NULL"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_chat_conversations_updated_at "
        "ON chat_conversations (updated_at DESC)"
    )

    # --- chat_session_sources ---
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_chat_session_sources_owner_user "
        "ON chat_session_sources (owner_user_id) WHERE owner_user_id IS NOT NULL"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_chat_session_sources_owner_anon "
        "ON chat_session_sources (owner_anon_id) WHERE owner_anon_id IS NOT NULL"
    )

    # --- chat_messages ---
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_chat_messages_conversation_created "
        "ON chat_messages (conversation_id, created_at ASC)"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_chat_conversations_owner_user")
    op.execute("DROP INDEX IF EXISTS ix_chat_conversations_owner_anon")
    op.execute("DROP INDEX IF EXISTS ix_chat_conversations_updated_at")
    op.execute("DROP INDEX IF EXISTS ix_chat_session_sources_owner_user")
    op.execute("DROP INDEX IF EXISTS ix_chat_session_sources_owner_anon")
    op.execute("DROP INDEX IF EXISTS ix_chat_messages_conversation_created")
