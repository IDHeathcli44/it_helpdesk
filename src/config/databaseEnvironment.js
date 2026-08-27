const path = require('node:path');

const projectRoot = path.resolve(__dirname, '../..');
const dataDirectory = path.join(projectRoot, 'data');
const defaultDbPath = path.join(dataDirectory, 'helpdesk.db');
const developmentDbPath = path.join(dataDirectory, 'helpdesk-dev.db');
const allowedEnvironments = new Set(['default', 'development', 'test']);

function pathsEqual(left, right) {
  const normalize = (value) => {
    const resolved = path.resolve(value);
    return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
  };

  return normalize(left) === normalize(right);
}

function resolveDatabaseEnvironment(environmentVariables = process.env) {
  const environment = String(
    environmentVariables.HELPDESK_ENV || 'default'
  ).trim().toLowerCase();

  if (!allowedEnvironments.has(environment)) {
    throw new Error(
      `Unsupported HELPDESK_ENV "${environment}". ` +
      'Use default, development or test.'
    );
  }

  const configuredPath = String(
    environmentVariables.HELPDESK_DB_PATH || ''
  ).trim();

  if (environment === 'test' && !configuredPath) {
    throw new Error(
      'Test mode requires an explicit temporary HELPDESK_DB_PATH.'
    );
  }

  const dbPath = path.resolve(
    configuredPath || (
      environment === 'development' ? developmentDbPath : defaultDbPath
    )
  );

  if (environment === 'development' && !pathsEqual(dbPath, developmentDbPath)) {
    throw new Error(
      'Development mode may only use data/helpdesk-dev.db.'
    );
  }

  if (
    environment === 'test' &&
    (pathsEqual(dbPath, defaultDbPath) || pathsEqual(dbPath, developmentDbPath))
  ) {
    throw new Error(
      'Test mode cannot use the default or development database.'
    );
  }

  return Object.freeze({
    environment,
    dbPath,
    defaultDbPath,
    developmentDbPath
  });
}

module.exports = {
  defaultDbPath,
  developmentDbPath,
  pathsEqual,
  resolveDatabaseEnvironment
};
