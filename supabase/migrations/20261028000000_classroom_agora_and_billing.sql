CREATE TABLE public.subscriptions (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'manual',
  provider_subscription_id text,
  plan_id text,
  status text NOT NULL DEFAULT 'active',
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id)
);
CREATE INDEX subscriptions_status_idx ON public.subscriptions (status, current_period_end);
CREATE TABLE public.subscription_cancellation_audits (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  subscription_id uuid NOT NULL REFERENCES public.subscriptions (id) ON DELETE CASCADE,
  actor_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE RESTRICT,
  target_user_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  provider text NOT NULL,
  provider_subscription_id text,
  result_status text NOT NULL,
  provider_response jsonb NOT NULL DEFAULT '{}'::jsonb,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX subscription_cancellation_audits_target_idx ON public.subscription_cancellation_audits (target_user_id, created_at desc);
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_cancellation_audits ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.subscriptions TO authenticated;
GRANT SELECT ON public.subscription_cancellation_audits TO authenticated;
CREATE POLICY "Users see own subscription" ON public.subscriptions FOR SELECT TO authenticated USING (user_id = (select auth.uid()) OR public.has_platform_role(array['admin']));
CREATE POLICY "Admins see cancellation audits" ON public.subscription_cancellation_audits FOR SELECT TO authenticated USING (public.has_platform_role(array['admin']));
CREATE OR REPLACE FUNCTION public.cancel_user_subscription(target_user_id uuid, cancel_reason text DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS '
DECLARE
  current_user_id uuid := (select auth.uid());
  sub public.subscriptions%rowtype;
BEGIN
  IF current_user_id IS NULL OR NOT public.has_platform_role(array[''admin'']) THEN
    RAISE EXCEPTION ''Only administrators can cancel subscriptions.'' USING errcode = ''42501'';
  END IF;
  IF target_user_id = current_user_id THEN
    RAISE EXCEPTION ''Cannot cancel your own subscription.'' USING errcode = ''22023'';
  END IF;
  SELECT * INTO sub FROM public.subscriptions WHERE user_id = target_user_id FOR UPDATE;
  IF sub.id IS NULL THEN
    RAISE EXCEPTION ''No subscription found for this user.'' USING errcode = ''22023'';
  END IF;
  IF sub.status = ''cancelled'' THEN
    RETURN jsonb_build_object(''status'',''already_cancelled'',''subscription_id'',sub.id);
  END IF;
  UPDATE public.subscriptions SET status=''cancelled'', cancel_at_period_end=false, cancelled_at=now(), updated_at=now() WHERE id=sub.id;
  INSERT INTO public.subscription_cancellation_audits (subscription_id, actor_id, target_user_id, provider, provider_subscription_id, result_status, provider_response, reason)
  VALUES (sub.id, current_user_id, target_user_id, sub.provider, sub.provider_subscription_id, ''cancelled'', jsonb_build_object(''method'',''admin_rpc'',''immediate'',true), nullif(btrim(cancel_reason),''''));
  RETURN jsonb_build_object(''status'',''cancelled'',''subscription_id'',sub.id,''user_id'',target_user_id,''cancelled_at'',now());
END;
';
REVOKE ALL ON FUNCTION public.cancel_user_subscription(uuid,text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.cancel_user_subscription(uuid,text) TO authenticated;
CREATE TRIGGER subscriptions_set_updated_at BEFORE UPDATE ON public.subscriptions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
