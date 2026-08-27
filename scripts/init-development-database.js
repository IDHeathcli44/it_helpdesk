process.env.HELPDESK_ENV = 'development';

const {
  db,
  dbPath,
  initializeDatabase
} = require('../src/config/database');
const { seedDevelopmentData } = require('../src/config/developmentSeed');

try {
  initializeDatabase();
  const summary = seedDevelopmentData();

  console.log(`Development database ready: ${dbPath}`);
  console.log(JSON.stringify(summary));
} finally {
  if (db.isOpen) db.close();
}
