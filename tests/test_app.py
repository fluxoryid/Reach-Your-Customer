import http.client,json,tempfile,threading,unittest,sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import server

class Workflow(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  cls.tmp=tempfile.TemporaryDirectory();server.DB=cls.tmp.name+'/test.db';server.init()
  cls.http=server.ThreadingHTTPServer(('127.0.0.1',0),server.Handler)
  threading.Thread(target=cls.http.serve_forever,daemon=True).start()
 @classmethod
 def tearDownClass(cls): cls.http.shutdown();cls.http.server_close();cls.tmp.cleanup()
 def setUp(self):self.cookie=''
 def request(self,path,data=None,origin=None):
  c=http.client.HTTPConnection('127.0.0.1',self.http.server_port)
  headers={'Content-Type':'application/json','Cookie':self.cookie}
  if origin: headers['Origin']=origin
  c.request('POST' if data is not None else 'GET','/api/'+path,json.dumps(data) if data is not None else None,headers)
  r=c.getresponse();status=r.status;b=json.loads(r.read());cookie=r.getheader('Set-Cookie')
  if cookie:self.cookie=cookie.split(';')[0]
  c.close();return status,b
 def register(self,email='test@example.com'):
  self.assertEqual(self.request('register',dict(email=email,name='Test',password='OriginalPass!123'))[0],201)
 def test_complete_journey(self):
  self.assertEqual(self.request('sellers?category=Baju+Pria')[0],401)
  self.register();self.assertEqual(self.request('register',dict(email='test@example.com',name='Test',password='OriginalPass!123'))[0],409)
  self.assertTrue(self.request('login',dict(email='test@example.com',password='OriginalPass!123'))[1]['first_login'])
  self.assertEqual(self.request('sellers?category=Baju+Pria')[0],403)
  self.assertEqual(self.request('change-password',dict(password='short'))[0],400)
  self.assertEqual(self.request('change-password',dict(password='OriginalPass!123'))[0],400)
  self.assertEqual(self.request('change-password',dict(password='NewSecurePass!123'))[0],200)
  self.assertEqual(self.request('sellers')[0],400)
  from urllib.parse import urlencode
  q=urlencode([('category',x) for x in server.CATEGORIES])
  a=self.request('sellers?'+q)[1];b=self.request('sellers?'+q+'&page=2')[1]
  self.assertEqual(len(a['items']),50);self.assertEqual(len(b['items']),50)
  self.assertFalse(set(r['id'] for r in a['items'])&set(r['id'] for r in b['items']))
  self.assertTrue(all(r['rating']>=4.9 and r['reviews']>=500 for r in a['items']))
  self.assertEqual(self.request('sellers?'+q+'&q=nonexistent')[1]['total'],0)
  self.assertEqual(self.request('logout',{})[0],200);self.assertEqual(self.request('me')[0],401)
 def test_lockout_and_expiration(self):
  self.register('lock@example.com')
  for code in [401,401,429]: self.assertEqual(self.request('login',dict(email='lock@example.com',password='wrong'))[0],code)
  status,b=self.request('login',dict(email='lock@example.com',password='OriginalPass!123'))
  self.assertEqual(status,429);self.assertGreaterEqual(b['retry_after'],599)
  with server.connect() as c:c.execute('UPDATE users SET locked_until=? WHERE email=?',(1,'lock@example.com'))
  self.assertEqual(self.request('login',dict(email='lock@example.com',password='OriginalPass!123'))[0],200)
 def test_registration_validation_and_origin(self):
  self.assertEqual(self.request('register',dict(email='x',name='Test',password='weak'))[0],400)
  self.assertEqual(self.request('register',dict(email='new@example.com',name='Test',password='weak'))[0],400)
  self.assertEqual(self.request('login',dict(email='unknown@example.com',password='test'))[0],404)
  self.assertEqual(self.request('login',dict(email='unknown@example.com',password='test'),origin='https://evil.example')[0],403)

if __name__=='__main__':unittest.main()
