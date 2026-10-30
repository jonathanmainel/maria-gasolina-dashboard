import importlib.util
import io
from pathlib import Path
import unittest
from PIL import Image

spec=importlib.util.spec_from_file_location('hd_audit',Path(__file__).parents[1]/'scripts/audit-meta-preview-hd.py')
audit=importlib.util.module_from_spec(spec);spec.loader.exec_module(audit)
frame_spec=importlib.util.spec_from_file_location('frame_audit',Path(__file__).parents[1]/'scripts/extract-meta-preview-frame.py')
frame=importlib.util.module_from_spec(frame_spec);frame_spec.loader.exec_module(frame)


class AuditTests(unittest.TestCase):
    def test_frame_fallback_does_not_read_video_when_official_hd_exists(self):
        result=frame.extract([dict(video_id='3')],dict(results=[dict(video_id='3',source='video.thumbnails',status='validated',quality='HD')]),'3',Path('missing-video.mp4'),Path('missing-ffmpeg'),Path('unused-output'))
        self.assertEqual(result['result'],'skipped_official_hd_available')
        self.assertEqual(result['frames'],[])

    def test_frame_fallback_requires_same_explicit_video_identity(self):
        with self.assertRaisesRegex(ValueError,'video_not_in_explicit_allowlist'):
            frame.extract([dict(video_id='3')],dict(results=[]),'9',Path('a'),Path('b'),Path('c'))

    def test_frame_fallback_requires_a_prior_thumbnail_audit(self):
        with self.assertRaisesRegex(ValueError,'audit_official_thumbnails_before_frame_fallback'):
            frame.extract([dict(video_id='3')],dict(results=[]),'3',Path('a'),Path('b'),Path('c'))

    def test_absolute_floor_does_not_promote_small_images(self):
        for dims in [(64,64),(160,284),(480,854),(640,1152),(720,1279)]:
            self.assertNotIn(audit.quality(*dims),('HD','Full HD'))

    def test_1072_is_hd_but_not_full_hd(self):
        self.assertEqual(audit.quality(1072,1928),'HD')
        self.assertEqual(audit.quality(1080,1920),'Full HD')
        self.assertEqual(audit.quality(720,1280),'HD')

    def test_preserves_square_and_landscape(self):
        self.assertEqual(audit.quality(720,720,1),'HD')
        self.assertEqual(audit.quality(1920,1080,16/9),'Full HD')
        self.assertEqual(audit.quality(1080,1350,4/5),'Full HD')
        self.assertEqual(audit.quality(1080,1080,9/16),'proporção divergente')

    def test_missing_video_ratio_does_not_assume_vertical(self):
        c=dict(ad_id='1',creative_id='2',video_id='3',account_id='4')
        e=dict(videos=[dict(video_id='3',thumbnails=[dict(uri='https://s.xx.fbcdn.net/a')])])
        job=audit.jobs_for([c],e)[0]
        self.assertIsNone(job['ratio'])
        self.assertEqual(audit.quality(1080,1920,job['ratio']),'proporção não confirmada')

    def test_uses_decoded_bytes_not_declared_dimensions(self):
        out=io.BytesIO();Image.new('RGB',(160,284)).save(out,format='PNG')
        self.assertEqual(audit.dimensions(out.getvalue()),(160,284))
        with self.assertRaises(Exception):audit.dimensions(b'not a complete image')

    def test_only_official_https_hosts(self):
        self.assertTrue(audit.trusted('https://scontent.xx.fbcdn.net/video.jpg'))
        for url in ['http://scontent.xx.fbcdn.net/a','https://fbcdn.net.evil.test/a','https://user:secret@scontent.xx.fbcdn.net/a','https://127.0.0.1/a']:
            self.assertFalse(audit.trusted(url))

    def test_redirect_is_validated_before_following(self):
        with self.assertRaisesRegex(ValueError,'untrusted_redirect'):
            audit.Redirects().redirect_request(None,None,302,'',{},'https://evil.test/a')

    def test_unrelated_video_is_not_a_candidate(self):
        c=dict(ad_id='1',creative_id='2',video_id='3',account_id='4')
        e=dict(videos=[dict(video_id='9',thumbnails=[dict(uri='https://s.xx.fbcdn.net/a')])])
        self.assertEqual(audit.jobs_for([c],e),[])

    def test_rejects_invalid_identity_before_creating_jobs(self):
        with self.assertRaisesRegex(ValueError,'invalid_identity'):
            audit.jobs_for([dict(ad_id='../a',creative_id='2',video_id='3',account_id='4')],dict(videos=[]))

    def test_failure_preserves_no_candidate_and_has_safe_reason(self):
        import tempfile
        with tempfile.TemporaryDirectory() as directory:
            result=audit.audit_one(dict(video_id='3',index=0,uri='https://evil.test/a?token=private',owners=[],ratio=9/16),Path(directory))
            self.assertEqual(result['status'],'failed')
            self.assertNotIn('uri',result)
            self.assertNotIn('private',str(result))

    def test_cache_identity_preserves_transform_but_ignores_signature(self):
        self.assertEqual(audit.cache_key('https://s.xx.fbcdn.net/a.jpg?oh=one'),audit.cache_key('https://s.xx.fbcdn.net/a.jpg?oh=two'))
        self.assertNotEqual(audit.cache_key('https://s.xx.fbcdn.net/a.jpg?stp=p64x64'),audit.cache_key('https://s.xx.fbcdn.net/a.jpg?stp=p1080x1920'))

    def test_repeated_audit_reuses_verified_local_file_without_network(self):
        import tempfile
        from unittest.mock import patch
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);(root/'media').mkdir()
            uri='https://s.xx.fbcdn.net/a.jpg?oh=signature'
            path=root/'media'/f'3-{audit.cache_key(uri)}.jpg'
            Image.new('RGB',(720,1280)).save(path,format='JPEG')
            before=path.read_bytes()
            with patch.object(audit.urllib.request,'build_opener',side_effect=AssertionError('network must not run')):
                result=audit.audit_one(dict(video_id='3',index=2,uri=uri,owners=[],ratio=9/16),root)
            self.assertEqual(result['status'],'validated')
            self.assertEqual(result['download'],'reused_local')
            self.assertEqual(path.read_bytes(),before)


if __name__=='__main__':unittest.main()
