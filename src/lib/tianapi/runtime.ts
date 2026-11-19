import {ProviderState} from '../provider-state';
import {readTianApiConfig,TianApiClient} from './client';

/** Read at use time, so an absent Key never opens a provider connection or sends a request. */
export async function getTianApiClient() {
 const config=readTianApiConfig();if(!config)return undefined;
 const {getDb}=await import('../db');return new TianApiClient(new ProviderState(getDb()),config);
}
