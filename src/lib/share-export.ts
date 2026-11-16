import type { WccatDailyReport } from './daily-report';
import type { ShareEnCopy } from './shareen-types';
import type { ZipEntry } from './client-zip';

/** Measure at export size. All text remains visible, including when it cannot fit. */
export function fitShareEnCard(card: HTMLElement, identity: string): boolean {
 const overflows = () => [...card.querySelectorAll<HTMLElement>('[data-fit-zone]')]
  .some(zone => zone.scrollHeight > zone.clientHeight + 1 || zone.scrollWidth > zone.clientWidth + 1);
 card.classList.remove('shareen-compact');
 if (!overflows()) return false;
 card.classList.add('shareen-compact');
 if (overflows()) throw new Error(`卡片 ${identity} 超出 1200 × 1500 安全区，请缩短该卡文案后重试。`);
 return true;
}

export function shareEnTextFiles(report: WccatDailyReport, copy: ShareEnCopy): ZipEntry[] {
 const selected = copy.posts.find(post => post.id === copy.selectedPostId);
 if (!selected) throw new Error('请先选择有效的英文配文。');
 const texts = [
  {name: 'post.txt', text: selected.text + '\n'},
  {name: 'alt-text.txt', text: copy.altTexts.map((text,index)=>`${String(index+1).padStart(2,'0')} · ${text}`).join('\n\n')+'\n'},
  {name: 'sources.txt', text: [
   'WcCAT Daily Hot · ShareEn', report.reportDate,
   `Collection window: ${report.windowStart} → ${report.windowEnd} (UTC+8)`,
   'Observed platform ranking signals, not a population survey or independently verified reporting.',
   '', ...report.topics.slice(0,10).flatMap(topic=>[
    `Original rank #${topic.rank}: ${topic.title}`,
    ...topic.links.map(link=>`${link.sourceName}: ${link.url}`), ''
   ])
  ].join('\n')}
 ];
 return texts.map(({name,text})=>({name,data:new TextEncoder().encode(text)}));
}

export function downloadBlob(blob: Blob, filename: string): void {
 const url = URL.createObjectURL(blob);
 const link = document.createElement('a');
 link.href = url;
 link.download = filename;
 document.body.appendChild(link);
 link.click();
 link.remove();
 window.setTimeout(()=>URL.revokeObjectURL(url), 60_000);
}

export async function nextPaint(): Promise<void> {
 await document.fonts.ready;
 await new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));
}
