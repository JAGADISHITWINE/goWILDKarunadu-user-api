const db = require("../config/db");

async function ensureCouponSchema() {
  // Schema is verified and managed by centralized migration runner (006-create-trek-coupons.sql)
  return;
}

module.exports = {
  ensureCouponSchema,
};
