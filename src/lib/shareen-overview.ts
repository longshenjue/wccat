import type {WccatDailyReport} from './daily-report';
import type {ShareEnCopy} from './shareen-types';

/** The overview describes every ranked title, independently of the selected detail cards. */
export function shareEnOverviewAltText(report:Pick<WccatDailyReport,'reportDate'>,topics:ShareEnCopy['overview']['topics']):string {
 return `WcCAT Daily Hot, ${report.reportDate}. China’s Top ${topics.length}: ${topics.map(topic=>topic.title).join('; ')}. Highlighted stories have a closer-look card.`;
}
