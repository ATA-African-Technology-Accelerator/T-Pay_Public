import pg from 'pg';





export function createPool(connectionString: string): pg.Pool {
  const pool = new pg.Pool({ connectionString });
  pool.on('error', (error) => console.error('Idle database connection failed', error));
  return pool;
}

export async function isDatabaseReachable(pool: pg.Pool): Promise<boolean> {
  try {
    await pool.query('SELECT 1');
    return true;
  } catch (error) {
    console.error('Database health check failed', error);
    return false;
  }
}