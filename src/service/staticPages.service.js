const db = require('../config/db');
const { createUuid } = require('../utils/id');

function buildPointListContent(title, points, { ordered = false } = {}) {
  const tag = ordered ? 'ol' : 'ul';
  const items = points
    .map((point) => {
      const body = String(point.body || '')
        .replace(/<\/?p[^>]*>/gi, '')
        .trim()
        .split(/\n+/)
        .map((line) => line.trim())
        .filter(Boolean)
        .join('<br>');

      return `<li><strong>${escapeHtml(point.title)}</strong><br>${body}</li>`;
    })
    .join('');

  return `<h2>${escapeHtml(title)}</h2><${tag}>${items}</${tag}>`;
}

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const FAQ_POINTS = [
  {
    title: 'What is included in the trek package?',
    body: 'The package usually includes transportation, if mentioned, trek leader, permits, basic first aid, accommodation for overnight treks, meals as per itinerary, and guided trekking support. Personal expenses and anything not specifically mentioned are excluded.',
  },
  {
    title: 'Is the trek suitable for beginners?',
    body: 'Yes. Beginner-friendly treks are designed for people with basic fitness levels. However, participants should be able to walk 5 to 8 km comfortably and climb moderate inclines.',
  },
  {
    title: 'What is the minimum age requirement?',
    body: 'Most treks allow participants aged 10 years and above. Children below 18 years should be accompanied by a parent or guardian unless otherwise specified.',
  },
  {
    title: 'What should I carry for the trek?',
    body: 'Carry a backpack, water bottle, trekking shoes, raincoat or poncho, flashlight, personal medicines, snacks, power bank, extra clothes, and a valid ID proof.',
  },
  {
    title: 'Do I need previous trekking experience?',
    body: 'No. Most easy and moderate treks do not require prior experience. Experienced trek leaders will guide you throughout the journey.',
  },
  {
    title: 'Are meals provided during the trip?',
    body: 'Meals mentioned in the itinerary are included. Special dietary requirements should be informed in advance and are subject to availability.',
  },
  {
    title: 'What type of accommodation is provided?',
    body: 'Accommodation may include tents, homestays, hostels, hotels, or resorts depending on the package. Rooms may be on a sharing basis unless private accommodation is booked.',
  },
  {
    title: 'Is transportation included?',
    body: 'Transportation is included only if specified in the package details. Pickup and drop locations and timings will be shared before departure.',
  },
  {
    title: 'What if it rains during the trek?',
    body: 'Treks usually continue in light to moderate rain with necessary safety precautions. In case of severe weather conditions, the trek may be postponed, rerouted, or cancelled for participant safety.',
  },
  {
    title: 'Can I cancel my booking?',
    body: 'Yes. Cancellation is allowed according to the cancellation policy. Refund amounts depend on how many days before departure the cancellation is made.',
  },
  {
    title: 'Will I get a refund if the trek is cancelled?',
    body: 'If the organizer cancels the trek due to weather, government restrictions, or safety concerns, participants will receive a refund or the option to reschedule as per the policy.',
  },
  {
    title: 'Are trekking permits included in the price?',
    body: 'Yes. All mandatory forest permits and entry fees mentioned in the itinerary are generally included in the package cost.',
  },
  {
    title: 'Is mobile network available during the trek?',
    body: 'Mobile connectivity may be limited or unavailable in remote areas. Inform your family beforehand and enjoy a digital detox.',
  },
  {
    title: 'Are washroom facilities available?',
    body: 'Washrooms are available at the base camp or accommodation. During the trek, basic or natural facilities may be the only option.',
  },
  {
    title: 'Is it safe for solo travelers?',
    body: 'Yes. Solo travelers are welcome and are grouped with other participants. Certified trek leaders ensure a safe and friendly environment.',
  },
  {
    title: 'Can I join the trek alone?',
    body: 'Absolutely. Many participants join solo and make new friends during the trip.',
  },
  {
    title: 'What fitness level is required?',
    body: 'Participants should have basic stamina to walk for several hours, climb slopes, and carry a light backpack. Regular walking or jogging before the trek is recommended.',
  },
  {
    title: 'What should I wear for the trek?',
    body: 'Wear comfortable quick-dry clothing, trekking shoes with good grip, a cap, sunglasses, and carry a jacket for cooler temperatures.',
  },
  {
    title: 'Are trekking shoes mandatory?',
    body: 'Yes. Proper trekking shoes with good ankle support and grip are strongly recommended for safety and comfort.',
  },
  {
    title: 'Can I bring my own camping gear?',
    body: 'Yes, but please inform the organizer in advance. Personal gear should meet safety standards and be suitable for the trek.',
  },
  {
    title: 'Is drinking water available?',
    body: 'Drinking water is available at designated points. Participants should carry at least 2 liters of water and refill whenever possible.',
  },
  {
    title: 'Are pets allowed on treks?',
    body: 'Pets are generally not allowed due to safety concerns, forest regulations, and the physical demands of trekking.',
  },
  {
    title: 'What happens in case of a medical emergency?',
    body: 'Trek leaders carry first aid kits and provide basic assistance. For serious emergencies, the participant will be evacuated to the nearest medical facility whenever possible.',
  },
  {
    title: 'Can I bring luggage?',
    body: 'It is recommended to carry only essential items in a backpack. Large suitcases or excessive luggage are not advised.',
  },
  {
    title: 'Are there any hidden charges?',
    body: 'No. The package price covers everything listed in the inclusions. Personal expenses, optional activities, and items listed under exclusions are charged separately.',
  },
  {
    title: 'Can I customize a private tour or trek?',
    body: 'Yes. Private groups, corporate outings, school trips, and family tours can be customized based on group size, budget, and preferences.',
  },
  {
    title: 'Do you organize weekend treks?',
    body: 'Yes. Weekend treks, one-day hikes, camping trips, and multi-day expeditions are organized throughout the year.',
  },
  {
    title: 'Is travel insurance included?',
    body: 'Travel insurance is not included unless specifically mentioned in the package. Participants are encouraged to purchase personal travel insurance.',
  },
  {
    title: 'What payment methods are accepted?',
    body: 'Payments can typically be made through UPI, debit or credit cards, net banking, and bank transfers. Booking is confirmed only after successful payment.',
  },
  {
    title: 'How will I receive trip details after booking?',
    body: 'After booking confirmation, participants receive a confirmation email or WhatsApp message containing the itinerary, pickup details, packing list, emergency contacts, and reporting instructions.',
  },
];

const CANCELLATION_POINTS = [
  {
    title: 'Cancellation by Customer',
    body: 'Cancellations must be requested through the official support team or booking channel used for the reservation. The date and time of the request will be used to calculate any applicable refund.',
  },
  {
    title: 'Refund Eligibility',
    body: 'Refunds depend on how close the request is to the departure date and the commitments already made, including permits, transport, accommodation, and guide arrangements. The final refund amount is calculated from the total booking value after applicable deductions.',
  },
  {
    title: 'Late Cancellation and No-Show',
    body: 'Cancellations made close to the trek date, late arrivals, or failure to report at the scheduled time are treated as no-show cases and are generally non-refundable because arrangements will already be in place.',
  },
  {
    title: 'Organizer Cancellation',
    body: 'If we cancel an event due to weather, safety concerns, government restrictions, insufficient participants, or other operational reasons, you will receive a full refund or, where available, the option to reschedule to another date.',
  },
  {
    title: 'Refund Processing',
    body: 'Approved refunds are processed to the original payment method within 7 to 10 working days. Bank, card network, or payment gateway timelines may vary and are outside our control.',
  },
  {
    title: 'Rescheduling',
    body: 'Rescheduling may be allowed only if requested before the departure cutoff mentioned for the trek and only when seats, permits, and operational arrangements are still available. Rescheduling is generally allowed once per booking and any fare difference, transfer fee, or permit charge on the new date must be paid by the customer. If the request is made after the cutoff or if the trek is already fully arranged, the booking will be treated under the normal cancellation policy.',
  },
];

const TERMS_POINTS = [
  {
    title: 'Acceptance of Terms',
    body: 'By accessing or using our services, you agree to follow these Terms and Conditions and any updates published by us from time to time.',
  },
  {
    title: 'Booking Information',
    body: 'You must provide accurate booking details, emergency contact information, and any health or travel information requested at the time of reservation. Incorrect information may affect your participation or safety.',
  },
  {
    title: 'Participant Responsibilities',
    body: 'Participants must follow all instructions given by the trek leader, respect local rules and regulations, and maintain responsible conduct throughout the trip. Unsafe behavior, intoxication, or misuse of the service may lead to removal without refund.',
  },
  {
    title: 'Fitness and Health',
    body: 'You are responsible for ensuring that you are medically and physically fit for the chosen trek. If you have any medical condition, injury, or mobility concern, inform the organizer before booking and before departure.',
  },
  {
    title: 'Payments and Fees',
    body: 'All prices and charges are shown at the time of booking. Payments must be completed through approved payment methods, and any applicable taxes, convenience charges, or gateway fees will be displayed before confirmation.',
  },
  {
    title: 'Cancellations and Refunds',
    body: 'Cancellations and refunds are governed by the published cancellation policy. Refund eligibility and timing depend on the notice period and the non-recoverable costs already incurred for your booking.',
  },
  {
    title: 'Itinerary Changes',
    body: 'We may change the itinerary, route, timings, inclusions, or accommodation due to weather, safety, operational, or regulatory reasons. Such changes are made to protect participants and keep the trip running as safely as possible.',
  },
  {
    title: 'Liability and Personal Belongings',
    body: 'We are not responsible for personal belongings lost, damaged, or stolen during the trip. Participants should keep valuables secure and travel with only essential items.',
  },
  {
    title: 'Photography and Media',
    body: 'Photos or videos taken during the trip may be used for promotional purposes unless you request otherwise in writing before the trip begins.',
  },
  {
    title: 'Updates to Terms',
    body: 'We may revise these terms when required. Any updated version will be published on the website and will take effect from the date mentioned in the revised document.',
  },
];

const DEFAULT_ABOUT_DATA = {
  hero: {
    year: '2011',
    badge: 'Our Story',
    title: "Exploring Karnataka's Wilderness Since 2011",
    subtitle: 'Your trusted partner for adventure and exploration in the Western Ghats',
  },
  story: {
    sectionNumber: '01',
    tag: 'Our Story',
    heading: 'Born from a love of wild places',
    paragraph1: "goWILDKarunadu was born out of a passion for the Western Ghats and a desire to share its beauty with fellow adventurers. What started as weekend treks with friends has grown into one of Karnataka's most trusted trekking organisations.",
    quote: "We've introduced thousands of people to the majestic peaks, dense forests, and hidden waterfalls of Karnataka.",
    paragraph2: 'Our mission remains simple: to create safe, memorable, and responsible trekking experiences while preserving the natural beauty that makes these adventures possible.',
  },
  stats: [
    { key: 'trekkers', number: '10,000+', label: 'Happy Trekkers' },
    { key: 'routes', number: '50+', label: 'Trek Routes' },
    { key: 'experience', number: '15', label: 'Years Experience' },
    { key: 'rating', number: '4.8', label: 'Average Rating' },
  ],
  values: [
    {
      icon: 'shield-checkmark',
      title: 'Safety First',
      description: 'All our treks are led by certified guides with comprehensive safety protocols',
    },
    {
      icon: 'leaf',
      title: 'Eco-Friendly',
      description: 'We practice and promote responsible trekking with minimal environmental impact',
    },
    {
      icon: 'people',
      title: 'Community',
      description: 'Building a community of adventure enthusiasts who respect nature',
    },
    {
      icon: 'star',
      title: 'Excellence',
      description: 'Committed to providing exceptional experiences on every trek',
    },
  ],
  team: [
    {
      name: 'Rajesh Kumar',
      role: 'Founder & Lead Trek Leader',
      image: 'https://ui-avatars.com/api/?name=Rajesh+Kumar&size=200',
      bio: '15+ years of trekking experience in the Western Ghats',
      suffix: 'Founder & Lead Trek Leader',
    },
    {
      name: 'Priya Sharma',
      role: 'Operations Manager',
      image: 'https://ui-avatars.com/api/?name=Priya+Sharma&size=200',
      bio: 'Expert in trek logistics and safety protocols',
      suffix: 'Operations Manager',
    },
    {
      name: 'Arjun Menon',
      role: 'Senior Trek Guide',
      image: 'https://ui-avatars.com/api/?name=Arjun+Menon&size=200',
      bio: 'Certified wilderness first responder and mountaineer',
      suffix: 'Senior Trek Guide',
    },
    {
      name: 'Meera Reddy',
      role: 'Trek Guide & Naturalist',
      image: 'https://ui-avatars.com/api/?name=Meera+Reddy&size=200',
      bio: 'Wildlife enthusiast with deep knowledge of Western Ghats flora & fauna',
      suffix: 'Trek Guide & Naturalist',
    },
  ],
  safetyItems: [
    {
      icon: 'shield-checkmark',
      title: 'Certified Guides',
      description: 'All treks led by certified guides with wilderness first aid training',
    },
    {
      icon: 'medkit',
      title: 'Safety Briefings',
      description: 'Comprehensive safety briefings before each trek',
    },
    {
      icon: 'call',
      title: 'Emergency Communication',
      description: 'Emergency communication devices on all treks',
    },
    {
      icon: 'cloudy-night',
      title: 'Weather Monitoring',
      description: 'Strict adherence to weather and trail conditions',
    },
  ],
};

const DEFAULT_STATIC_PAGES = [
  {
    pageKey: 'faqs',
    title: 'FAQ\'s',
    sortOrder: 1,
    content: buildPointListContent('FAQ\'s', FAQ_POINTS),
  },
  {
    pageKey: 'cancelation',
    title: 'Cancelation',
    sortOrder: 2,
    content: buildPointListContent('Cancellation Policy', CANCELLATION_POINTS),
  },
  {
    pageKey: 'terms-and-condition',
    title: 'Terms and Condition',
    sortOrder: 3,
    content: buildPointListContent('Terms and Conditions', TERMS_POINTS),
  },
  {
    pageKey: 'about-us',
    title: 'About Us',
    sortOrder: 4,
    content: JSON.stringify(DEFAULT_ABOUT_DATA),
  },
];

const LEGACY_DEFAULT_CONTENT = new Map([
  [
    'faqs',
    '<h2>FAQ\'s</h2><p>Add the most common customer questions and answers here.</p>',
  ],
  [
    'cancelation',
    '<h2>Cancellation Policy</h2><ul><li><strong>Cancellation by Customer</strong><br>Cancellations must be requested through the official support team or booking channel used for the reservation. The date and time of the request will be used to calculate any applicable refund.</li><li><strong>Refund Eligibility</strong><br>Refunds depend on how close the request is to the departure date and the commitments already made, including permits, transport, accommodation, and guide arrangements. The final refund amount is calculated from the total booking value after applicable deductions.</li><li><strong>Late Cancellation and No-Show</strong><br>Cancellations made close to the trek date, late arrivals, or failure to report at the scheduled time are treated as no-show cases and are generally non-refundable because arrangements will already be in place.</li><li><strong>Organizer Cancellation</strong><br>If we cancel an event due to weather, safety concerns, government restrictions, insufficient participants, or other operational reasons, you will receive a full refund or, where available, the option to reschedule to another date.</li><li><strong>Refund Processing</strong><br>Approved refunds are processed to the original payment method within 7 to 10 working days. Bank, card network, or payment gateway timelines may vary and are outside our control.</li><li><strong>Rescheduling</strong><br>Rescheduling may be allowed only if requested before the departure cutoff mentioned for the trek and only when seats, permits, and operational arrangements are still available. Rescheduling is generally allowed once per booking and any fare difference, transfer fee, or permit charge on the new date must be paid by the customer. If the request is made after the cutoff or if the trek is already fully arranged, the booking will be treated under the normal cancellation policy.</li></ul>',
  ],
  [
    'terms-and-condition',
    '<h2>Terms and Conditions</h2><p>Add your usage terms, legal notes, and customer obligations here.</p>',
  ],
]);

const DEFAULT_PAGE_MAP = new Map(DEFAULT_STATIC_PAGES.map((page) => [page.pageKey, page]));
const ALLOWED_PAGE_KEYS = new Set(DEFAULT_STATIC_PAGES.map((page) => page.pageKey));
const PAGE_KEY_ALIASES = new Map([
  ['about', 'about-us'],
  ['about-us', 'about-us'],
  ['faq', 'faqs'],
  ['faqs', 'faqs'],
  ['cancellation', 'cancelation'],
  ['cancelation', 'cancelation'],
  ['cancellation-policy', 'cancelation'],
  ['terms-and-condition', 'terms-and-condition'],
  ['terms-and-conditions', 'terms-and-condition'],
]);

let schemaReady = false;

function normalizePageKey(value = '') {
  const normalized = String(value).trim().toLowerCase();
  return PAGE_KEY_ALIASES.get(normalized) || normalized;
}

function normalizeStatus(value) {
  return String(value || '').trim().toLowerCase() === 'inactive' ? 'inactive' : 'active';
}

function normalizeText(value) {
  const trimmed = String(value || '').trim();
  return trimmed || null;
}

function normalizeStaticPageContent(content = '') {
  return String(content || '')
    .replace(/<\/?p[^>]*>/gi, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function mapPageRow(row) {
  if (!row) return null;

  return {
    id: row.id,
    pageKey: row.page_key,
    title: row.title,
    content: row.content,
    status: row.status,
    sortOrder: Number(row.sort_order || 0),
    updatedBy: row.updated_by
      ? {
          id: row.updated_by,
          name: row.updated_by_name || null,
          email: row.updated_by_email || null,
        }
      : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function getLiveAboutStats() {
  const currentYear = new Date().getFullYear();
  const yearsExp = Math.max(1, currentYear - 2011);

  let activeTreksCount = '50+';
  let trekkersCount = '10,000+';
  let avgRating = '4.8';

  try {
    const [[trekRow]] = await db.query('SELECT COUNT(id) AS count FROM treks');
    if (trekRow && trekRow.count > 0) {
      activeTreksCount = trekRow.count >= 10 ? `${trekRow.count}+` : `${trekRow.count}`;
    }
  } catch (e) {
    // fallback
  }

  try {
    const [[bookingRow]] = await db.query(
      "SELECT COUNT(id) AS total_bookings, COALESCE(SUM(seats_booked), 0) AS total_seats FROM bookings WHERE payment_status = 'paid'"
    );
    if (bookingRow) {
      const seats = Number(bookingRow.total_seats) || Number(bookingRow.total_bookings) || 0;
      if (seats > 0) {
        trekkersCount = seats >= 1000 ? `${(Math.floor(seats / 100) * 100).toLocaleString()}+` : `${seats}+`;
      }
    }
  } catch (e) {
    // fallback
  }

  try {
    const [[ratingRow]] = await db.query(
      "SELECT ROUND(AVG(rating), 1) AS avg_rate FROM trek_ratings WHERE status = 'approved' OR status IS NULL"
    );
    if (ratingRow && ratingRow.avg_rate && Number(ratingRow.avg_rate) > 0) {
      avgRating = `${Number(ratingRow.avg_rate).toFixed(1)}`;
    }
  } catch (e) {
    // fallback
  }

  return [
    { key: 'trekkers', number: trekkersCount, label: 'Happy Trekkers' },
    { key: 'routes', number: activeTreksCount, label: 'Trek Routes' },
    { key: 'experience', number: `${yearsExp}`, label: 'Years Experience' },
    { key: 'rating', number: avgRating, label: 'Average Rating' },
  ];
}

async function ensureStaticPagesSchema() {
  if (schemaReady) return;

  await db.query(`
    CREATE TABLE IF NOT EXISTS static_pages (
      id CHAR(36) NOT NULL PRIMARY KEY,
      page_key VARCHAR(80) NOT NULL UNIQUE,
      title VARCHAR(191) NOT NULL,
      content LONGTEXT NOT NULL,
      status ENUM('active','inactive') NOT NULL DEFAULT 'active',
      sort_order INT NOT NULL DEFAULT 0,
      updated_by CHAR(36) NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      KEY idx_static_pages_status_sort (status, sort_order),
      KEY idx_static_pages_page_key (page_key)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  for (const page of DEFAULT_STATIC_PAGES) {
    const [rows] = await db.query(
      'SELECT id FROM static_pages WHERE page_key = ? LIMIT 1',
      [page.pageKey]
    );

    if (!rows.length) {
      await db.query(
        `INSERT INTO static_pages
          (id, page_key, title, content, status, sort_order)
         VALUES (?, ?, ?, ?, 'active', ?)`,
        [
          createUuid(),
          page.pageKey,
          page.title,
          page.content,
          page.sortOrder,
        ]
      );
    }
  }

  for (const page of DEFAULT_STATIC_PAGES) {
    const legacyContent = LEGACY_DEFAULT_CONTENT.get(page.pageKey);
    if (!legacyContent) continue;

    const [existingRows] = await db.query(
      'SELECT id, content FROM static_pages WHERE page_key = ? LIMIT 1',
      [page.pageKey]
    );

    const existing = existingRows[0];
    if (!existing) continue;

    const currentContent = String(existing.content || '').trim();
    const legacyNormalized = String(legacyContent || '').trim();
    if (!currentContent || currentContent === legacyNormalized) {
      await db.query(
        'UPDATE static_pages SET content = ?, title = ?, sort_order = ? WHERE id = ?',
        [page.content, page.title, page.sortOrder, existing.id]
      );
    }
  }

  const [normalizedRows] = await db.query(
    'SELECT id, page_key, content FROM static_pages WHERE page_key IN (?)',
    [Array.from(ALLOWED_PAGE_KEYS)]
  );

  for (const row of normalizedRows) {
    if (row.page_key === 'about-us') continue;
    const normalizedContent = normalizeStaticPageContent(row.content);
    if (normalizedContent !== String(row.content || '').trim()) {
      await db.query(
        'UPDATE static_pages SET content = ? WHERE id = ?',
        [normalizedContent, row.id]
      );
    }
  }

  schemaReady = true;
}

async function listStaticPages({ includeInactive = true } = {}) {
  await ensureStaticPagesSchema();

  const whereClause = includeInactive ? '' : "WHERE status = 'active'";
  const [rows] = await db.query(
    `SELECT sp.*, a.name AS updated_by_name, a.email AS updated_by_email
     FROM static_pages sp
     LEFT JOIN admins a ON a.id COLLATE utf8mb4_unicode_ci = sp.updated_by
     ${whereClause}
     ORDER BY sp.sort_order ASC, sp.title ASC`
  );

  return rows.map(mapPageRow);
}

async function getStaticPageByKey(pageKey, { includeInactive = true } = {}) {
  await ensureStaticPagesSchema();

  const normalizedKey = normalizePageKey(pageKey);
  if (!normalizedKey) return null;

  const [rows] = await db.query(
    `SELECT sp.*, a.name AS updated_by_name, a.email AS updated_by_email
     FROM static_pages sp
     LEFT JOIN admins a ON a.id COLLATE utf8mb4_unicode_ci = sp.updated_by
     WHERE sp.page_key = ?
       ${includeInactive ? '' : "AND sp.status = 'active'"}
     LIMIT 1`,
    [normalizedKey]
  );

  const mapped = mapPageRow(rows[0]);
  if (!mapped) return null;

  if (normalizedKey === 'about-us') {
    let parsed = null;
    try {
      parsed = JSON.parse(mapped.content);
    } catch {
      parsed = null;
    }

    const liveStats = await getLiveAboutStats();
    const aboutData = {
      hero: parsed?.hero || DEFAULT_ABOUT_DATA.hero,
      story: parsed?.story || DEFAULT_ABOUT_DATA.story,
      stats: liveStats || parsed?.stats || DEFAULT_ABOUT_DATA.stats,
      values: parsed?.values?.length ? parsed.values : DEFAULT_ABOUT_DATA.values,
      team: parsed?.team?.length ? parsed.team : DEFAULT_ABOUT_DATA.team,
      safetyItems: parsed?.safetyItems?.length ? parsed.safetyItems : DEFAULT_ABOUT_DATA.safetyItems,
    };

    mapped.aboutData = aboutData;
  }

  return mapped;
}

async function updateStaticPage(pageKey, payload = {}, adminId = null) {
  await ensureStaticPagesSchema();

  const normalizedKey = normalizePageKey(pageKey);
  if (!normalizedKey || !ALLOWED_PAGE_KEYS.has(normalizedKey)) {
    throw new Error('INVALID_PAGE_KEY');
  }

  const existing = await getStaticPageByKey(normalizedKey, { includeInactive: true });
  const fallback = DEFAULT_PAGE_MAP.get(normalizedKey) || {};

  const finalTitle = payload.title !== undefined
    ? normalizeText(payload.title)
    : existing?.title || fallback.title || null;
  let finalContent;
  if (normalizedKey === 'about-us' && (payload.aboutData || (typeof payload.content === 'object' && payload.content !== null))) {
    finalContent = JSON.stringify(payload.aboutData || payload.content);
  } else if (normalizedPoints) {
    finalContent = buildPointListContent(
      finalTitle || fallback.title || existing?.title || '',
      normalizedPoints,
      { ordered: false }
    );
  } else if (payload.content !== undefined) {
    finalContent = typeof payload.content === 'object' ? JSON.stringify(payload.content) : normalizeText(payload.content);
  } else {
    finalContent = existing?.content || fallback.content || null;
  }

  const finalStatus = payload.status !== undefined
    ? normalizeStatus(payload.status)
    : existing?.status || 'active';

  if (!finalTitle) {
    throw new Error('TITLE_REQUIRED');
  }

  if (!finalContent) {
    throw new Error('CONTENT_REQUIRED');
  }

  let isJsonContent = false;
  if (normalizedKey === 'about-us' && typeof finalContent === 'string') {
    try {
      JSON.parse(finalContent);
      isJsonContent = true;
    } catch {
      isJsonContent = false;
    }
  }

  const normalizedContent = isJsonContent ? finalContent : normalizeStaticPageContent(finalContent);

  if (existing) {
    await db.query(
      `UPDATE static_pages
       SET title = ?, content = ?, status = ?, updated_by = ?, updated_at = NOW()
       WHERE page_key = ?`,
      [finalTitle, normalizedContent, finalStatus, adminId || null, normalizedKey]
    );
  } else {
    await db.query(
      `INSERT INTO static_pages
        (id, page_key, title, content, status, sort_order, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        createUuid(),
        normalizedKey,
        finalTitle,
        normalizedContent,
        finalStatus,
        fallback.sortOrder || 0,
        adminId || null,
      ]
    );
  }

  return getStaticPageByKey(normalizedKey, { includeInactive: true });
}

module.exports = {
  ALLOWED_PAGE_KEYS,
  DEFAULT_STATIC_PAGES,
  ensureStaticPagesSchema,
  getStaticPageByKey,
  listStaticPages,
  updateStaticPage,
};
