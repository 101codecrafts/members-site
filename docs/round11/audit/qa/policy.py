# Founder rules (BRIEF.md, 5 Nov 2026) turned into a page-access table and element rules.
# Values: 'ok' | 'auth' (visitor -> /auth?next=<page>) | 'up' (guest -> "become a learner or tutor") | 'home' (redirect to the role's home)
#         | 'deny' (role can't use it: hide the entry, direct hits go to the role home) | 'ok*' (allowed but founder should confirm)
ROLES = ['visitor', 'guest', 'learner', 'tutor', 'admin', 'root']
HOME = {'visitor': '/index.html', 'guest': 'guest home (new)', 'learner': '/dashboard.html', 'tutor': '/tutor.html', 'admin': '/admin.html', 'root': '/admin.html'}
AUTH = '/auth?next=…'
O, A, U, H, D, Q = 'ok', 'auth', 'up', 'home', 'deny', 'ok*'
def row(v, g, l, t, a, r=None): return dict(zip(ROLES, (v, g, l, t, a, r or a)))
PUBLIC = row(O, O, O, O, O)
PAGES = {
    'index.html': PUBLIC, 'about.html': PUBLIC, 'news.html': PUBLIC, 'article.html': PUBLIC, 'community.html': PUBLIC,
    'events.html': PUBLIC, 'opportunities.html': PUBLIC, 'privacy.html': PUBLIC, 'terms.html': PUBLIC, 'verify.html': PUBLIC,
    '404.html': PUBLIC, 'nope-404-probe.html': PUBLIC, 'offline.html': PUBLIC, 'cards.html': PUBLIC,
    'go.html': row('ok (news) / auth (courses, resources)', O, O, O, O),
    'signin.html': row('→ /auth', H, H, H, H), 'signup.html': row('→ /auth?mode=signup', H, H, H, H),
    'onboarding.html': row(A, 'ok until complete, then home', 'ok until complete, then home', 'ok until complete, then home', H),
    'dashboard.html': row(A, H, O, H, H), 'tutor.html': row(A, U, 'deny (offer "become a tutor")', O, H), 'admin.html': row(A, D, D, D, O),
    'courses.html': row(A, 'ok (external + free only)', O, O, O), 'course.html': row(A, 'ok if free/external, else up', 'ok (paywall/plan lock)', O, O),
    'course.html?id=web-basics': row(A, 'ok if free/external, else up', 'ok (paywall/plan lock)', O, O),
    'learn.html': row(A, Q, O, O, O), 'practice.html': row(A, Q, O, O, O), 'problem.html': row(A, Q, O, O, O), 'ide.html': row(A, Q, O, O, O),
    'interview.html': row(A, Q, O, O, O), 'contests.html': row(A, Q, O, O, O), 'contest.html': row(A, Q, O, O, O), 'competitions.html': row(A, Q, O, O, O),
    'resources.html': row(A, 'ok (browse)', O, O, O), 'ai-tools.html': row(A, Q, O, O, O),
    'projects.html': row(A, U, O, O, O), 'launchpad.html': row(A, 'ok (browse; no posting)', O, O, O), 'testing.html': row(A, 'ok (browse; no campaigns)', O, O, O),
    'groups.html': row(A, Q, O, O, O),
    'marketplace.html': row(A, 'ok (buy only)', O, O, O), 'product.html': row(A, 'ok (buy only)', O, O, O), 'product-item.html': row(A, 'ok (buy only)', O, O, O),
    'cart.html': row(A, O, O, O, O), 'checkout.html': row(A, O, O, O, O), 'orders.html': row(A, O, O, O, O),
    'seller.html': row(A, U, O, O, O), 'rfq.html': row(A, 'ok (buyer side)', O, O, O),
    'sessions.html': row(A, U, O, O, O), 'session.html': row(A, U, O, O, O), 'whiteboard.html': row(A, U, O, O, O),
    'profile.html': row('auth (own) / ok (public /u/handle)', O, O, O, O), 'card.html': row(A, O, O, O, O), 'settings-apps.html': row(A, O, O, O, O),
    'announcements.html': row(A, O, O, O, O),
}
def page_of(href):
    if not href: return None
    h = href.split('#')[0].split('?')[0]
    if h.startswith('http') and 'members-site' not in h: return 'external'
    h = h.rsplit('/', 1)[-1] or 'index.html'
    if href.startswith('/go/'): return 'go.html'
    if href.startswith('/u/'): return 'profile.html'
    return h

def should(role, text, href, zone, page):
    t = (text or '').strip().lower()
    dest = page_of(href)
    signed = role != 'visitor'
    # element-level rules first
    if t in ('sign in', 'log in') or t.startswith('sign in'): return '/auth' if not signed else 'hidden'
    if t in ('join', 'create a free account', 'join community', 'join the community', 'join free', 'get started', 'create account', 'sign up'):
        return '/auth?mode=signup' if not signed else ('hidden' if t == 'join' else 'community.html' if 'community' in t else 'hidden')
    if t.startswith('101 codecrafts') or t in ('home', 'codecrafts'):
        if zone == 'footer' or not signed: return '/index.html'
        return HOME[role]
    if t == 'community': return 'community.html'
    if t in ('learner', 'tutor', 'admin') and zone in ('account', 'top'):
        return {'learner': 'only if the user holds learner → /dashboard.html', 'tutor': 'only if tutor → /tutor.html', 'admin': 'only if admin/root → /admin.html'}[t]
    if 'create project' in t or 'new project' in t: return 'hidden' if role in ('visitor', 'guest', 'admin', 'root') else 'projects.html#new'
    if t in ('add course', 'create event', 'post announcement'): return 'admin console action' if role in ('admin', 'root') else 'hidden'
    if t == 'invite admin': return 'root only: add admin by email' if role == 'root' else 'hidden'
    if any(k in t for k in ('become a seller', 'start selling', 'sell ', 'list a product', 'open your store')):
        return AUTH if role == 'visitor' else ('upgrade: become a learner or tutor' if role == 'guest' else 'seller flow (admin approval)')
    if any(k in t for k in ('add to cart', 'buy now', 'buy ', 'checkout')): return AUTH if role == 'visitor' else 'ok'
    if any(k in t for k in ('rate', 'review', 'stars')): return AUTH if role == 'visitor' else 'only if enrolled/used'
    if any(k in t for k in ('book a session', 'book 1:1', 'book session', 'book a 1:1')): return AUTH if role == 'visitor' else ('upgrade' if role == 'guest' else 'ok')
    if dest == 'external': return 'external (new tab, rel=noopener)'
    if dest and dest in PAGES:
        v = PAGES[dest][role]
        if v == O: return dest
        if v == A: return f'{AUTH.replace("…", dest)}'
        if v == H: return HOME[role]
        if v == U: return 'upgrade: become a learner or tutor'
        if v == D: return f'hidden; direct hit → {HOME[role]}'
        return f'{dest} ({v})'
    return None
