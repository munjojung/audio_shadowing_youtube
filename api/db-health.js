const { getPool } = require('../lib/db');

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const result = await getPool().query(
      'SELECT current_database() AS database_name, current_schema() AS schema_name'
    );

    return res.status(200).json({
      ok: true,
      database: result.rows[0].database_name,
      schema: result.rows[0].schema_name,
    });
  } catch (error) {
    console.error('Database connection check failed:', error.message);

    return res.status(503).json({
      ok: false,
      error: 'Database connection unavailable',
    });
  }
};
