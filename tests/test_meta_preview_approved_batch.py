import copy,hashlib,importlib.util,tempfile,unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('batch',ROOT/'scripts/prepare-meta-preview-approved-batch.py');batch=importlib.util.module_from_spec(spec);spec.loader.exec_module(batch)

class ApprovedBatchTest(unittest.TestCase):
 def setUp(self):
  self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup);self.media=Path(self.temp.name)
  data=(ROOT/'tests/fixtures/meta-previews/hd.png').read_bytes();(self.media/'hd.png').write_bytes(data)
  self.cases=[{'ad_id':'123','creative_id':'456','video_id':'789','account_id':'321'}]
  self.evidence={'videos':[{'video_id':'789','pagination_complete':True,'formats':[{'filter':'native','width':1080,'height':1920}],'thumbnails':[{'id':'1','uri':'https://scontent.test.fbcdn.net/official.png'}]}]}
  self.identities={'123':{'id':'123','account_id':'321','creative':{'id':'456','object_type':'VIDEO','video_id':'789'}}}
  self.rows=[{'client_id':1,'entity_id':'123','account_id':'321','creative_id':'456','metadata':{'video_id':'789','preview_asset_key':'video:789'},'preview_sha256':'a'*64,'preview_storage_path':'1/meta_ads/321/ad/123/old.png','updated_at':'2026-11-01T12:00:00Z','preview_mime_type':'image/png'}]
  self.measured={'results':[{'video_id':'789','status':'validated','index':0,'file':'hd.png','sha256':hashlib.sha256(data).hexdigest(),'width':720,'height':1280}]}
 def run_batch(self):return batch.prepare(self.cases,self.evidence,self.identities,self.rows,self.measured,self.media,{'version':1,'entries':[]})
 def test_arbitrary_identity_preserves_previous_and_never_authorizes_dispatch(self):
  manifest,report=self.run_batch();self.assertEqual(manifest['entries'][0]['ad_id'],'123');self.assertEqual(manifest['entries'][0]['previous']['sha256'],'a'*64);self.assertFalse(report['dispatch_authorized'])
 def test_unrelated_video_rejected(self):
  self.identities['123']['creative']['video_id']='999'
  with self.assertRaisesRegex(AssertionError,'OFFICIAL_IDENTITY'):self.run_batch()
 def test_incomplete_pagination_rejected(self):
  self.evidence['videos'][0]['pagination_complete']=False
  with self.assertRaisesRegex(AssertionError,'COLLECTION_INCOMPLETE'):self.run_batch()
 def test_larger_than_native_not_upscaled(self):
  self.evidence['videos'][0]['formats'][0].update(width=480,height=864)
  manifest,report=self.run_batch();self.assertEqual(manifest['entries'],[]);self.assertEqual(len(report['blocked']),1)
 def test_tampered_bytes_rejected(self):
  (self.media/'hd.png').write_bytes(b'wrong')
  with self.assertRaisesRegex(AssertionError,'HASH_MISMATCH'):self.run_batch()
if __name__=='__main__':unittest.main()
