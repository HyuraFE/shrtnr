# URL Shortener

A minimalist URL shortener built with Express.js and SQLite.

## Features

- Shorten long URLs to compact links
- Copy shortened URLs to clipboard
- Track click counts
- View URL history
- Delete shortened URLs
- Minimalist, responsive design

## Tech Stack

- **Runtime:** Node.js
- **Framework:** Express.js
- **Database:** better-sqlite3
- **ID Generator:** nanoid

## Getting Started

### Prerequisites

Ensure you have [Node.js](https://nodejs.org/) installed on your system.

### Installation

Clone the repository and install dependencies:

```bash
npm install
```

### Running the Application

Start the application:

```bash
npm start
```

The server will run on [http://localhost:3000](http://localhost:3000).

### Development Mode

Run the application in development mode:

```bash
npm run dev
```

## API Endpoints

| Method | Endpoint | Description |
| --- | --- | --- |
| `POST` | `/api/shorten` | Shorten a URL |
| `GET` | `/:code` | Redirect to original URL |
| `GET` | `/api/urls` | List all shortened URLs |
| `GET` | `/api/stats/:code` | Get URL statistics |
| `DELETE` | `/api/urls/:code` | Delete a shortened URL |

## License

MIT
