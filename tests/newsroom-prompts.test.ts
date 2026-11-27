import test from 'node:test';
import assert from 'node:assert/strict';

test('news tasks share one short reporting policy without teaching public evidence-gap filler',async()=>{
 const prompts=await import('../src/lib/newsroom/prompts').catch(error=>assert.fail(`Shared newsroom prompts are missing: ${error.message}`));
 for(const task of ['topic','daily','shareen','analysis','research'] as const){
  const prompt=prompts.newsroomPrompt(task);
  assert.equal(prompt.split('SOURCE POLICY').length-1,1);
  assert.match(prompt,/publication date.*event date/i);assert.match(prompt,/current.*background/i);
  assert.doesNotMatch(prompt,/可以使用[“"]从榜单信号看|明确说[“"]从现有榜单信号看|otherwise give a cautious AI editorial estimate/i);
  assert.ok(prompt.length<6500,`${task} must remain a focused contract`);
 }
 assert.match(prompts.newsroomPrompt('topic'),/image.*comments/i);
 assert.match(prompts.newsroomPrompt('shareen'),/every.*original.*title/i);
});

test('public diagnostic prose is removed from generated fields without deleting real uncertainty or human edits',async()=>{
 const {cleanGeneratedNewsText}=await import('../src/lib/newsroom/prose').catch(error=>assert.fail(`Generated prose boundary is missing: ${error.message}`));
 assert.equal(cleanGeneratedNewsText('A股“史诗级暴涨”上热搜，但缺具体数据佐证。'),'');
 assert.equal(cleanGeneratedNewsText('11月27日，沪指午后拉升。现有材料没有给出涨幅。监管部门宣布完善稳市机制。'),'11月27日，沪指午后拉升。监管部门宣布完善稳市机制。');
 assert.equal(cleanGeneratedNewsText('据官方介绍，实验室结果仍待公布。'),'据官方介绍，实验室结果仍待公布。');
 assert.equal(cleanGeneratedNewsText('Saved material does not provide a date. The regulator announced a new measure.'),'The regulator announced a new measure.');
});
