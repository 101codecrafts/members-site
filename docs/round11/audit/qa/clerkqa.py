import json,os,requests,time
F='https://upright-manatee-3661.clerk.accounts.dev'; O={'Origin':'https://members-site-101cc-staging.vercel.app'}
UID='user_3LYwquA08oVH0XTPl1bJeb4ckUC'
class QA:
  def __init__(s):
    tok=requests.post('https://api.clerk.com/v1/sign_in_tokens',json={'user_id':UID,'expires_in_seconds':3600}).json()['token']
    s.db=requests.post(F+'/v1/dev_browser',headers=O).json().get('token')
    j=requests.post(F+'/v1/client/sign_ins',params={'__clerk_db_jwt':s.db},data={'strategy':'ticket','ticket':tok},headers=O).json()
    s.sid=j['response']['created_session_id']; s.t=0; s.j=None
  def jwt(s):
    if time.time()-s.t>40:
      s.j=requests.post(F+f'/v1/client/sessions/{s.sid}/tokens',params={'__clerk_db_jwt':s.db},headers=O).json()['jwt']; s.t=time.time()
    return s.j
