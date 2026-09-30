const router = require('express').Router();
const ctrl = require('../controllers/auth.controller');
const trek = require('../controllers/trek.controlller');
const booking = require('../controllers/booking.controller');
const upcoming = require('../controllers/upcoming.controller');
const blogController = require('../controllers/blog.controller');
const metaController = require('../controllers/meta.controller');
const referralController = require('../controllers/referral.controller');
const paymentController = require('../controllers/payment.controller');
const upload = require('../middleware/upload'); 
const { requireAuth } = require('../middleware/auth');

const walletController = require('../controllers/wallet.controller');
const communityController = require('../controllers/community.controller');
const staticPagesController = require('../controllers/staticPages.controller');

// ========== STATIC PAGES ROUTES ==========
router.get('/pages', staticPagesController.listPublicStaticPages);
router.get('/pages/:pageKey', staticPagesController.getPublicStaticPage);

// ========== AUTH ROUTES ==========
router.post('/login', ctrl.login);
router.post('/register', ctrl.register);
router.post('/send-otp', ctrl.sendOtp);
router.post('/verify-otp', ctrl.verifyOtp);
router.post('/forgot-password', ctrl.forgotPassword);
router.post('/reset-password', ctrl.resetPassword);
router.post('/validate-reset-token', ctrl.validateResetToken);

// ========== DASHBOARD ROUTES ==========
router.get('/dashData', trek.getDashboardData);

// ========== WALLET ROUTES ==========
router.get('/wallet', requireAuth, walletController.getWalletController);
router.get('/wallet/:userId', requireAuth, walletController.getWalletController);
router.post('/wallet/add-funds', requireAuth, walletController.addFundsController);

// ========== COMMUNITY & CARPOOL ROUTES ==========
router.get('/community/carpools', communityController.listCarpoolsController);
router.post('/community/carpools', requireAuth, communityController.createCarpoolController);

// ========== META DROPDOWNS & OPERATIONS ==========
router.get('/meta/dropdowns', metaController.getAllDropdowns);
router.all('/meta/clear-cache', metaController.clearDropdownCacheEndpoint);
router.get('/meta/dropdowns/:type', metaController.getDropdownByType);
router.get('/meta/gear-rentals', metaController.getGearRentals);
router.get('/meta/trail-advisories', metaController.getTrailAdvisories);
router.get('/meta/site-settings', metaController.getSiteSettings);

// ========== TREK ROUTES ==========
router.get('/getTrekByUuid/:id', trek.getTrekById);
router.get('/getAllTreks', trek.getAllTreks);

// ========== BOOKING ROUTES ==========
router.post('/booking', requireAuth, booking.createBookingController);
router.post('/coupon/validate', booking.validateCouponController);
router.get('/coupons/trek/:trekId', booking.getAvailableCouponsController);
router.get('/getMyBookingsById/:id', requireAuth, booking.getMyBookingsById);
router.get('/bookings/:userId/:bookingId/receipt', requireAuth, booking.getReceiptById);
router.post('/bookings/:userId/:bookingId/rating', requireAuth, booking.submitTrekRating);
router.post('/bookings/:bookingId/cancel', requireAuth, booking.cancelBooking);
router.post('/bookings/:bookingId/pay-remainder', requireAuth, booking.payRemainderController);
router.get('/bookings/:bookingId/tax-invoice', requireAuth, booking.getTaxInvoiceController);
router.get('/bookings/:bookingId/summit-certificate', requireAuth, booking.getSummitCertificateController);
router.post('/referrals/validate', referralController.validateReferralCode);
router.get('/referrals/:userId/summary', requireAuth, referralController.getReferralSummary);
router.get('/referrals/:userId/code', requireAuth, referralController.getOrCreateReferralCode);

// Public routes
router.get('/blog/posts/related', blogController.getRelatedPosts);
router.get('/blog/posts', blogController.getAllPosts);
router.get('/blog/posts/:id', blogController.getPostById);
router.get('/blog/posts/:id/comments', blogController.getComments);
router.get('/blog/categories', blogController.getCategories);
router.get('/blog/tags', blogController.getTags);

// Protected routes
router.post('/blog/posts', requireAuth, upload.single('image'), blogController.createPost);
router.put('/blog/posts/:id', requireAuth, blogController.updatePost);
router.delete('/blog/posts/:id', requireAuth, blogController.deletePost);

// Comment routes (require auth)
router.post('/blog/comments', requireAuth, blogController.addComment);
router.put('/blog/comments/:id', requireAuth, blogController.updateComment);
router.post('/blog/comments/:id', requireAuth, blogController.deleteComment);

// Like routes (optional auth - works with or without login)
router.post('/blog/posts/:id/like',  blogController.likePost);
router.post('/blog/comments/:id/like', blogController.likeComment);

// View tracking
router.post('/blog/posts/:id/view', blogController.incrementView);

// ========== UPCOMING ROUTES - Must come AFTER specific routes ==========
router.get('/by-month/:year/:month', upcoming.getTrekBymonth);
router.get('/meta/categories', upcoming.getTrekByCategory);
router.get('/stats/monthly/:year', upcoming.getTrekByYear);
router.get('/meta/available-years', upcoming.getAllyear);
router.get('/:id', upcoming.getTrekById);
router.get('/', upcoming.getAllUpcoming);

// ========== PAYMENT ROUTES ==========
router.post('/payments/create-order', requireAuth, paymentController.createOrder);
router.post('/payments/verify', requireAuth, paymentController.verifyPayment);
// Webhook should be public (provider will call it)
router.post('/payments/webhook', paymentController.webhookHandler);


module.exports = router;
