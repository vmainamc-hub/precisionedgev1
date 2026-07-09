
-- Deriv connected accounts (per user, multiple accounts allowed)
CREATE TABLE public.deriv_accounts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  loginid TEXT NOT NULL,
  token TEXT NOT NULL,
  currency TEXT,
  is_virtual BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT false,
  balance NUMERIC,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (user_id, loginid)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.deriv_accounts TO authenticated;
GRANT ALL ON public.deriv_accounts TO service_role;

ALTER TABLE public.deriv_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own deriv accounts"
  ON public.deriv_accounts FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER trg_deriv_accounts_updated
  BEFORE UPDATE ON public.deriv_accounts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Trades log
CREATE TABLE public.trades (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  deriv_account_id UUID REFERENCES public.deriv_accounts(id) ON DELETE SET NULL,
  loginid TEXT,
  contract_id TEXT,
  symbol TEXT NOT NULL,
  contract_type TEXT NOT NULL,
  stake NUMERIC NOT NULL,
  duration INTEGER,
  duration_unit TEXT,
  barrier TEXT,
  entry_price NUMERIC,
  exit_price NUMERIC,
  payout NUMERIC,
  profit NUMERIC,
  status TEXT NOT NULL DEFAULT 'open',
  is_virtual BOOLEAN NOT NULL DEFAULT false,
  meta JSONB,
  purchased_at TIMESTAMP WITH TIME ZONE,
  closed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.trades TO authenticated;
GRANT ALL ON public.trades TO service_role;

ALTER TABLE public.trades ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own trades"
  ON public.trades FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER trg_trades_updated
  BEFORE UPDATE ON public.trades
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_trades_user_created ON public.trades (user_id, created_at DESC);
CREATE INDEX idx_deriv_accounts_user_active ON public.deriv_accounts (user_id, is_active);
