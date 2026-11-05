# AFFiNE Self-Hosted Docker Deployment

This guide provides instructions for deploying AFFiNE with Notion Zero-Loss Import support using Docker.

## 🚀 Quick Start

### 1. Prerequisites

- Docker (v20.10+ recommended)
- Docker Compose (v2.0+ recommended)
- Git
- Domain name (for production HTTPS)

### 2. Clone and Setup

```bash
# Clone your fork (or the original repository)
git clone https://github.com/petitmj/AFFiNE.git
cd AFFiNE

# Checkout the Notion Zero-Loss Import branch
git checkout feat/notion-zero-loss-import
```

### 3. Start Services

```bash
# For development (auto-rebuild on changes)
docker-compose -f docker-compose.yml up -d

# For production (use pre-built images)
docker-compose -f .docker/selfhost/compose.yml up -d
```

### 4. Access AFFiNE

- **Development**: http://localhost:3010
- **Production**: https://your-domain.com (if using nginx)

## 📦 Available Services

| Service | Port | Description |
|---------|------|-------------|
| affine | 3010 | Main AFFiNE application |
| postgres | 5432 | PostgreSQL database with pgvector |
| redis | 6379 | Redis for caching and sessions |
| nginx | 80/443 | Reverse proxy with HTTPS (optional) |

## 🔄 Updating Your Installation

### For Docker Compose Users

```bash
# 1. Pull the latest changes
cd /path/to/your/AFFiNE
git fetch origin
git checkout feat/notion-zero-loss-import
git pull origin feat/notion-zero-loss-import

# 2. Rebuild and restart containers
docker-compose -f docker-compose.yml down
docker-compose -f docker-compose.yml up -d --build

# 3. Run database migrations (if needed)
docker-compose exec affine yarn affine @affine/server prisma migrate deploy
```

### For Official Self-Hosted Image Users

```bash
# 1. Pull the latest image
docker-compose -f .docker/selfhost/compose.yml pull

# 2. Restart containers
docker-compose -f .docker/selfhost/compose.yml down
docker-compose -f .docker/selfhost/compose.yml up -d
```

## 🛠️ Configuration

### Environment Variables

Create a `.env` file in the project root or set environment variables:

```env
# Required
NODE_ENV=production
DATABASE_URL=postgresql://affine@postgres:5432/affine
REDIS_SERVER_HOST=redis
DEPLOYMENT_TYPE=selfhosted

# Notion Zero-Loss Import Feature
NOTION_IMPORT_ENABLED=true
NOTION_IMPORT_API_VERSION=2025-09-03
NOTION_IMPORT_RETENTION_DAYS=30
NOTION_IMPORT_MAX_FILE_BYTES=104857600  # 100MB
NOTION_IMPORT_MAX_TASK_ATTEMPTS=5
```

### Data Directories

All persistent data is stored in the following directories:

```
./data/
├── storage/       # Blob storage (attachments, images)
├── postgres/      # PostgreSQL database
└── redis/         # Redis data

./config/
├── nginx/         # Nginx configuration
└── affine/        # AFFiNE configuration
```

## 🔒 HTTPS Setup (Optional)

### 1. Obtain SSL Certificates

Use Let's Encrypt with Certbot:

```bash
# Install certbot
sudo apt-get install certbot

# Obtain certificates
sudo certbot certonly --standalone -d your-domain.com

# Copy certificates to the nginx directory
sudo cp /etc/letsencrypt/live/your-domain.com/fullchain.pem ./config/nginx/ssl/
sudo cp /etc/letsencrypt/live/your-domain.com/privkey.pem ./config/nginx/ssl/
```

### 2. Update nginx.conf

Edit `config/nginx/nginx.conf` and replace:
- `your-domain.com` with your actual domain
- SSL certificate paths if different

### 3. Start with Nginx

```bash
# Start all services including nginx
docker-compose -f docker-compose.yml --profile proxy up -d
```

## 📊 Notion Zero-Loss Import Configuration

The Notion Zero-Loss Import feature is enabled by default in this branch. Configuration options:

| Variable | Default | Description |
|----------|---------|-------------|
| `NOTION_IMPORT_ENABLED` | `true` | Enable/disable the feature |
| `NOTION_IMPORT_API_VERSION` | `2025-09-03` | Notion API version to use |
| `NOTION_IMPORT_RETENTION_DAYS` | `30` | How long to keep import data |
| `NOTION_IMPORT_MAX_FILE_BYTES` | `104857600` | Maximum file size (100MB) |
| `NOTION_IMPORT_MAX_TASK_ATTEMPTS` | `5` | Maximum retry attempts per task |

## 🧹 Maintenance

### Database Backup

```bash
# Create a backup
docker exec affine_postgres pg_dump -U affine affine > affine_backup_$(date +%Y%m%d).sql

# Restore from backup
cat affine_backup.sql | docker exec -i affine_postgres psql -U affine affine
```

### Logs

```bash
# View AFFiNE logs
docker logs affine_server

# View all logs
docker-compose logs -f
```

### Cleanup

```bash
# Stop all services
docker-compose down

# Remove all data (WARNING: This will delete all your data!)
docker-compose down -v
```

## 🐛 Troubleshooting

### Common Issues

1. **Database connection failed**
   - Ensure PostgreSQL is running: `docker ps | grep postgres`
   - Check the connection string in `.env`

2. **Redis connection failed**
   - Ensure Redis is running: `docker ps | grep redis`
   - Check the host in `.env`

3. **Port already in use**
   - Change the port mapping in `docker-compose.yml`
   - Or stop the service using the port: `sudo lsof -i :3010`

4. **Build failures**
   - Ensure you have enough disk space
   - Try: `docker system prune -a` then rebuild

### Debug Mode

```bash
# Start in debug mode with verbose logging
docker-compose -f docker-compose.yml up -d --build
```

## 📞 Support

- **Documentation**: https://docs.affine.pro/self-host-affine
- **Community**: Join the AFFiNE Discord server
- **Issues**: https://github.com/petitmj/AFFiNE/issues

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
