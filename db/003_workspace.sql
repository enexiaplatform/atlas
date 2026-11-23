set local search_path=atlas,pg_catalog;
-- Keep each workspace's cursor independent. Translate existing durable consumer checkpoints with it.
create temporary table cursor_map on commit drop as select workspace_id,seq as old_seq,row_number() over(partition by workspace_id order by seq) as new_seq from integration_events;
update sync_checkpoints s set last_seq=coalesce((select max(new_seq) from cursor_map m where m.workspace_id=s.workspace_id and m.old_seq<=s.last_seq),0);
alter table integration_events alter column seq drop identity;
alter table integration_events drop constraint integration_events_pkey;
update integration_events e set seq=m.new_seq from cursor_map m where e.workspace_id=m.workspace_id and e.seq=m.old_seq;
alter table integration_events add primary key(workspace_id,seq);
create function allocate_event_seq() returns trigger language plpgsql security definer set search_path=atlas,pg_catalog as $$
begin
 perform pg_advisory_xact_lock(hashtextextended(new.workspace_id::text,7629714));
 select coalesce(max(seq),0)+1 into new.seq from integration_events where workspace_id=new.workspace_id;
 return new;
end$$;
create trigger workspace_event_sequence before insert on integration_events for each row execute function allocate_event_seq();
create table workspace_admins(workspace_id uuid,principal_id uuid,primary key(workspace_id,principal_id),foreign key(workspace_id,principal_id) references memberships);
create function is_workspace_admin() returns boolean language sql stable security definer set search_path=atlas,pg_catalog as $$select exists(select 1 from workspace_admins where workspace_id=scope() and principal_id=actor() and member_role(scope())='reviewer')$$;
create table knowledge_taxonomies(workspace_id uuid references workspaces,id uuid,kind text check(kind in ('Domain','Collection','Tag')),name text not null,primary key(workspace_id,id),unique(workspace_id,kind,name));
alter table knowledge_taxonomies enable row level security;
create policy taxonomy_read on knowledge_taxonomies for select using(member_role(workspace_id) in ('reviewer','editor','viewer'));
create policy taxonomy_append on knowledge_taxonomies for insert with check(workspace_id=scope() and is_workspace_admin());
grant select,insert on knowledge_taxonomies to atlas_runtime;
create table administration_log(workspace_id uuid references workspaces,id uuid,action text not null,detail text not null,actor_id uuid not null,occurred_at timestamptz default now(),primary key(workspace_id,id));
alter table administration_log enable row level security;
create policy admin_log_read on administration_log for select using(workspace_id=scope() and is_workspace_admin());
create policy admin_log_append on administration_log for insert with check(workspace_id=scope() and is_workspace_admin() and actor_id=actor());
grant select,insert on administration_log to atlas_runtime;
create function workspace_members() returns table(id uuid,name text,role text) language sql stable security definer set search_path=atlas,pg_catalog as $$
 select p.id,p.name,m.role from memberships m join principals p on p.id=m.principal_id where m.workspace_id=scope() and is_workspace_admin() order by p.name$$;
create function configure_workspace(new_name text,member uuid,new_role text) returns void language plpgsql security definer set search_path=atlas,pg_catalog as $$
begin
 if not is_workspace_admin() then raise insufficient_privilege; end if;
 if new_name is not null then
  if length(trim(new_name)) not between 1 and 120 then raise check_violation; end if;
  update workspaces set name=trim(new_name) where id=scope();
  insert into administration_log values(scope(),gen_random_uuid(),'workspace.renamed',trim(new_name),actor(),now());
 else
  if new_role not in ('editor','reviewer','viewer') or new_role is null or exists(select 1 from workspace_admins where workspace_id=scope() and principal_id=member) then raise insufficient_privilege;end if;
  update memberships set role=new_role where workspace_id=scope() and principal_id=member and role<>'consumer';
  if not found then raise insufficient_privilege;end if;
  insert into administration_log values(scope(),gen_random_uuid(),'membership.changed',member::text||' '||new_role,actor(),now());
 end if;
end$$;
revoke execute on all functions in schema atlas from public;
grant execute on all functions in schema atlas to atlas_runtime;

