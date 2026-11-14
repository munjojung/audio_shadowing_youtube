const { Pool } = require('pg');

let pool;

function getPool() {
  if (!pool) {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is not configured');
    }

    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 3,
      connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 30000,
    });
  }

  return pool;
}

module.exports = { getPool };
