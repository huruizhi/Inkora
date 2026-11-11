import hashlib,json,pathlib,plistlib,subprocess
root=pathlib.Path.cwd()
out=root/'artifacts/release/beta2-build5-preview'
out.mkdir(parents=True,exist_ok=True)
def run(*args):
 p=subprocess.run(args,capture_output=True,text=True)
 return {'status':p.returncode,'stdout':p.stdout,'stderr':p.stderr}
def must(*args):
 r=run(*args);assert r['status']==0,r;return r
for ext in ['zip','dmg']:
 src=root/f'artifacts/release/dry-run/Inkora-DRY-RUN.{ext}'
 dst=out/f'Inkora-0.1.0-beta.2-unsigned-universal.{ext}'
 if not dst.exists(): dst.write_bytes(src.read_bytes())
 must('cmp',str(src),str(dst))
zipdir=root/'build/release/rel161-unzipped';zipdir.mkdir(exist_ok=True)
must('ditto','-x','-k',str(out/'Inkora-0.1.0-beta.2-unsigned-universal.zip'),str(zipdir))
mount=root/'build/release/rel161-mount';mount.mkdir(exist_ok=True)
checks={}
checks['mount']=must('hdiutil','attach','-readonly','-nobrowse','-noautoopen','-mountpoint',str(mount),str(out/'Inkora-0.1.0-beta.2-unsigned-universal.dmg'))
try:
 for name,app in [('archive',root/'build/release/dry-run/Inkora.xcarchive/Products/Applications/Inkora.app'),('export',root/'build/release/dry-run/export/Inkora.app'),('zip',zipdir/'Inkora.app'),('dmg',mount/'Inkora.app')]:
  info=plistlib.loads((app/'Contents/Info.plist').read_bytes())
  versions={k:info[k] for k in ['CFBundleIdentifier','CFBundleVersion','CFBundleShortVersionString','LSMinimumSystemVersion']}
  assert versions=={'CFBundleIdentifier':'com.huruizhi.Inkora','CFBundleVersion':'5','CFBundleShortVersionString':'0.1.0','LSMinimumSystemVersion':'14.0'},versions
  binary=app/'Contents/MacOS/Inkora'
  arch=must('lipo','-archs',str(binary));assert set(arch['stdout'].split())=={'arm64','x86_64'}
  deps=must('otool','-L',str(binary));assert 'Sparkle' not in deps['stdout']
  strict=run('codesign','--verify','--deep','--strict',str(app))
  detail=run('codesign','-dv','--verbose=4',str(app))
  ent=run('codesign','-d','--entitlements',':-',str(app))
  if name!='archive':
   assert strict['status']==0 and 'runtime)' in detail['stderr']
   actual=plistlib.loads(ent['stdout'].encode());expected=plistlib.loads((root/'app/Resources/Inkora.entitlements').read_bytes().replace(b'$(PRODUCT_BUNDLE_IDENTIFIER)',b'com.huruizhi.Inkora'))
   assert actual==expected,(actual,expected)
  if name != 'archive': must('tests/ci/editor-bundle-smoke.sh',str(app))
  checks[name]={'versions':versions,'architectures':arch,'dependencies':deps,'strictDeep':strict,'signature':detail,'entitlements':ent,'offlineBundle':run('tests/ci/editor-bundle-smoke.sh',str(app))}
finally:
 checks['detach']=must('hdiutil','detach',str(mount))
(out/'CHECKS.json').write_text(json.dumps(checks,indent=2)+'\n')
(root/'docs/evidence/INK-REL-161/CHECKS.json').write_text(json.dumps(checks,indent=2)+'\n')
print('Four locations checked; DMG detached; archive raw signature status:',checks['archive']['strictDeep']['status'])
