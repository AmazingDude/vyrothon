# Grabpic

Grabpic is an intelligent face indexing and retrieval service that groups related photos by identity and enables selfie-based photo lookup.

## Overview

Grabpic provides a lightweight API to:

- Crawl and index faces from a local image folder
- Authenticate a selfie against indexed faces
- Retrieve all images associated with a matched identity (`grab_id`)

## Tech Stack

- Express.js
- TypeScript
- Prisma
- Supabase (PostgreSQL)
- face-api.js

## API Endpoints

### 1) POST `/admin/crawl`
Crawls the `sample-images` directory, detects faces, and assigns/updates `grab_id` values.

### 2) POST `/auth/selfie`
Accepts an uploaded selfie and returns the best matching `grab_id` with confidence score.

### 3) GET `/images/:grabId`
Returns all image paths associated with the provided `grab_id`.

## Getting Started

### Prerequisites

- Node.js 18+
- npm
- Supabase project with connection URLs

### Setup

1. Clone the repository:
   ```bash
   git clone https://github.com/AmazingDude/vyrothon.git
   cd vyrothon/grabpic-backend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create a `.env` file in `grabpic-backend` with your Supabase connection values:
   ```env
   DATABASE_URL="your_supabase_database_url"
   DIRECT_URL="your_supabase_direct_url"
   ```
4. Generate Prisma client:
   ```bash
   npx prisma generate
   ```
5. Run migrations:
   ```bash
   npx prisma migrate dev --name init
   ```
6. Add face images to the `sample-images` folder.
7. Start the development server:
   ```bash
   npm run dev
   ```

By default, the API runs at `http://localhost:3000`.

## cURL Examples

### Crawl and index faces
```bash
curl -X POST http://localhost:3000/admin/crawl
```

### Selfie authentication
```bash
curl -X POST http://localhost:3000/auth/selfie \
  -F "image=@/absolute/path/to/selfie.jpg"
```

### Fetch images by grab_id
```bash
curl http://localhost:3000/images/<grabId>
```

## Notes

- Ensure the server is running before executing API requests.
- For best matching accuracy, use clear, front-facing face images in `sample-images` and selfie uploads.
