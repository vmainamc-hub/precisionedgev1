
CREATE TABLE IF NOT EXISTS public.auto_trade_settings (
  user_id UUID NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT false,
  sources JSONB NOT NULL DEFAULT '{"under7":true,"over2":true,"advUnder7":true,"advOver2":true,"riseFall":false}'::jsonb,
  stake NUMERIC NOT NULL DEFAULT 1,
  duration_ticks INT NOT NULL DEFAULT 5,
  min_confidence INT NOT NULL DEFAULT 75,
  max_daily_loss NUMERIC,
  max_consecutive_losses INT NOT NULL DEFAULT 5,
  take_profit NUMERIC,
  stop_loss NUMERIC,
  demo_only BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.auto_trade_settings TO authenticated;
GRANT ALL ON public.auto_trade_settings TO service_role;
ALTER TABLE public.auto_trade_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own auto trade settings" ON public.auto_trade_settings;
CREATE POLICY "own auto trade settings" ON public.auto_trade_settings FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP TRIGGER IF EXISTS ats_updated_at ON public.auto_trade_settings;
CREATE TRIGGER ats_updated_at BEFORE UPDATE ON public.auto_trade_settings FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.trades ADD COLUMN IF NOT EXISTS auto_trade BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.trades ADD COLUMN IF NOT EXISTS signal_source TEXT;
