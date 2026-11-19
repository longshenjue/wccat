import {getDb} from '../db';
import {ProviderState} from '../provider-state';
import {readTianApiConfig,TianApiClient} from './client';

/** Read at use time, so an absent Key never opens a provider connection or sends a request. */
export function getTianApiClient() {
 const config=readTianApiConfig();return config?new TianApiClient(new ProviderState(getDb()),config):undefined;
}
