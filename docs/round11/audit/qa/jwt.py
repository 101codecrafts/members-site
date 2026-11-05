import json,os,base64,requests
F='https://upright-manatee-3661.clerk.accounts.dev'; O={'Origin':'https://members-site-101cc-staging.vercel.app'}
UID='user_3LYwquA08oVH0XTPl1bJeb4ckUC'
r=requests.post('https://api.clerk.com/v1/sign_in_tokens',json={'user_id':UID,'expires_in_seconds':3600}); tok=r.json()['token']; print('sit',r.status_code)
r=requests.post(F+'/v1/dev_browser',headers=O); db=r.json().get('token') or r.json().get('id')
r=requests.post(F+'/v1/client/sign_ins',params={'__clerk_db_jwt':db},data={'strategy':'ticket','ticket':tok},headers=O); j=r.json()
sid=(j.get('response') or {}).get('created_session_id')
r=requests.post(F+f'/v1/client/sessions/{sid}/tokens',params={'__clerk_db_jwt':db},headers=O); jwt=r.json().get('jwt'); print('tok',r.status_code, bool(jwt))
open('.qa_jwt','w').write(jwt); os.chmod('.qa_jwt',0o600)
u=requests.get('https://api.clerk.com/v1/users/'+UID).json(); print({k:u.get(k) for k in ('first_name','last_name','two_factor_enabled','public_metadata')}, [e['email_address'][:6]+'…' for e in u.get('email_addresses',[])])
