import importlib.util
import pathlib
import unittest

root=pathlib.Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('cleanup',root/'ops/trash-cleanup.py')
cleanup=importlib.util.module_from_spec(spec);spec.loader.exec_module(cleanup)
owner='00000000-0000-4000-8000-000000000001'

class Result:
    def __init__(self,value): self.value=value
    def fetchone(self): return [self.value]
    def fetchall(self): return self.value

class Connection:
    def __init__(self,rows): self.rows=rows;self.objects=set(rows);self.protected=set()
    def execute(self,sql,args=None):
        if args is None: return Result([row for row in self.rows if row in self.objects])
        if 'note_photo_tombstones' in sql: return Result(args not in self.protected)
        return Result(args in self.objects)

class Storage:
    def __init__(self,conn): self.conn=conn;self.calls=[];self.fail_after=None;self.silent=False
    def delete_object(self,*,Bucket,Key):
        if self.fail_after is not None and len(self.calls)>=self.fail_after: raise RuntimeError('offline')
        self.calls.append((Bucket,Key))
        if not self.silent: self.conn.objects.discard((Bucket,Key))

class CleanupTests(unittest.TestCase):
    def setUp(self):
        self.rows=[('note-card-photos',owner+'/a.jpg'),('note-event-photos',owner+'/b.jpg')]
        self.conn=Connection(self.rows);self.storage=Storage(self.conn)
    def test_dry_run_and_success(self):
        self.assertEqual(cleanup.clean(self.conn,self.storage)['pending'],2);self.assertEqual(self.storage.calls,[])
        self.assertEqual(cleanup.clean(self.conn,self.storage,True)['deleted'],2)
        self.assertEqual(cleanup.clean(self.conn,self.storage,True)['deleted'],0)
    def test_changed_reference_and_partial_retry(self):
        self.conn.protected.add(self.rows[0]);self.assertEqual(cleanup.clean(self.conn,self.storage,True)['deleted'],1)
        self.assertNotIn(self.rows[0],self.storage.calls)
        self.conn=Connection(self.rows);self.storage=Storage(self.conn);self.storage.fail_after=1
        with self.assertRaises(RuntimeError): cleanup.clean(self.conn,self.storage,True)
        self.assertNotIn(self.rows[0],self.conn.objects);self.assertIn(self.rows[1],self.conn.objects)
        self.storage.fail_after=None;self.assertEqual(cleanup.clean(self.conn,self.storage,True)['deleted'],1)
    def test_silent_failure(self):
        self.storage.silent=True
        with self.assertRaisesRegex(RuntimeError,'not confirmed'): cleanup.clean(self.conn,self.storage,True)
        self.assertEqual(len(self.conn.objects),2)
    def test_unsafe_queue_fails_before_any_delete(self):
        for row in [('media',owner+'/avatar.jpg'),('note-card-photos','../foreign.jpg'),('note-card-photos',owner+'/../foreign.jpg'),('note-card-photos',owner+'//bad.jpg')]:
            self.conn=Connection(self.rows+[row]);self.storage=Storage(self.conn)
            with self.assertRaises(ValueError): cleanup.clean(self.conn,self.storage,True)
            self.assertEqual(self.storage.calls,[])
    def test_project_isolation_and_credentials(self):
        env={'SUPABASE_PROJECT_REF':cleanup.PROJECT,'SUPABASE_REGION':cleanup.REGION,'SUPABASE_DB_PASSWORD':'p@ss/word','SUPABASE_DB_POOLER_HOST':'aws-0-ap-northeast-2.pooler.supabase.com','SUPABASE_S3_ACCESS_KEY':'synthetic','SUPABASE_S3_SECRET_KEY':'synthetic'}
        self.assertIn('p%40ss%2Fword',cleanup.configuration(env))
        for key,value in [('SUPABASE_PROJECT_REF','another-project'),('SUPABASE_DB_POOLER_HOST','attacker.invalid'),('SUPABASE_DB_URL','postgres://postgres:secret@db.other.supabase.co/postgres')]:
            with self.assertRaises(ValueError): cleanup.configuration(dict(env,**{key:value}))

if __name__=='__main__': unittest.main()
