import test from 'node:test';
import assert from 'node:assert/strict';
import {renderDesignMarkdown,redactDesignText} from '../examples/workbench/design-format.mjs';
test('Design renders headings, lists, emphasis, code blocks and tables',()=>{
 const html=renderDesignMarkdown('# 标题\n\n- **名称**：`VISA`\n\n```json\n{"ok":true}\n```\n\n| 项目 | 状态 |\n| --- | --- |\n| 查询 | 完成 |');
 for(const tag of ['<h1>','<ul>','<strong>','<code>VISA</code>','<pre>','<table>'])assert.ok(html.includes(tag),tag);
});
test('Untrusted Design output cannot inject HTML, unsafe links or remote images',()=>{
 const html=renderDesignMarkdown('<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>\n\n[x](javascript:alert(1))\n\n![x](https://tracker.example/pixel)');
 assert.doesNotMatch(html,/<script|<img|href="javascript:/i);
 assert.match(html,/&lt;script&gt;/);
});
test('Pasted API keys are hidden in messages and conversation titles',()=>{
 const key='sk-'+ 'a'.repeat(30);assert.equal(redactDesignText('查询'+key),'查询[Key 已隐藏]');
 assert.ok(!renderDesignMarkdown('**'+key+'**').includes(key));
});
