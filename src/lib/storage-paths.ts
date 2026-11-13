import path from 'node:path';
export const dataDir=process.env.WCCAT_DATA_DIR?path.resolve(/* turbopackIgnore: true */process.env.WCCAT_DATA_DIR):path.join(process.cwd(),'data');
export const dbPath=path.join(dataDir,'wccat.sqlite');
export const exportsDir=path.join(dataDir,'admin-exports');
export const archivesDir=path.join(dataDir,'archives');

