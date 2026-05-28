-- AI Insights table for caching Gemini-generated personalized insights
CREATE TABLE IF NOT EXISTS ai_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL DEFAULT 'behavior' CHECK (type IN ('nutrition', 'workout', 'body', 'behavior')),
  priority TEXT NOT NULL DEFAULT 'informativo' CHECK (priority IN ('informativo', 'atencao', 'positivo', 'recomendacao')),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  cta TEXT,
  metadata JSONB,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  read_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_ai_insights_user_generated
  ON ai_insights(user_id, generated_at DESC);
