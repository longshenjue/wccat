import test from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {TopicShareCopyFields} from '../src/components/topic-sharing/topic-share-copy-fields';
import {topicShareCopy} from './helpers/topic-sharing-fixture';
import type {TopicShareSource} from '../src/lib/topic-sharing/types';

test('new covers edit brief and take while legacy visible fields remain editable',()=>{
 const copy=topicShareCopy({fingerprint:'a'.repeat(64)} as TopicShareSource).zh;
 const render=(news:boolean)=>renderToStaticMarkup(createElement(TopicShareCopyFields,{copy,news,language:'zh',disabled:false,onChange:()=>{}}));
 const legacy=render(false);assert.match(legacy,/aria-label="开头切入"/);assert.match(legacy,/aria-label="理解背景"/);assert.match(legacy,/aria-label="讨论问题"/);
 const current=render(true);assert.match(current,/aria-label="主图新闻简述"/);assert.match(current,/aria-label="主图一句点评"/);assert.match(current,/aria-label="文章正文"/);assert.doesNotMatch(current,/aria-label="开头切入"|aria-label="理解背景"|aria-label="讨论问题"/);
});
