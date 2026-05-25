FROM node:20-alpine

# Install build tools for better-sqlite3
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Copy package files first
COPY backend/package*.json ./backend/
COPY frontend/package*.json ./frontend/

# Install dependencies
RUN cd backend && npm install && npm rebuild better-sqlite3
RUN cd frontend && npm install

# Copy source code
COPY backend ./backend/
COPY frontend ./frontend/

# Build-time variable for Vite frontend
ARG VITE_WS_URL
ENV VITE_WS_URL=$VITE_WS_URL

# Build frontend
RUN cd frontend && npm run build

# Create a public directory in backend and copy frontend build
RUN mkdir -p backend/public && cp -r frontend/dist/* backend/public/

# Set working directory to backend
WORKDIR /app/backend

# Expose the port
EXPOSE 3000

ENV NODE_ENV=production

# Start the server
CMD ["node", "src/index.js"]