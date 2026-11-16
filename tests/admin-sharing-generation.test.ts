import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';

// CSS has no behavior in these server-rendered control contract tests.
const loadModule=createRequire(process.cwd()+'/package.json');
const previousCssLoader=loadModule.extensions['.css'];
loadModule.extensions['.css']=()=>undefined;
let sharing:typeof import('../src/components/admin-sharing-panel');
try{sharing=loadModule('./src/components/admin-sharing-panel');}
finally{
 if(previousCssLoader)loadModule.extensions['.css']=previousCssLoader;
 else delete loadModule.extensions['.css'];
}

test('queued sharing generation is blocked by any dirty draft, including English-only work',()=>{
 assert.equal(sharing.sharingGenerationDisabled(false,true),true);
 assert.equal(sharing.sharingGenerationDisabled(true,false),true);
 assert.equal(sharing.sharingGenerationDisabled(true,true),true);
 assert.equal(sharing.sharingGenerationDisabled(false,false),false);
});

test('generation controls render disabled for unsaved drafts and enabled after saving',()=>{
 for(const label of ['补齐 English / ShareEn','重新生成 English + ShareEn · AI','重新生成 English · AI','重新生成 ShareEn · AI','补齐配图']){
  const dirty=renderToStaticMarkup(createElement(sharing.SharingGenerationButton,{busy:false,dirty:true},label));
  assert.match(dirty,/<button[^>]*disabled=""/);
  assert.ok(dirty.includes(label));
  const saved=renderToStaticMarkup(createElement(sharing.SharingGenerationButton,{busy:false,dirty:false},label));
  assert.doesNotMatch(saved,/disabled=/);
 }
 const unavailable=renderToStaticMarkup(createElement(sharing.SharingGenerationButton,{busy:false,dirty:false,disabled:true},'补齐配图'));
 assert.match(unavailable,/disabled=""/);
});
