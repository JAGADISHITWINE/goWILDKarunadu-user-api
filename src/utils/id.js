const crypto = require('crypto');

function createUuid() {
  return crypto.randomUUID();
}

module.exports = {
  createUuid,
};
