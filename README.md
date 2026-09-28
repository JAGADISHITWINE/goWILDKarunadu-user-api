# GoWILD Karunadu User API

## Overview

This is the public-facing backend for the GoWILD Karunadu user portal. It provides authentication, trip discovery, booking operations, referrals, blog APIs, and user account functionality.

## Tech stack

- Node.js
- Express
- MySQL
- Sequelize
- JWT
- AWS S3 integration
- Multer + Sharp

## Project structure

```text
goWILDKarunadu-user-api/
├── app.js
├── server.js
├── src/
│   ├── controllers/
│   ├── middleware/
│   ├── models/
│   ├── routes/
│   ├── service/
│   ├── utils/
│   └── config/
├── uploads/
├── .env
└── package.json
```

## Local setup

```bash
cd goWILDKarunadu-user-api
npm install
node server.js
```

Default port:

- `4002`

## Main routes

- `/api/auth/login`, `/register`, `/send-otp`, `/verify-otp`
- `/api/auth/getAllTreks`, `/api/auth/getTrekByUuid/:id`
- `/api/auth/booking`, `/api/auth/getMyBookingsById/:id`
- `/api/auth/coupons/trek/:trekId`
- `/api/auth/referrals/:userId/summary`
- `/api/auth/blog/posts`, `/api/auth/blog/posts/:id`
- `/api/auth/blog/comments`

## Important config

Update the `.env` file for local or production use:

- `PORT`
- `JWT_SECRET`
- `CORS_ORIGINS`
- `DB_*`
- `STORAGE_MODE`
- `S3_BUCKET`
- `CLOUDFRONT_URL`
- `SHARED_UPLOADS_DIR`

## Production notes

- Keep `CORS_ORIGINS` aligned with the production frontend URL.
- Ensure media uploads are available to the user frontend.
- Use environment-specific secrets and AWS credentials only.

## Main file references

- Routes: `src/routes/auth.routes.js`
- App entry: `app.js`
- Storage: `src/utils/storageFactory.js`

---

See also: `PROJECT_DOCUMENTATION.md` and `DEVELOPER_HANDOFF.md`.
