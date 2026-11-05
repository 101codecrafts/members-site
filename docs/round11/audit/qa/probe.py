import json,requests,sys
H='https://members-site-101cc-staging.vercel.app'
B=json.load(open('../../../staging/.bypass.json'))['api']
from clerkqa import QA
q=QA()
rows=[l.split() for l in open('routes_methods.txt') if l.strip()]
out=[]
for r in rows:
  path=r[0]; ms=r[1] if len(r)>1 else ''
  for who,hdr in (('anon',{}),('learner',None)):
    h={'x-vercel-protection-bypass':B,'Accept':'application/json',**(hdr if hdr is not None else {'Authorization':'Bearer '+q.jwt()})}
    res={}
    if 'GET' in ms:
      x=requests.get(H+'/api'+path,headers=h,timeout=30); res['GET']=x.status_code
      if who=='learner' and path in('/v1/me',): res['body']={k:(v if k!='profile' else {kk:v.get(kk) for kk in ('display_name','education_level','date_of_birth')}) for k,v in x.json().get('data',{}).items() if k in('roles','role','account_status','plan','tutor_verified','profile','onboarding')}
    if path.startswith('/v1/admin') or path.startswith('/v1/tutor'):
      for M in ('POST','PUT','PATCH'):
        if M in ms:
          x=requests.request(M,H+'/api'+path,headers={**h,'Content-Type':'application/json'},data='{}',timeout=30); res[M]=x.status_code
    out.append({'path':path,'who':who,**res}); print(who,path,res)
json.dump(out,open('api_probe.json','w'),indent=1)
