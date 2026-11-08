-- Isolated, non-redeemable practice G for the Ojjuda game stock market.
-- No connection to site coins, paid credits, matgo gold or real-world money.
-- Only authenticated users can trade; all balance changes are server-atomic.

create table if not exists ojjuda_market_internal.stock_wallets (
  user_id uuid primary key references auth.users(id) on delete cascade,
  cash_g bigint not null default 10000 check (cash_g between 0 and 9007199254740991),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists ojjuda_market_internal.stock_holdings (
  user_id uuid not null references auth.users(id) on delete cascade,
  game text not null,
  shares integer not null check (shares > 0),
  cost_basis_g bigint not null check (cost_basis_g >= 0),
  primary key (user_id, game)
);
create table if not exists ojjuda_market_internal.stock_trades (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  request_id uuid not null,
  game text not null,
  side text not null check (side in ('buy', 'sell')),
  quantity integer not null check (quantity between 1 and 100),
  price_g integer not null check (price_g > 0),
  total_g bigint not null check (total_g > 0),
  cash_after_g bigint not null check (cash_after_g >= 0),
  shares_after integer not null check (shares_after >= 0),
  created_at timestamptz not null default now(),
  unique (user_id, request_id)
);
create index if not exists stock_trades_user_created_idx
  on ojjuda_market_internal.stock_trades(user_id, created_at desc);

alter table ojjuda_market_internal.stock_wallets enable row level security;
alter table ojjuda_market_internal.stock_holdings enable row level security;
alter table ojjuda_market_internal.stock_trades enable row level security;
revoke all on ojjuda_market_internal.stock_wallets,
  ojjuda_market_internal.stock_holdings,
  ojjuda_market_internal.stock_trades from public, anon, authenticated;
-- Schema is not in PostgREST's exposed schemas. Grant only function usage.
grant usage on schema ojjuda_market_internal to authenticated;

create or replace function ojjuda_market_internal.stock_account()
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $function$
declare
  actor uuid := (select auth.uid());
  balance bigint;
  owned jsonb;
  recent jsonb;
begin
  if actor is null then raise exception 'login_required'; end if;
  insert into ojjuda_market_internal.stock_wallets(user_id) values (actor)
    on conflict (user_id) do nothing;
  select cash_g into strict balance from ojjuda_market_internal.stock_wallets where user_id = actor;
  select coalesce(jsonb_agg(jsonb_build_object(
    'game', game, 'shares', shares, 'costBasisG', cost_basis_g) order by game), '[]'::jsonb)
  into owned from ojjuda_market_internal.stock_holdings where user_id = actor;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', t.id, 'game', t.game, 'side', t.side, 'quantity', t.quantity,
    'priceG', t.price_g, 'totalG', t.total_g, 'createdAt', t.created_at)
    order by t.created_at desc), '[]'::jsonb)
  into recent from (
    select * from ojjuda_market_internal.stock_trades
    where user_id = actor order by created_at desc limit 12
  ) t;
  return jsonb_build_object('cashG', balance, 'holdings', owned,
    'trades', recent, 'starterG', 10000);
end;
$function$;

create or replace function ojjuda_market_internal.stock_order(
  p_game text, p_side text, p_quantity integer, p_request_id uuid)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $function$
declare
  actor uuid := (select auth.uid());
  prices jsonb;
  price integer;
  listing_status text;
  balance bigint;
  shares_held integer := 0;
  cost_basis bigint := 0;
  sold_basis bigint;
  total bigint;
  previous ojjuda_market_internal.stock_trades%rowtype;
begin
  if actor is null then raise exception 'login_required'; end if;
  if p_request_id is null or p_game is null or p_game !~ '^[a-z0-9_]{2,40}$'
    or p_side not in ('buy','sell') or p_side is null
    or p_quantity is null or p_quantity < 1 or p_quantity > 100
  then raise exception 'invalid_order'; end if;

  -- Hold the snapshot row stable during order execution. Never trust a
  -- client-supplied price or balance.
  select payload into prices from public.arcade_stock_snapshot
    where singleton is true for share;
  select (g->>'priceG')::integer, coalesce(g->>'status','active')
    into price,listing_status
    from jsonb_array_elements(prices->'games') g
    where g->>'id' = p_game limit 1;
  if price is null or price < 1 then raise exception 'stock_unavailable'; end if;

  insert into ojjuda_market_internal.stock_wallets(user_id) values (actor)
    on conflict (user_id) do nothing;
  select cash_g into strict balance from ojjuda_market_internal.stock_wallets
    where user_id = actor for update;

  -- A repeated network request never charges the member twice.
  select * into previous from ojjuda_market_internal.stock_trades
    where user_id = actor and request_id = p_request_id;
  if found then
    if previous.game <> p_game or previous.side <> p_side or previous.quantity <> p_quantity
    then raise exception 'request_conflict'; end if;
    return jsonb_build_object('ok',true,'repeated',true,'priceG',previous.price_g,
      'totalG',previous.total_g,'cashG',previous.cash_after_g,
      'shares',previous.shares_after);
  end if;

  -- Never sell new shares after delisting. Holders can still cash out at
  -- exactly 100G per share without an irreversible forced liquidation.
  if listing_status = 'delisted' or price <= 100 or exists (
    select 1 from ojjuda_market_internal.stock_delistings where game=p_game
  ) then
    if p_side = 'buy' then raise exception 'stock_delisted'; end if;
    price := 100;
  end if;

  select h.shares, h.cost_basis_g into shares_held, cost_basis
    from ojjuda_market_internal.stock_holdings h
    where h.user_id = actor and h.game = p_game for update;
  if not found then shares_held := 0; cost_basis := 0; end if;
  total := price::bigint * p_quantity::bigint;
  if p_side = 'buy' then
    if balance < total then raise exception 'insufficient_funds'; end if;
    if shares_held > 2147483647 - p_quantity then raise exception 'share_limit'; end if;
    balance := balance - total;
    shares_held := shares_held + p_quantity;
    insert into ojjuda_market_internal.stock_holdings(user_id,game,shares,cost_basis_g)
      values (actor,p_game,p_quantity,total)
      on conflict (user_id,game) do update
      set shares = ojjuda_market_internal.stock_holdings.shares + excluded.shares,
        cost_basis_g = ojjuda_market_internal.stock_holdings.cost_basis_g + excluded.cost_basis_g;
  else
    if shares_held < p_quantity then raise exception 'insufficient_shares'; end if;
    if balance > 9007199254740991 - total then raise exception 'balance_limit'; end if;
    sold_basis := case when shares_held = p_quantity then cost_basis
      else round(cost_basis::numeric * p_quantity / shares_held)::bigint end;
    balance := balance + total;
    shares_held := shares_held - p_quantity;
    if shares_held = 0 then
      delete from ojjuda_market_internal.stock_holdings
        where user_id = actor and game = p_game;
    else
      update ojjuda_market_internal.stock_holdings
        set shares = shares_held, cost_basis_g = cost_basis - sold_basis
        where user_id = actor and game = p_game;
    end if;
  end if;
  update ojjuda_market_internal.stock_wallets set cash_g = balance, updated_at = now()
    where user_id = actor;
  insert into ojjuda_market_internal.stock_trades
    (user_id,request_id,game,side,quantity,price_g,total_g,cash_after_g,shares_after)
    values (actor,p_request_id,p_game,p_side,p_quantity,price,total,balance,shares_held);
  return jsonb_build_object('ok',true,'repeated',false,'priceG',price,
    'totalG',total,'cashG',balance,'shares',shares_held);
end;
$function$;

revoke all on function ojjuda_market_internal.stock_account(),
  ojjuda_market_internal.stock_order(text,text,integer,uuid)
  from public, anon, authenticated;
grant execute on function ojjuda_market_internal.stock_account(),
  ojjuda_market_internal.stock_order(text,text,integer,uuid) to authenticated;

-- Public RPCs are SECURITY INVOKER; privileged mutations live only in the
-- unexposed internal schema and independently check auth.uid().
create or replace function public.community_game_stock_account()
returns jsonb language sql volatile security invoker set search_path = ''
as $function$ select ojjuda_market_internal.stock_account(); $function$;
create or replace function public.community_game_stock_order(
  p_game text, p_side text, p_quantity integer, p_request_id uuid)
returns jsonb language sql volatile security invoker set search_path = ''
as $function$
  select ojjuda_market_internal.stock_order(p_game,p_side,p_quantity,p_request_id);
$function$;
revoke all on function public.community_game_stock_account(),
  public.community_game_stock_order(text,text,integer,uuid)
  from public, anon;
grant execute on function public.community_game_stock_account(),
  public.community_game_stock_order(text,text,integer,uuid) to authenticated;
