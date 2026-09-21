CREATE TABLE IF NOT EXISTS plugin_vk_community_tools_8aceb5378d.vk_event_journal (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  group_id bigint NOT NULL,
  event_id varchar(128) NOT NULL,
  event_type varchar(64) NOT NULL,
  category varchar(32) NOT NULL,
  peer_id bigint,
  actor_user_id bigint,
  payload jsonb NOT NULL,
  status varchar(32) NOT NULL DEFAULT 'received',
  agent_id uuid,
  agent_run_id varchar(64),
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  CONSTRAINT uq_vk_event UNIQUE (company_id, group_id, event_id)
);

CREATE INDEX IF NOT EXISTS idx_vk_journal_company_time 
  ON plugin_vk_community_tools_8aceb5378d.vk_event_journal (company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_vk_journal_peer
  ON plugin_vk_community_tools_8aceb5378d.vk_event_journal (company_id, peer_id, created_at DESC);
