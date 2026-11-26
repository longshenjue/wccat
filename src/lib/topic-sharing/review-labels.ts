const fields:Record<string,string>={headline:'卡片标题',hook:'开头切入',summary:'发生了什么',context:'理解背景',whyItMatters:'为什么值得关注',question:'讨论问题',altText:'图片替代文字',selectedPostId:'配文选择',posts:'配文候选数量',replies:'补充回复数量'};
export function topicShareReviewLabel(path:string):string {
 if(path==='column')return '栏目';
 if(path.startsWith('source.'))return '来源评论译文';
 const language=path.startsWith('en.')?'英文':path.startsWith('zh.')?'中文':'草稿';
 const post=path.match(/\.posts\[(\d+)\]\.(text|pattern|reason)$/u);
 if(post)return `${language} · 候选配文 ${Number(post[1])+1}${post[2]==='reason'?'的说明':post[2]==='pattern'?'的角度':''}`;
 const reply=path.match(/\.replies\[(\d+)\]$/u);
 if(reply)return `${language} · 补充回复 ${Number(reply[1])+1}`;
 return `${language} · ${fields[path.split('.')[1]]??'内容'}`;
}
export const TOPIC_REVIEW_MESSAGES:Record<string,string>={
 missing_text:'这里暂时没有文字，可由你补充。',length:'文字超过建议长度，请按实际阅读效果判断。',language:'语言或专有名词可能需要核对，原文已保留。',
 numerical:'数字、日期或单位未能自动对应保存材料，请自行核对。',comment_evidence:'自动检查未匹配到可用评论材料，请核对相关表述。',
 quotation:'引号中的译文或转述可能需要核对，系统不判定其是否正确。',population:'涉及整体人群或普遍态度，请自行核对表述范围。',
 duplicate_text:'候选文字较相似，可自行决定是否调整。',pattern:'候选角度或材料适配存在疑点，可自行判断。',selection:'未找到指定候选，当前预览与下载暂用第一条，可自行切换。',
 candidate_count:'候选数量与建议数量不同，已保留实际生成内容。',reply_count:'补充回复较多，已完整保留。',column_evidence:'此栏目与现有材料可能不完全匹配，仍可继续编辑。',
 link:'正文中有未匹配到来源的链接或类似链接的文字，请自行核对；原始来源链接保持不变。',
 review_unavailable:'这部分内容未能完成自动提示分析，草稿已保留，请自行核对。',
 comment_translation:'部分原始评论没有可展示的英文译文；英文卡片会省略该条，中文原话仍可查看。'
};
