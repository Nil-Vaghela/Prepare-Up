"""add missing columns and chat tables

Revision ID: c1a2b3d4e5f6
Revises: ba95db48931a
Create Date: 2026-04-12

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = 'c1a2b3d4e5f6'
down_revision: Union[str, None] = 'ba95db48931a'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Add provider_user_id to oauth_accounts (nullable, backfill not needed)
    op.add_column(
        'oauth_accounts',
        sa.Column('provider_user_id', sa.String(255), nullable=True)
    )

    # 2. chat_conversations table (used by chat.py inline table definition)
    op.create_table(
        'chat_conversations',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('title', sa.String(255), nullable=True),
        sa.Column('owner_user_id', sa.String(128), nullable=True),
        sa.Column('owner_anon_id', sa.String(128), nullable=True),
        sa.Column('source_session_id', sa.String(128), nullable=True),
        sa.Column('source_files', sa.JSON, nullable=True),
        sa.Column('combined_text_len', sa.String(32), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index('ix_chat_conversations_owner_user', 'chat_conversations', ['owner_user_id'])
    op.create_index('ix_chat_conversations_owner_anon', 'chat_conversations', ['owner_anon_id'])

    # 3. chat_messages table
    op.create_table(
        'chat_messages',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('conversation_id', sa.String(36),
                  sa.ForeignKey('chat_conversations.id', ondelete='CASCADE'), nullable=False),
        sa.Column('role', sa.String(16), nullable=False),
        sa.Column('content', sa.Text, nullable=False),
        sa.Column('meta', sa.JSON, nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index('ix_chat_messages_conversation', 'chat_messages', ['conversation_id'])

    # 4. chat_session_sources table (upload.py stores extracted text here)
    op.create_table(
        'chat_session_sources',
        sa.Column('session_id', sa.String(128), primary_key=True),
        sa.Column('owner_user_id', sa.String(128), nullable=True),
        sa.Column('owner_anon_id', sa.String(128), nullable=True),
        sa.Column('content', sa.Text, nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    )


def downgrade() -> None:
    op.drop_table('chat_session_sources')
    op.drop_index('ix_chat_messages_conversation', table_name='chat_messages')
    op.drop_table('chat_messages')
    op.drop_index('ix_chat_conversations_owner_anon', table_name='chat_conversations')
    op.drop_index('ix_chat_conversations_owner_user', table_name='chat_conversations')
    op.drop_table('chat_conversations')
    op.drop_column('oauth_accounts', 'provider_user_id')
