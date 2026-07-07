alter table organizations
  add column operating_countries text[] not null default '{CL,AR}';
