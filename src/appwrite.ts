import { Client, Databases, Storage, Account } from 'appwrite';

export const client = new Client();

client
  .setEndpoint('https://sgp.cloud.appwrite.io/v1')
  .setProject('6abd0047000a70782c14');

export const databases = new Databases(client);
export const storage = new Storage(client);
export const account = new Account(client);

export const DB_ID = '6abd0103001c6c5b7969';
export const MESSAGES_COLLECTION_ID = '6abd0163003b4a8a779a';
export const STORAGE_BUCKET_ID = '6abd18030025bc03124f'; // ←ここにコピーした英数字IDを貼り付け
