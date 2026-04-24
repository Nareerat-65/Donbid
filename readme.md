# Donbid - Real-Time Auction Platform

A real-time online auction platform built with Node.js, Express, Socket.IO, and AI-powered auctioneer features.

## Features

- 🔐 User Authentication (JWT)
- 🏠 Real-time Auction Rooms with Socket.IO
- 🤖 AI Auctioneer (Google Gemini API)
- 🔊 Text-to-Speech with Azure Speech Service
- 💰 Coin/Wallet System
- 📸 Product Image Uploads
- ⏰ Automated Auction Status Updates (Cron)

## Tech Stack

| Category | Technology |
|----------|------------|
| Backend | Node.js, Express.js |
| Real-time | Socket.IO |
| Database | MySQL |
| Authentication | JWT, bcrypt |
| AI | Google Gemini API |
| TTS | Azure Speech SDK |
| File Upload | Multer |
| Scheduling | node-cron |

## Prerequisites

- Node.js 18+ 
- MySQL 8+
- Git

## Installation

### 1. Clone the repository

```bash
git clone https://github.com/Nareerat-65/Donbid.git
cd Donbid
```

### 2. Install dependencies

```bash
npm install
```

### 3. Set up environment variables

Copy `.env.example` to `.env` and fill in your values:

```bash
cp .env.example .env
```

Edit `.env` with your configuration:

```env
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=donbid
JWT_SECRET=your-secret-key
GEMINI_API_KEY=your-gemini-api-key
AZURE_SPEECH_KEY=your-azure-key
AZURE_SPEECH_REGION=your-azure-region
```

### 4. Create the database

```bash
mysql -u root -p
```

```sql
CREATE DATABASE donbid;
USE donbid;
SOURCE schema.sql;
```

### 5. Create uploads directory

```bash
mkdir uploads
```

## Running the Server

```bash
npm start
```

The server will start on `http://localhost:3000`

## Project Structure

```
Donbid/
├── controllers/          # Business logic
│   └── authController.js
├── middlewares/          # Express middlewares
│   ├── auth.js          # JWT authentication
│   └── upload.js        # Multer file upload
├── routes/              # API routes
│   ├── auth.js          # /api/auth
│   ├── bids.js          # /api/bids
│   ├── coins.js         # /api/coins
│   ├── products.js      # /api/products
│   ├── profile.js       # /api/profile
│   └── ai.js            # /api/ai
├── utils/               # Utilities
│   └── db.js            # MySQL connection
├── donbid-main/         # Frontend (HTML, CSS, JS)
│   ├── content/
│   ├── login/
│   ├── singUp/
│   ├── seller/
│   ├── auction_room/
│   ├── purchaseCoins/
│   └── termsAndPrivacy/
├── uploads/             # Uploaded files
├── server.js            # Main entry point
├── schema.sql           # Database schema
└── .env.example         # Environment template
```

## API Endpoints

### Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/auth/register | Register new user |
| POST | /api/auth/login | Login user |
| POST | /api/auth/check | Check duplicate email/username |
| POST | /api/auth/user/upgrade-role | Upgrade to seller |

### Products
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/products | Get all products |
| GET | /api/products/:id | Get product by ID |
| POST | /api/products | Add product (seller only) |
| POST | /api/products/close/:id | Close auction |

### Bids
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/bids/highest | Get highest bid |
| POST | /api/bids | Place bid |
| GET | /api/bids/history | Get bid history |

### Profile
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/profile | Get won auctions |
| GET | /api/profile/my-sell-products | Get seller products |
| GET | /api/profile/address | Get address |
| PUT | /api/profile/address | Update address |

### Coins
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/coins/topup | Top up coins |
| GET | /api/coins/balance | Get coin balance |

### AI
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/ai/chat | Get AI response |
| GET | /api/ai/:productId/logs | Get AI logs |
| POST | /api/ai/tts | Text-to-speech |

## Socket.IO Events

| Event | Description |
|-------|-------------|
| `join auction` | Join an auction room |
| `bid placed` | Place a bid |
| `disconnect` | Leave auction |
| `participants update` | Update participant list |
| `auction endtime` | Auction end time |
| `ai message` | AI announcer message |
| `new bid` | New bid notification |
| `product-added` | New product added |

## Database Schema

The database consists of 8 tables:

1. **users** - User accounts
2. **user_profiles** - User profile information
3. **user_wallets** - User coin balances
4. **products** - Auction products
5. **product_images** - Product image paths
6. **bids** - Bid records
7. **auction_results** - Auction winners
8. **auction_logs** - AI messages

## Security Notes

- Change `JWT_SECRET` in production
- Use HTTPS in production
- Sanitize file uploads
- Rate limit API endpoints
- Never commit `.env` file

## License

ISC

## Author

Nareerat-65
