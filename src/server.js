const app = require('./app');
const { initializeDatabase } = require('./config/database');
const port = Number(process.env.PORT || 3000);
initializeDatabase();
app.listen(port, '0.0.0.0', () => {
  console.log(`IT HelpDesk працює: http://localhost:${port}`);
});
