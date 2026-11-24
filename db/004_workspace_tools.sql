set local search_path=atlas,pg_catalog;
create table workspace_templates(workspace_id uuid references workspaces,name text,asset_type text not null,domain text not null,fields text[] not null,primary key(workspace_id,name));
alter table workspace_templates enable row level security;
create policy template_read on workspace_templates for select using(member_role(workspace_id) in ('viewer','editor','reviewer'));
grant select on workspace_templates to atlas_runtime;

create function folded(text) returns text language sql immutable strict parallel safe as $$
 select translate(regexp_replace(normalize(lower($1), NFD),'[̀-ͯ]','','g'),'đ','d')$$;
create function folded_vector(t text,d text,c jsonb,tags text[]) returns tsvector language sql immutable as $$
 select setweight(to_tsvector('simple',atlas.folded(t)),'A') || setweight(to_tsvector('simple',atlas.folded(array_to_string(tags,' '))),'B') || to_tsvector('simple',atlas.folded(d||' '||c::text))$$;
create index assets_folded on knowledge_assets using gin(folded_vector(title,description,structured_content,tags));
grant execute on function folded(text),folded_vector(text,text,jsonb,text[]) to atlas_runtime;
create table workspace_limits(workspace_id uuid primary key references workspaces,attachment_bytes bigint not null check(attachment_bytes>=0));
create function enforce_file_quota() returns trigger language plpgsql security definer set search_path=atlas,pg_catalog as $$
declare used_bytes bigint; max_bytes bigint;
begin
 perform pg_advisory_xact_lock(hashtextextended(new.workspace_id::text,7629714));
 select coalesce(sum(octet_length(content)),0) into used_bytes from file_attachments where workspace_id=new.workspace_id;
 select coalesce((select attachment_bytes from workspace_limits where workspace_id=new.workspace_id),67108864) into max_bytes;
 if used_bytes+octet_length(new.content)>max_bytes then raise exception using errcode='AT413',message='Workspace file quota exceeded';end if;
 return new;
end$$;
create trigger quota_guard before insert on file_attachments for each row execute function enforce_file_quota();
create table login_windows(address_hash text primary key,bucket bigint not null,attempts int not null);
create function allow_login(address text) returns boolean language plpgsql security definer set search_path=atlas,pg_catalog as $$
declare minute bigint:=floor(extract(epoch from clock_timestamp())/60); n int;
begin
 delete from login_windows where bucket<minute-1;
 insert into login_windows values(address,minute,1) on conflict(address_hash) do update set bucket=minute,attempts=case when login_windows.bucket=minute then least(login_windows.attempts+1,31) else 1 end returning attempts into n;
 return n<=30;
end$$;
revoke execute on function allow_login(text),enforce_file_quota() from public;
grant execute on function allow_login(text) to atlas_gateway;
