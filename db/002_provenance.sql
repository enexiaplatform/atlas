set local search_path=atlas,pg_catalog;
alter table evidence_records add column attachment_id uuid;
alter table evidence_records add foreign key(workspace_id,asset_id,attachment_id) references file_attachments(workspace_id,asset_id,id);
update evidence_records e set attachment_id=(select f.id from file_attachments f where f.workspace_id=e.workspace_id and f.asset_id=e.asset_id and f.name=e.source limit 1)
where 1=(select count(*) from file_attachments f where f.workspace_id=e.workspace_id and f.asset_id=e.asset_id and f.name=e.source);
create table search_documents(workspace_id uuid,asset_id uuid,attachment_id uuid,passage text not null,primary key(workspace_id,asset_id,attachment_id),foreign key(workspace_id,asset_id,attachment_id) references file_attachments);
alter table search_documents enable row level security;
create policy document_read on search_documents for select using(member_role(workspace_id) in ('reviewer','editor','viewer'));
create policy document_insert on search_documents for insert with check(writable(workspace_id));
grant select,insert on search_documents to atlas_runtime;
create index documents_text on search_documents using gin(to_tsvector('simple',passage));
insert into search_documents select workspace_id,asset_id,id,left(convert_from(content,'UTF8'),64000) from file_attachments where media_type='text/plain';
-- The web gateway can verify identities and bind sessions. Domain queries run under atlas_runtime.
create role atlas_gateway nologin noinherit;
grant atlas_runtime to atlas_gateway;
grant usage on schema atlas to atlas_gateway;
grant select on principals,credentials,sessions,memberships,workspaces to atlas_gateway;
grant insert,delete on sessions to atlas_gateway;
