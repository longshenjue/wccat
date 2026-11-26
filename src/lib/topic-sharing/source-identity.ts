import type {TopicShareSource} from './types';

/** A frozen generation may add comment evidence while its underlying report stays unchanged. */
export const topicShareBaseFingerprint=(source:TopicShareSource)=>source.baseFingerprint??source.fingerprint;
