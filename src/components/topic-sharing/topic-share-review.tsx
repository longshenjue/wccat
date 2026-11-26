import type {TopicShareReviewWarning} from '../../lib/topic-sharing/types';
import {topicShareReviewLabel} from '../../lib/topic-sharing/review-labels';

/** Administrator-only advisory; never included in exported posters or captions. */
export function TopicShareReview({warnings}:{warnings:TopicShareReviewWarning[]}) {
 if(!warnings.length)return null;
 return <aside className="topic-review-panel" aria-label="编辑提示" data-topic-review>
  <strong>⚠ {warnings.length} 项编辑提示</strong>
  <p>自动检查仅供参考，翻译与表达由你判断。提示不影响生成、保存或下载。</p>
  <details><summary>查看涉及的字段</summary><ul>{warnings.map(warning=><li key={`${warning.path}:${warning.code}`}>
   <b>{topicShareReviewLabel(warning.path)}</b><span>{warning.message}</span>
   {warning.values?.length?<small>涉及：{warning.values.join('、')}</small>:null}
  </li>)}</ul></details>
 </aside>;
}
