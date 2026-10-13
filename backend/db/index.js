/**
 * Database connection + schema initialization.
 *
 * Local dev (default): SQLite file at backend/db/illustrator.sqlite, via
 * Node's built-in `node:sqlite` (DatabaseSync) — synchronous, zero-install.
 *
 * Production (optional): set DATABASE_URL to a Postgres connection string
 * and this file switches to a Postgres-backed implementation instead —
 * see docs/deployment.md "Postgres migration" for how to point a real
 * deployment at it. Every other backend file still calls the exact same
 * `db.prepare(sql).run/get/all(...)` shape either way; the only thing that
 * changed to make that true for Postgres is that those methods now return
 * Promises, which is why every call site elsewhere in the backend awaits
 * them — `await` on a plain (non-Postgres/SQLite) value just resolves
 * immediately, so this does not change SQLite's behavior at all.
 *
 * Why not a synchronous Postgres client instead (to avoid touching call
 * sites at all)? None exists for Node that's safe to put in front of real
 * traffic — Postgres communicates over a real socket, and synchronous
 * network I/O in Node means blocking the whole event loop or a fragile
 * native/thread hack. node:sqlite's DatabaseSync can be synchronous
 * because SQLite is in-process; Postgres can't be. So this is the honest
 * version of "the Postgres path," not a shortcut around it.
 */
'use strict';
const path = require('path');
const fs = require('fs');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'illustrator.sqlite');
const DATABASE_URL = process.env.DATABASE_URL || null;
const DRIVER = DATABASE_URL ? 'postgres' : 'sqlite';

let db, initSchema;

if(DRIVER === 'postgres'){
  // ---------------------------------------------------------------
  // POSTGRES
  // ---------------------------------------------------------------
  const { Pool } = require('pg');
  const { AsyncLocalStorage } = require('async_hooks');

  const pool = new Pool({ connectionString: DATABASE_URL });
  // Tracks the Postgres client checked out for the current in-flight
  // transaction (see db.transaction below), scoped per async call chain
  // so two requests transacting at the same time never share a connection.
  const txStorage = new AsyncLocalStorage();

  function currentQueryable(){
    return txStorage.getStore() || pool;
  }
  // SQLite uses "?" positional placeholders throughout the backend;
  // Postgres needs "$1", "$2", ... — every query string in this codebase
  // is translated automatically here so no call site needed to change.
  function toPgPlaceholders(sql){
    let i = 0;
    return sql.replace(/\?/g, () => `$${++i}`);
  }
  // SQLite's .run() hands back `lastInsertRowid` for an INSERT; Postgres
  // has no equivalent unless the statement says RETURNING. Every INSERT
  // in this codebase wants the new row's id back, so it's appended
  // automatically rather than requiring every call site to ask for it.
  function withReturningId(sql){
    const isInsert = /^\s*INSERT\s+INTO/i.test(sql);
    const alreadyHasReturning = /\breturning\b/i.test(sql);
    if(isInsert && !alreadyHasReturning) return sql.replace(/;?\s*$/, ' RETURNING id');
    return sql;
  }

  db = {
    prepare(sql){
      return {
        async run(...params){
          const pgSql = toPgPlaceholders(withReturningId(sql));
          const res = await currentQueryable().query(pgSql, params);
          return {
            lastInsertRowid: res.rows[0] ? res.rows[0].id : undefined,
            changes: res.rowCount
          };
        },
        async get(...params){
          const pgSql = toPgPlaceholders(sql);
          const res = await currentQueryable().query(pgSql, params);
          return res.rows[0];
        },
        async all(...params){
          const pgSql = toPgPlaceholders(sql);
          const res = await currentQueryable().query(pgSql, params);
          return res.rows;
        }
      };
    },
    // Multi-statement / no-param SQL (schema DDL, migrations). Postgres's
    // simple query protocol runs a whole ";"-separated batch in one call,
    // same as SQLite's db.exec().
    async exec(sql){
      await currentQueryable().query(sql);
    },
    // Runs `fn` as a single atomic Postgres transaction: every db call
    // made (directly or through functions it calls) while `fn` is running
    // is routed to the same checked-out connection via AsyncLocalStorage,
    // then committed together, or rolled back together if `fn` throws.
    // This replaces the old node:sqlite BEGIN/COMMIT/ROLLBACK pattern,
    // which doesn't work correctly against a Postgres connection pool —
    // pool.query() can hand different calls to different connections, so
    // naive BEGIN/COMMIT text wouldn't actually be atomic.
    async transaction(fn){
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await txStorage.run(client, fn);
        await client.query('COMMIT');
        return result;
      } catch(e){
        try { await client.query('ROLLBACK'); } catch(_){ /* connection may already be dead */ }
        throw e;
      } finally {
        client.release();
      }
    }
  };

  async function addColumnsIfMissingPg(table, wanted){
    const res = await pool.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name = $1`, [table]
    );
    const existingCols = new Set(res.rows.map(r => r.column_name));
    for(const [col, type] of wanted){
      if(!existingCols.has(col)){
        await pool.query(`ALTER TABLE ${table} ADD COLUMN ${col} ${type}`);
      }
    }
  }
  async function migratePg(){
    await addColumnsIfMissingPg('agents', [
      ['otp_code_hash', 'TEXT'],
      ['otp_expires_at', 'TEXT'],
      ['otp_attempts', 'INTEGER NOT NULL DEFAULT 0'],
      ['otp_last_sent_at', 'TEXT']
    ]);
    await addColumnsIfMissingPg('admin_users', [
      ['reset_token_hash', 'TEXT'],
      ['reset_token_expires_at', 'TEXT']
    ]);
    await addColumnsIfMissingPg('companies', [
      ['currency_code', "TEXT NOT NULL DEFAULT 'KES'"],
      ['locale', "TEXT NOT NULL DEFAULT 'en-KE'"]
    ]);
  }

  initSchema = async function(){
    const schema = fs.readFileSync(path.join(__dirname, 'schema.postgres.sql'), 'utf8');
    await db.exec(schema);
    await migratePg();
  };

} else {
  // ---------------------------------------------------------------
  // SQLITE (default — unchanged from before)
  // ---------------------------------------------------------------
  const { DatabaseSync } = require('node:sqlite');
  db = new DatabaseSync(DB_PATH);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');
  // Gives SQLite the same db.transaction(fn) interface Postgres has above,
  // so server.js can use one call-site shape regardless of driver. `fn` is
  // awaited so it may itself be async without changing SQLite's (fully
  // synchronous) semantics underneath.
  db.transaction = async function(fn){
    db.exec('BEGIN');
    try {
      const result = await fn();
      db.exec('COMMIT');
      return result;
    } catch(e){
      db.exec('ROLLBACK');
      throw e;
    }
  };

  initSchema = function(){
    const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
    db.exec(schema);
    migrateSqlite();
  };

  // CREATE TABLE IF NOT EXISTS never alters a table that already exists, so
  // a database created before a column was added needs an explicit ALTER
  // TABLE. Each entry here is idempotent (checked against the live column
  // list first) so this is safe to run on every startup, including a
  // brand-new database.
  function addColumnsIfMissingSqlite(table, wanted){
    const existingCols = new Set(db.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name));
    for(const [col, type] of wanted){
      if(!existingCols.has(col)){
        db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${type}`);
      }
    }
  }
  function migrateSqlite(){
    addColumnsIfMissingSqlite('agents', [
      ['otp_code_hash', 'TEXT'],
      ['otp_expires_at', 'TEXT'],
      ['otp_attempts', 'INTEGER NOT NULL DEFAULT 0'],
      ['otp_last_sent_at', 'TEXT']
    ]);
    addColumnsIfMissingSqlite('admin_users', [
      ['reset_token_hash', 'TEXT'],
      ['reset_token_expires_at', 'TEXT']
    ]);
    addColumnsIfMissingSqlite('companies', [
      ["currency_code", "TEXT NOT NULL DEFAULT 'KES'"],
      ["locale", "TEXT NOT NULL DEFAULT 'en-KE'"]
    ]);
  }
}

module.exports = { db, initSchema, DB_PATH, DRIVER };
