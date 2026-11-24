-- Pilotage Bouchons · base Supabase
-- À coller dans Supabase → SQL Editor → New query → Run (une seule fois).
--
-- Sécurité : les tables ne sont PAS accessibles directement avec la clé publique.
-- On passe uniquement par les fonctions ci-dessous, qui exigent le « code d'équipe » :
-- sans le code, impossible de lire ou modifier les données d'une équipe.

create table if not exists public.equipes (
  code        text primary key,
  data        jsonb not null,
  version     bigint not null default 1,
  updated_at  timestamptz not null default now(),
  updated_by  text
);

create table if not exists public.equipes_historique (
  id        bigserial primary key,
  code      text not null references public.equipes(code) on delete cascade,
  data      jsonb not null,
  version   bigint not null,
  saved_at  timestamptz not null default now(),
  saved_by  text
);
create index if not exists equipes_historique_code_idx on public.equipes_historique (code, id desc);

alter table public.equipes enable row level security;
alter table public.equipes_historique enable row level security;
revoke all on table public.equipes, public.equipes_historique from anon, authenticated;

-- Lire les données de l'équipe
create or replace function public.get_state(p_code text)
returns json language sql security definer set search_path = public as $$
  select json_build_object('data', data, 'version', version, 'updated_at', updated_at, 'updated_by', updated_by)
  from equipes where code = p_code;
$$;

-- Numéro de version seulement (vérification rapide toutes les 10 s)
create or replace function public.get_version(p_code text)
returns json language sql security definer set search_path = public as $$
  select json_build_object('version', version, 'updated_at', updated_at, 'updated_by', updated_by)
  from equipes where code = p_code;
$$;

-- Enregistrer. p_version = version sur laquelle on a travaillé :
-- si quelqu'un a enregistré entre-temps, rien n'est écrasé et on renvoie la version du groupe.
create or replace function public.put_state(p_code text, p_data jsonb, p_version bigint, p_by text)
returns json language plpgsql security definer set search_path = public as $$
declare
  cur equipes%rowtype;
  last_hist timestamptz;
begin
  if p_code is null or length(p_code) < 8 then
    raise exception 'Code d''équipe trop court (8 caractères minimum)';
  end if;
  if octet_length(p_data::text) > 2000000 then
    raise exception 'Données trop volumineuses';
  end if;

  select * into cur from equipes where code = p_code for update;
  if not found then
    insert into equipes (code, data, version, updated_by) values (p_code, p_data, 1, p_by);
    insert into equipes_historique (code, data, version, saved_by) values (p_code, p_data, 1, p_by);
    return json_build_object('ok', true, 'version', 1);
  end if;

  if p_version is distinct from cur.version then
    return json_build_object('ok', false, 'version', cur.version, 'data', cur.data,
                             'updated_by', cur.updated_by, 'updated_at', cur.updated_at);
  end if;

  -- Historique : une copie de l'état précédent au plus toutes les 10 minutes, 300 copies max
  select max(saved_at) into last_hist from equipes_historique where code = p_code;
  if last_hist is null or last_hist < now() - interval '10 minutes' then
    insert into equipes_historique (code, data, version, saved_by)
    values (p_code, cur.data, cur.version, cur.updated_by);
    delete from equipes_historique
    where code = p_code
      and id not in (select id from equipes_historique where code = p_code order by id desc limit 300);
  end if;

  update equipes set data = p_data, version = cur.version + 1, updated_at = now(), updated_by = p_by
  where code = p_code;
  return json_build_object('ok', true, 'version', cur.version + 1);
end $$;

-- Liste de l'historique (sans les données)
create or replace function public.get_history(p_code text)
returns json language sql security definer set search_path = public as $$
  select coalesce(json_agg(h order by h.id desc), '[]'::json) from (
    select id, version, saved_at, saved_by from equipes_historique
    where code = p_code order by id desc limit 100
  ) h;
$$;

-- Une copie de l'historique
create or replace function public.get_history_item(p_code text, p_id bigint)
returns json language sql security definer set search_path = public as $$
  select json_build_object('data', data, 'version', version, 'saved_at', saved_at, 'saved_by', saved_by)
  from equipes_historique where code = p_code and id = p_id;
$$;

revoke execute on function public.get_state(text), public.get_version(text),
  public.put_state(text, jsonb, bigint, text), public.get_history(text),
  public.get_history_item(text, bigint) from public;
grant execute on function public.get_state(text), public.get_version(text),
  public.put_state(text, jsonb, bigint, text), public.get_history(text),
  public.get_history_item(text, bigint) to anon, authenticated;
