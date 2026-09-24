const db = require('../config/db');
const { encrypt } = require('../service/cryptoHelper');

function sendEncrypted(res, payload) {
  return res.status(200).json({
    success: true,
    data: encrypt(payload)
  });
}

const ALIAS_MAP = {
  'gender': 'gender',
  'genders': 'gender',
  'id-types': 'govtIdType',
  'id_type': 'govtIdType',
  'idtype': 'govtIdType',
  'govtidtype': 'govtIdType',
  'blood-groups': 'bloodGroup',
  'bloodgroup': 'bloodGroup',
  'blood_group': 'bloodGroup',
  'dietary': 'dietaryPreference',
  'dietary-preference': 'dietaryPreference',
  'dietarypreference': 'dietaryPreference',
  'medical-conditions': 'trekMedicalConditions',
  'medicalconditions': 'trekMedicalConditions',
  'trekmedicalconditions': 'trekMedicalConditions',
  'medical_declarations': 'trekMedicalConditions',
  'cancellation-reasons': 'refundReason',
  'cancellationreasons': 'refundReason',
  'refund-reasons': 'refundReason',
  'refundreason': 'refundReason',
  'refund-channels': 'refundChannel',
  'refundchannels': 'refundChannel',
  'refundchannel': 'refundChannel',
  'trail-condition': 'trailCondition',
  'trailcondition': 'trailCondition',
  'trail-weather-severity': 'trailWeatherSeverity',
  'weather-severity': 'trailWeatherSeverity',
  'gear-categories': 'gearCategory',
  'gearcategory': 'gearCategory',
  'gear-condition': 'gearCondition',
  'gearcondition': 'gearCondition',
  'expense-category': 'expenseCategory',
  'expensecategory': 'expenseCategory',
  'payment-methods': 'paymentMethod',
  'paymentmethod': 'paymentMethod',
  'trek-difficulty': 'trekDifficulty',
  'trekdifficulty': 'trekDifficulty',
  'difficulty': 'trekDifficulty',
  'trek-category': 'trekCategory',
  'trekcategory': 'trekCategory',
  'trek-collection': 'trekCollection',
  'trekcollection': 'trekCollection',
  'trek-collections': 'trekCollection',
  'trek-addons': 'trekAddons',
  'trekaddons': 'trekAddons',
  'addons': 'trekAddons',
  'add-ons': 'trekAddons',
  'review-status': 'reviewStatus',
  'reviewstatus': 'reviewStatus',
};

/**
 * GET /api/auth/meta/dropdowns
 * Returns all active dropdown groups and their options in a single map
 */
async function getAllDropdowns(req, res) {
  try {
    const [rows] = await db.query(`
      SELECT 
        g.group_key,
        g.group_name,
        o.option_value AS value,
        o.option_label AS label,
        o.display_order
      FROM dropdown_groups g
      JOIN dropdown_options o ON o.group_id = g.id
      WHERE g.is_active = 1 AND o.is_active = 1
      ORDER BY g.group_key ASC, o.display_order ASC
    `).catch(() => [[]]);

    const result = {};
    for (const row of rows) {
      if (!result[row.group_key]) {
        result[row.group_key] = [];
      }
      result[row.group_key].push({
        value: row.value,
        label: row.label,
      });
    }

    return sendEncrypted(res, result);
  } catch (error) {
    console.error('Failed to get all dropdowns:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch dropdown options' });
  }
}

/**
 * GET /api/auth/meta/dropdowns/:type
 * Returns dynamic options for a specific type or group key
 */
async function getDropdownByType(req, res) {
  const rawType = String(req.params.type || '').trim().toLowerCase();
  const canonicalKey = ALIAS_MAP[rawType] || rawType;

  try {
    // 1. Try querying DB dropdown_groups & dropdown_options
    const [groupRows] = await db.query(
      `SELECT o.option_value AS value, o.option_label AS label
       FROM dropdown_groups g
       JOIN dropdown_options o ON o.group_id = g.id
       WHERE (LOWER(g.group_key) = ? OR LOWER(g.group_key) = ? OR LOWER(g.group_name) = ?)
         AND g.is_active = 1 AND o.is_active = 1
       ORDER BY o.display_order ASC`,
      [canonicalKey.toLowerCase(), rawType, rawType]
    ).catch(() => [[]]);

    if (groupRows.length > 0) {
      return sendEncrypted(res, {
        type: rawType,
        options: groupRows.map(r => ({ value: r.value, label: r.label }))
      });
    }

    // 2. Specialized fallbacks for blog-categories and dynamic treks tables
    if (rawType === 'blog-categories' || rawType === 'blog-category') {
      const [rows] = await db.query(
        `SELECT id, name, slug FROM categories ORDER BY name ASC`
      ).catch(() => [[]]);

      const options = rows.map((row) => ({
        value: row.slug || String(row.name).toLowerCase().replace(/\s+/g, '-'),
        label: row.name,
        id: row.id
      }));

      return sendEncrypted(res, { type: rawType, options });
    }

    if (rawType === 'trek-category' || rawType === 'trek-categories' || rawType === 'trek-collection' || rawType === 'trek-collections') {
      const [rows] = await db.query(
        `SELECT DISTINCT category FROM treks WHERE category IS NOT NULL AND category <> '' ORDER BY category ASC`
      ).catch(() => [[]]);

      const options = rows.map((row) => ({
        value: String(row.category),
        label: String(row.category)
      }));

      return sendEncrypted(res, { type: rawType, options });
    }

    if (rawType === 'trek-difficulty' || rawType === 'difficulty' || rawType === 'trek-difficulties') {
      const [rows] = await db.query(
        `SELECT DISTINCT difficulty FROM treks WHERE difficulty IS NOT NULL AND difficulty <> '' ORDER BY difficulty ASC`
      ).catch(() => [[]]);

      const options = rows.map((row) => ({
        value: String(row.difficulty).toLowerCase(),
        label: String(row.difficulty)
      }));

      return sendEncrypted(res, { type: rawType, options });
    }

    // 3. If nothing found in DB, return empty options list
    return sendEncrypted(res, {
      type: rawType,
      options: []
    });

  } catch (error) {
    console.error('Dropdown meta error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch dropdown options'
    });
  }
}

/**
 * GET /api/auth/meta/gear-rentals
 * Returns available gear items for rental during checkout
 */
async function getGearRentals(req, res) {
  try {
    const [rows] = await db.query(`
      SELECT 
        id,
        item_name AS name,
        category,
        rental_rate_per_day AS price,
        (total_quantity - rented_quantity) AS availableSlots,
        total_quantity,
        item_condition AS condition_status,
        status
      FROM gear_inventory
      WHERE status = 'active' AND (total_quantity - rented_quantity) > 0
      ORDER BY category ASC, item_name ASC
    `).catch(() => [[]]);

    if (rows && rows.length > 0) {
      return res.status(200).json({
        success: true,
        data: rows
      });
    }

    // Fallback to dropdown_options for trekAddons if gear_inventory is empty
    const [dropdownRows] = await db.query(`
      SELECT 
        o.id,
        o.label AS name,
        g.label AS category,
        CAST(COALESCE(NULLIF(REGEXP_SUBSTR(o.option_value, '[0-9]+'), ''), '150') AS UNSIGNED) AS price,
        50 AS availableSlots,
        50 AS total_quantity,
        'Good Condition' AS condition_status,
        'active' AS status
      FROM dropdown_options o
      JOIN dropdown_groups g ON g.id = o.group_id
      WHERE (g.group_key = 'trekAddons' OR g.group_key = 'gearCategory')
        AND o.status = 'active'
      ORDER BY o.sort_order ASC
    `).catch(() => [[]]);

    return res.status(200).json({
      success: true,
      data: dropdownRows || []
    });
  } catch (error) {
    console.error('Gear rentals meta error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch gear rentals' });
  }
}

/**
 * GET /api/auth/meta/trail-advisories
 * Returns the latest trail condition and weather alerts
 */
async function getTrailAdvisories(req, res) {
  try {
    const [rows] = await db.query(`
      SELECT 
        id,
        title,
        message,
        type,
        created_at
      FROM notifications
      WHERE type IN ('weather', 'trek')
      ORDER BY created_at DESC
      LIMIT 10
    `).catch(() => [[]]);

    return res.status(200).json({
      success: true,
      data: rows
    });
  } catch (error) {
    console.error('Trail advisories meta error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch trail advisories' });
  }
}

/**
 * GET /api/auth/meta/site-settings
 * Returns dynamic brand, contact, and company settings from database
 */
async function getSiteSettings(req, res) {
  try {
    const [rows] = await db.query('SELECT setting_key, setting_value FROM settings');
    const map = {};
    for (const r of (rows || [])) {
      map[r.setting_key] = r.setting_value;
    }

    const brandName = map.brand_name || 'goWILD Karunadu';
    const brandSubtitle = map.brand_subtitle || 'ಕರುನಾಡು';
    const brandTagline = map.brand_tagline || 'Wilderness Expeditions & Western Ghats Trails';
    const supportPhone = map.support_phone || '+91 98765 43210';
    const supportPhoneRaw = map.support_phone_raw || supportPhone.replace(/[^0-9+]/g, '');
    const whatsappNumber = map.whatsapp_number || '+91 98765 43210';
    const whatsappNumberRaw = map.whatsapp_number_raw || whatsappNumber.replace(/[^0-9]/g, '');
    const supportEmail = map.support_email || 'info@gowildkarunadu.com';
    const contactLocation = map.contact_location || 'Bengaluru, Karnataka';
    const legalName = map.legal_name || 'goWILD Karunadu Eco-Adventures Pvt Ltd';
    const gstin = map.gstin || '29AAGCW9123K1Z8';
    const address = map.address || 'Forest Trailway Plaza, Indiranagar, Bengaluru, Karnataka 560038';
    const socialFacebook = map.social_facebook || 'https://facebook.com/gowildkarunadu';
    const socialInstagram = map.social_instagram || 'https://instagram.com/gowildkarunadu';
    const socialYoutube = map.social_youtube || 'https://youtube.com/@gowildkarunadu';
    const aboutText = map.about_text || "Karnataka's leading trekking and adventure travel company.";

    return res.status(200).json({
      success: true,
      data: {
        brandName,
        brandSubtitle,
        brandTagline,
        supportPhone,
        supportPhoneRaw,
        whatsappNumber,
        whatsappNumberRaw,
        supportEmail,
        contactLocation,
        legalName,
        gstin,
        address,
        socialFacebook,
        socialInstagram,
        socialYoutube,
        aboutText,
        telLink: `tel:${supportPhoneRaw}`,
        mailLink: `mailto:${supportEmail}`,
        whatsappLink: `https://wa.me/${whatsappNumberRaw}`
      }
    });
  } catch (error) {
    console.error('Site settings meta error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch site settings' });
  }
}

module.exports = {
  getAllDropdowns,
  getDropdownByType,
  getGearRentals,
  getTrailAdvisories,
  getSiteSettings,
};

