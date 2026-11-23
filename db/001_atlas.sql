create schema atlas;
create role atlas_runtime nologin;
revoke all on schema atlas from public;
grant usage on schema atlas to atlas_runtime;
set search_path = atlas, pg_catalog;
create table organizations(id uuid primary key, name text not null);
create table workspaces(id uuid primary key, organization_id uuid not null references organizations, name text not null, unique(id,organization_id));
create table principals(id uuid primary key, name text not null, kind text not null check(kind in ('person','consumer')), subject text unique);
create table credentials(digest text primary key, principal_id uuid not null references principals, expires_at timestamptz not null);
create table sessions(like credentials including all);
create table memberships(workspace_id uuid references workspaces, principal_id uuid references principals, role text not null check(role in ('viewer','editor','reviewer','consumer')), primary key(workspace_id,principal_id));
create function actor() returns uuid language sql stable as $$select nullif(current_setting('atlas.actor',true),'')::uuid$$;
create function scope() returns uuid language sql stable as $$select nullif(current_setting('atlas.workspace',true),'')::uuid$$;
create function member_role(w uuid) returns text language sql stable security definer set search_path=atlas,pg_catalog as $$select role from memberships where workspace_id=w and principal_id=actor() and w=scope()$$;
create function writable(w uuid) returns boolean language sql stable as $$select member_role(w) in ('editor','reviewer')$$;
create table knowledge_assets(
 id uuid not null, workspace_id uuid not null, organization_id uuid not null,
 title text not null, asset_type text not null, domain text not null, description text not null,
 structured_content jsonb not null, owner_id uuid not null references principals,
 lifecycle_status text not null check(lifecycle_status in ('Draft','In Review','Published','Superseded','Archived')),
 classification text not null check(classification in ('Workspace','Shareable')),
 verification_status text not null check(verification_status in ('Unverified','Partially Verified','Verified','Disputed')),
 version int not null check(version>0), tags text[] not null, collection text not null,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), reviewed_at timestamptz, next_review_at date,
 primary key(workspace_id,id), foreign key(workspace_id,organization_id) references workspaces(id,organization_id));
create index assets_updated on knowledge_assets(workspace_id,updated_at desc,id);
create function search_vector(t text,d text,c jsonb,tags text[]) returns tsvector immutable language sql as $$
 select setweight(to_tsvector('simple',t),'A') || setweight(to_tsvector('simple',array_to_string(tags,' ')),'B') || to_tsvector('simple',d || ' ' || c::text)$$;
create index assets_text on knowledge_assets using gin(search_vector(title,description,structured_content,tags));
create table knowledge_asset_versions(workspace_id uuid,asset_id uuid,version int,snapshot jsonb not null,actor_id uuid not null,created_at timestamptz default now(),primary key(workspace_id,asset_id,version),foreign key(workspace_id,asset_id) references knowledge_assets);
create table evidence_records(workspace_id uuid,asset_id uuid,id uuid,source text not null,passage text not null,claim text not null,kind text not null,primary key(workspace_id,asset_id,id),foreign key(workspace_id,asset_id) references knowledge_assets);
create table file_attachments(workspace_id uuid,asset_id uuid,id uuid,name text not null,media_type text not null,content bytea not null,digest text not null,primary key(workspace_id,asset_id,id),foreign key(workspace_id,asset_id) references knowledge_assets);
create table knowledge_relationships(workspace_id uuid,asset_id uuid,related_id uuid,relation text check(relation in ('SUPPORTS','REFERENCES','COMPETES_WITH','USES','TARGETS','HAS_LAB')),actor_id uuid not null,created_at timestamptz default now(),check(asset_id<>related_id),primary key(workspace_id,asset_id,related_id,relation),foreign key(workspace_id,asset_id) references knowledge_assets,foreign key(workspace_id,related_id) references knowledge_assets);
create table external_entity_references(workspace_id uuid,asset_id uuid,application text,external_id text,primary key(workspace_id,application,external_id,asset_id),foreign key(workspace_id,asset_id) references knowledge_assets);
create table integration_events(seq bigint generated always as identity primary key,event_id uuid unique not null,event_type text not null,schema_version int not null default 1,organization_id uuid not null,workspace_id uuid not null,asset_id uuid not null,asset_version int not null,source_application text not null default 'atlas',occurred_at timestamptz not null default now(),correlation_id uuid not null,actor_id uuid not null,foreign key(workspace_id,asset_id) references knowledge_assets);
create index event_feed on integration_events(workspace_id,seq);
create table sync_checkpoints(workspace_id uuid,principal_id uuid,last_seq bigint not null,updated_at timestamptz default now(),primary key(workspace_id,principal_id));
create table audit_logs(workspace_id uuid,asset_id uuid,version int,action text,actor_id uuid not null,occurred_at timestamptz default now(),primary key(workspace_id,asset_id,version),foreign key(workspace_id,asset_id) references knowledge_assets);
create table saved_views(workspace_id uuid,principal_id uuid,name text,settings jsonb not null,primary key(workspace_id,principal_id,name));
create table receipts(workspace_id uuid,principal_id uuid,key uuid,digest text not null,result jsonb not null,primary key(workspace_id,principal_id,key));
alter table knowledge_assets enable row level security;
create policy asset_read on knowledge_assets for select using(member_role(workspace_id) in ('reviewer','viewer','editor') or (member_role(workspace_id)='consumer' and lifecycle_status='Published' and classification='Shareable'));
create policy asset_create on knowledge_assets for insert with check(writable(workspace_id) and owner_id=actor() and lifecycle_status='Draft' and verification_status='Unverified');
create policy asset_edit on knowledge_assets for update using(writable(workspace_id)) with check(writable(workspace_id) and (member_role(workspace_id)='reviewer' or (lifecycle_status in ('Draft','In Review') and verification_status='Unverified')));
grant select,insert,update on knowledge_assets to atlas_runtime;
do $$declare t text;begin
 foreach t in array array['knowledge_asset_versions','knowledge_relationships','file_attachments','evidence_records','external_entity_references','audit_logs','integration_events'] loop
 execute format('alter table %I enable row level security',t);
 execute format('create policy read on %I for select using(member_role(workspace_id) in (''viewer'',''editor'',''reviewer''))',t);
 execute format('create policy append on %I for insert with check(writable(workspace_id))',t);
 execute format('grant select,insert on %I to atlas_runtime',t);
 end loop;
end$$;
-- A service principal can only discover the CURRENT released version of a shareable asset.
create policy released_event on integration_events for select using(member_role(workspace_id)='consumer' and exists(select 1 from knowledge_assets a where a.workspace_id=integration_events.workspace_id and a.id=integration_events.asset_id and a.version=integration_events.asset_version));
create policy released_ref on external_entity_references for select using(member_role(workspace_id)='consumer' and exists(select 1 from knowledge_assets a where a.workspace_id=external_entity_references.workspace_id and a.id=external_entity_references.asset_id));
do $$declare t text; begin
 foreach t in array array['receipts','saved_views','sync_checkpoints'] loop
 execute format('alter table %I enable row level security',t);
 execute format('create policy own on %I using(member_role(workspace_id) is not null and principal_id=actor())',t);
 execute format('grant select,insert,update on %I to atlas_runtime',t);
 end loop;
end$$;
grant usage on all sequences in schema atlas to atlas_runtime;
reset search_path;

create function atlas.workspace_context() returns table(organization_id uuid) language sql stable security definer set search_path=atlas,pg_catalog as $$select w.organization_id from workspaces w where w.id=scope() and member_role(w.id) is not null$$;
