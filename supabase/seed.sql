-- =============================================================================
-- Demo seed (local / staging only). Catalogue content, no real people:
-- users arrive via the Clerk webhook. Safe to re-run.
-- =============================================================================

insert into public.tools (slug, name, category, description, website_url, pricing, student_offer, tags, is_featured, featured_rank) values
  ('vs-code',      'VS Code',      'Editor',       'Free, extensible code editor.', 'https://code.visualstudio.com', 'free', null, '{editor}', true, 1),
  ('github',       'GitHub',       'Code hosting', 'Host code, review PRs, run CI with Actions.', 'https://github.com', 'freemium', 'GitHub Student Developer Pack', '{git,ci}', true, 2),
  ('supabase',     'Supabase',     'Backend',      'Postgres, auth, storage and realtime.', 'https://supabase.com', 'freemium', null, '{database,postgres}', true, 3),
  ('vercel',       'Vercel',       'Hosting',      'Deploy Next.js with previews on every push.', 'https://vercel.com', 'freemium', null, '{hosting,nextjs}', true, 4),
  ('figma',        'Figma',        'Design',       'Collaborative interface design.', 'https://www.figma.com', 'freemium', 'Free Education plan', '{design}', true, 5),
  ('google-colab', 'Google Colab', 'AI/ML',        'Free hosted notebooks with GPUs.', 'https://colab.research.google.com', 'freemium', null, '{python,ml}', true, 6),
  ('hugging-face', 'Hugging Face', 'AI/ML',        'Open models, datasets and Spaces.', 'https://huggingface.co', 'freemium', null, '{ai}', true, 7),
  ('postman',      'Postman',      'APIs',         'Design and test APIs.', 'https://www.postman.com', 'freemium', 'Student Program', '{api}', false, null)
on conflict (slug) do nothing;

insert into public.courses (slug, title, summary, description, level, status, is_free, price_ugx, duration_minutes, tags, levels, published_at) values
  ('scratch-for-kids', 'Coding with Scratch', 'Games and animations for primary learners.', 'Block-based programming for P5-P7.', 'beginner', 'published', true, 0, 300, '{scratch,games}', '{primary}', now()),
  ('web-foundations', 'Web Foundations: HTML, CSS & JavaScript', 'Build and ship your first responsive website.', 'From semantic HTML to modern CSS and DOM scripting.', 'beginner', 'published', true, 0, 600, '{html,css,javascript,web}', '{o_level,a_level,university}', now()),
  ('python-for-ai', 'Python for AI', 'Python, NumPy and pandas for machine learning.', 'Hands-on notebooks with African datasets.', 'beginner', 'published', true, 0, 720, '{python,ai,data}', '{a_level,university,professional}', now()),
  ('fullstack-nextjs-supabase', 'Full-stack with Next.js & Supabase', 'Auth, Postgres, RLS and payments.', 'Production app: Next.js, Supabase RLS, Clerk, Flutterwave.', 'intermediate', 'published', false, 50000, 900, '{nextjs,supabase,payments}', '{university,professional}', now()),
  ('llm-apps', 'Building LLM Apps', 'Retrieval, agents and evaluation.', 'Draft course.', 'advanced', 'draft', true, 0, 480, '{llm,ai}', '{professional}', null)
on conflict (slug) do nothing;

insert into public.lessons (course_id, position, title, content_md, duration_minutes, is_preview)
select c.id, l.pos, l.title, l.body, l.mins, l.preview from public.courses c
join (values
  ('scratch-for-kids', 1, 'Your first sprite', '# Your first sprite', 20, true),
  ('web-foundations', 1, 'How the web works', '# How the web works', 30, true),
  ('web-foundations', 2, 'Semantic HTML', '# Semantic HTML', 45, false),
  ('web-foundations', 3, 'Modern CSS layout', '# Flexbox and Grid', 60, false),
  ('python-for-ai', 1, 'Python crash course', '# Python', 60, true),
  ('python-for-ai', 2, 'pandas for data wrangling', '# pandas', 60, false),
  ('fullstack-nextjs-supabase', 1, 'Architecture overview', '# Architecture', 30, true),
  ('fullstack-nextjs-supabase', 2, 'Row Level Security in practice', '# RLS', 60, false)
) as l(slug, pos, title, body, mins, preview) on l.slug = c.slug
on conflict (course_id, position) do nothing;

insert into public.learning_paths (slug, title, description, level, status, levels) values
  ('full-stack-developer', 'Full-stack Developer', 'From your first page to a deployed product with payments.', 'beginner', 'published', '{a_level,university}'),
  ('ai-engineer', 'AI Engineer', 'Python, data and AI products.', 'beginner', 'published', '{university,professional}'),
  ('young-coders', 'Young Coders', 'Fun first steps for primary and O-level.', 'beginner', 'published', '{primary,o_level}')
on conflict (slug) do nothing;
insert into public.path_courses (path_id, course_id, position)
select p.id, c.id, x.pos from (values ('full-stack-developer','web-foundations',1), ('full-stack-developer','fullstack-nextjs-supabase',2),
  ('ai-engineer','python-for-ai',1), ('young-coders','scratch-for-kids',1), ('young-coders','web-foundations',2)) as x(ps, cs, pos)
join public.learning_paths p on p.slug = x.ps join public.courses c on c.slug = x.cs
on conflict do nothing;

insert into public.events (slug, title, description, starts_at, ends_at, location, is_online, cal_com_url, capacity, price_ugx, status, levels) values
  ('kampala-build-night', 'Kampala Build Night', 'Bring a laptop, ship something, demo at 8pm.', now() + interval '10 days', now() + interval '10 days 4 hours', 'Kampala', false, null, 60, 0, 'published', '{a_level,university,professional}'),
  ('supabase-rls-workshop', 'Supabase RLS Workshop (online)', 'Live session on Row Level Security.', now() + interval '3 days', now() + interval '3 days 2 hours', 'Online', true, 'https://cal.com/101codecrafts/rls-workshop', 200, 0, 'published', '{university,professional}'),
  ('ai-bootcamp-weekend', 'AI Bootcamp Weekend', 'Two days of hands-on AI building.', now() + interval '20 days', now() + interval '21 days', 'Kampala', false, null, 40, 20000, 'published', '{university,professional}')
on conflict (slug) do nothing;

insert into public.external_resources (url, canonical_url, url_hash, type, title, description, site_name, provider, is_free, tags, status, levels, published_at) values
  ('https://developer.mozilla.org/en-US/docs/Learn', 'https://developer.mozilla.org/en-US/docs/Learn', encode(extensions.digest('https://developer.mozilla.org/en-US/docs/Learn', 'sha256'), 'hex'),
   'course', 'MDN Learn web development', 'Free, structured web development curriculum.', 'MDN Web Docs', 'mdn', true, '{web,html,css}', 'published', '{o_level,a_level,university}', now()),
  ('https://www.freecodecamp.org/learn', 'https://www.freecodecamp.org/learn', encode(extensions.digest('https://www.freecodecamp.org/learn', 'sha256'), 'hex'),
   'course', 'freeCodeCamp curriculum', 'Free certifications in web, data and more.', 'freeCodeCamp', 'freecodecamp', true, '{web,javascript}', 'published', '{a_level,university}', now())
on conflict (url_hash) do nothing;

insert into public.news_items (source, url, url_hash, title, summary, category, score, published_at) values
  ('101codecrafts', 'https://101codecrafts.com/news/members-site-launch', encode(extensions.digest('https://101codecrafts.com/news/members-site-launch', 'sha256'), 'hex'),
   'The new 101 Codecrafts members site is live', 'Courses, Launchpad, competitions and more in one place.', 'africa_tech', 0, now())
on conflict (url) do nothing;

insert into public.badges (code, name, description, xp_reward, rule) values
  ('first_lesson', 'First Steps', 'Completed your first lesson', 10, '{"action":"lesson_completed","count":1}'),
  ('ten_lessons', 'On a Roll', 'Completed 10 lessons', 50, '{"action":"lesson_completed","count":10}'),
  ('first_course', 'Graduate', 'Completed a course', 100, '{"action":"course_completed","count":1}'),
  ('builder', 'Builder', 'Created your first project', 30, '{"action":"project_created","count":1}'),
  ('reviewer', 'Helpful Voice', 'Wrote a tutor review', 5, '{"action":"review_written","count":1}')
on conflict (code) do nothing;

insert into public.social_links (platform, url, label, display_order) values
  ('github', 'https://github.com/101codecrafts', 'GitHub', 1),
  ('youtube', 'https://www.youtube.com/@101codecrafts', 'YouTube', 2),
  ('whatsapp_channel', 'https://whatsapp.com/channel/0000000000000000000000', 'WhatsApp Channel', 3)
on conflict do nothing;

insert into public.subscription_plans (code, name, description, interval, amount_ugx, features) values
  ('pro-monthly', '101 Pro (monthly)', 'All paid courses, priority mentorship slots.', 'monthly', 15000, '{"all_courses":true}'),
  ('pro-yearly', '101 Pro (yearly)', 'Two months free.', 'yearly', 150000, '{"all_courses":true}')
on conflict (code) do nothing;

insert into public.competitions (slug, title, description, levels, registration_opens, registration_closes, submissions_close, prizes, status) values
  ('kampala-hack-2026', 'Kampala Student Hack 2026', 'Build for your community. Tracks for every level.', '{o_level,a_level,university}',
   now() - interval '1 day', now() + interval '14 days', now() + interval '21 days', '[{"place":1,"prize":"UGX 1,000,000"}]', 'published')
on conflict (slug) do nothing;
insert into public.rubric_criteria (competition_id, name, weight, max_score)
select c.id, x.n, x.w, 10 from public.competitions c, (values ('Impact', 2.0), ('Technical quality', 1.5), ('Presentation', 1.0)) as x(n, w)
 where c.slug = 'kampala-hack-2026' and not exists (select 1 from public.rubric_criteria r where r.competition_id = c.id);

insert into public.announcements (title, body, audience, is_pinned, published_at)
select 'Welcome to the new 101 Codecrafts members site', 'Courses, Launchpad, competitions and more now live in one place.', 'public', true, now()
 where not exists (select 1 from public.announcements);
