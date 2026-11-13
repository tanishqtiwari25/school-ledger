import {sqliteTable,text,integer} from 'drizzle-orm/sqlite-core';
export const ledger = sqliteTable('ledger',{id:text('id').primaryKey(),version:integer('version').notNull(),data:text('data').notNull()});

export const backups=sqliteTable('backups',{id:text('id').primaryKey(),version:integer('version').notNull(),data:text('data').notNull(),created:text('created').notNull(),reason:text('reason').notNull()});
