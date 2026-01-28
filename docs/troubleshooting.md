# Troubleshooting Guide

Common issues and solutions for preview-deployer.

## Setup Issues

### Terraform Errors

**Error: "Failed to initialize Terraform"**

- Ensure Terraform is installed: `terraform version`
- Check Terraform version >= 1.5.0
- Verify Digital Ocean token is valid

**Error: "Failed to create droplet"**

- Check Digital Ocean account has sufficient credits
- Verify region is available
- Check droplet size is available in selected region

**Error: "SSH connection failed"**

- Verify SSH public key is correct
- Check firewall allows SSH (port 22)
- Wait a few minutes for droplet to fully initialize

### Ansible Errors

**Error: "Failed to connect to host"**

- Ensure SSH access works: `ssh root@SERVER_IP`
- Check inventory file is correctly generated
- Verify SSH key is added to droplet

**Error: "Docker installation failed"**

- Check internet connectivity on droplet
- Verify Ubuntu 22.04 is being used
- Check Ansible logs for detailed error

**Error: "Orchestrator service failed to start"**

- Check environment variables are set correctly
- Verify Node.js is installed: `node --version`
- Check orchestrator logs: `journalctl -u preview-deployer-orchestrator -f`

## Deployment Issues

### Webhook Not Triggering

**Symptoms**: PR opened but no preview deployment

**Solutions**:
1. Check webhook is configured:
   ```bash
   # Via GitHub API or web interface
   ```

2. Verify webhook secret matches:
   ```bash
   cat ~/.preview-deployer/config.yml | grep webhook_secret
   ```

3. Check orchestrator logs:
   ```bash
   ssh root@SERVER_IP
   journalctl -u preview-deployer-orchestrator -f
   ```

4. Test webhook manually:
   ```bash
   curl -X POST http://SERVER_IP:3000/webhook/github \
     -H "Content-Type: application/json" \
     -H "X-Hub-Signature-256: sha256=..." \
     -d '{"action":"opened",...}'
   ```

### Build Failures

**Symptoms**: Preview deployment fails during build

**Solutions**:
1. Check Docker build logs:
   ```bash
   ssh root@SERVER_IP
   cd /opt/preview-deployments/pr-{PR_NUMBER}
   docker compose logs app
   ```

2. Verify Dockerfile exists and is correct
3. Check build commands in `preview-config.yml`
4. Ensure dependencies are installable

### Health Check Failures

**Symptoms**: Containers start but preview URL doesn't work

**Solutions**:
1. Verify health check endpoint exists:
   ```bash
   curl http://localhost:{APP_PORT}/health
   ```

2. Check health check path in `preview-config.yml`:
   ```yaml
   health_check_path: /health  # Must match your app's endpoint
   ```

3. Check container logs:
   ```bash
   docker logs pr-{PR_NUMBER}-app
   ```

4. Verify app is listening on correct port:
   ```bash
   docker exec pr-{PR_NUMBER}-app netstat -tlnp
   ```

### Port Conflicts

**Symptoms**: "Port already in use" error

**Solutions**:
1. Check allocated ports:
   ```bash
   ssh root@SERVER_IP
   cat /opt/preview-deployer/deployments.json | jq '.portAllocations'
   ```

2. Find process using port:
   ```bash
   lsof -i :{PORT}
   ```

3. Cleanup old deployment:
   ```bash
   curl -X DELETE http://SERVER_IP:3000/api/previews/{PR_NUMBER}
   ```

### Nginx Configuration Errors

**Symptoms**: Preview URL returns 502 Bad Gateway

**Solutions**:
1. Check nginx config syntax:
   ```bash
   ssh root@SERVER_IP
   nginx -t
   ```

2. Verify preview config exists:
   ```bash
   cat /etc/nginx/preview-configs/pr-{PR_NUMBER}.conf
   ```

3. Check nginx error logs:
   ```bash
   tail -f /var/log/nginx/error.log
   ```

4. Verify app container is running:
   ```bash
   docker ps | grep pr-{PR_NUMBER}
   ```

5. Test proxy directly:
   ```bash
   curl -H "Host: SERVER_IP" http://localhost/pr-{PR_NUMBER}/
   ```

## Runtime Issues

### Container Crashes

**Symptoms**: Preview works initially but stops responding

**Solutions**:
1. Check container status:
   ```bash
   docker ps -a | grep pr-{PR_NUMBER}
   ```

2. View container logs:
   ```bash
   docker logs pr-{PR_NUMBER}-app
   ```

3. Check resource usage:
   ```bash
   docker stats pr-{PR_NUMBER}-app
   ```

4. Restart container:
   ```bash
   cd /opt/preview-deployments/pr-{PR_NUMBER}
   docker compose restart app
   ```

### Database Connection Issues

**Symptoms**: App can't connect to database

**Solutions**:
1. Verify database container is running:
   ```bash
   docker ps | grep pr-{PR_NUMBER}-db
   ```

2. Check database logs:
   ```bash
   docker logs pr-{PR_NUMBER}-db
   ```

3. Test database connection:
   ```bash
   docker exec pr-{PR_NUMBER}-db pg_isready -U preview
   ```

4. Verify connection string in app:
   ```bash
   docker exec pr-{PR_NUMBER}-app env | grep DATABASE_URL
   ```

### Cleanup Not Working

**Symptoms**: Old previews not being cleaned up

**Solutions**:
1. Check cleanup service is running:
   ```bash
   ssh root@SERVER_IP
   journalctl -u preview-deployer-orchestrator | grep cleanup
   ```

2. Verify TTL configuration:
   ```bash
   cat ~/.preview-deployer/config.yml | grep cleanup_ttl_days
   ```

3. Manually trigger cleanup:
   ```bash
   curl -X DELETE http://SERVER_IP:3000/api/previews/{PR_NUMBER}
   ```

4. Check deployment age:
   ```bash
   cat /opt/preview-deployer/deployments.json | jq '.deployments."{PR_NUMBER}"'
   ```

## Performance Issues

### Slow Builds

**Solutions**:
1. Use Docker layer caching
2. Optimize Dockerfile (multi-stage builds)
3. Use smaller base images
4. Cache dependencies in separate layer

### High Resource Usage

**Solutions**:
1. Reduce max concurrent previews
2. Lower container resource limits
3. Use smaller droplet size
4. Enable cleanup of old previews

### Memory Issues

**Symptoms**: Droplet runs out of memory

**Solutions**:
1. Check memory usage:
   ```bash
   free -h
   docker stats
   ```

2. Reduce container memory limits
3. Cleanup old previews
4. Upgrade droplet size

## Security Issues

### Webhook Signature Verification Failed

**Solutions**:
1. Verify webhook secret matches:
   ```bash
   cat ~/.preview-deployer/config.yml | grep webhook_secret
   ```

2. Check GitHub webhook configuration
3. Verify payload is not modified

### Unauthorized Repository Access

**Solutions**:
1. Check `ALLOWED_REPOS` environment variable
2. Verify repository format: `owner/repo`
3. Check orchestrator logs for rejection messages

## Debugging Tips

### Enable Debug Logging

Set `LOG_LEVEL=debug` in orchestrator environment:

```bash
ssh root@SERVER_IP
systemctl edit preview-deployer-orchestrator
# Add: Environment="LOG_LEVEL=debug"
systemctl daemon-reload
systemctl restart preview-deployer-orchestrator
```

### Check All Services

```bash
ssh root@SERVER_IP

# Docker
systemctl status docker
docker ps

# Nginx
systemctl status nginx
nginx -t

# Orchestrator
systemctl status preview-deployer-orchestrator
journalctl -u preview-deployer-orchestrator -n 50
```

### Manual Testing

Test orchestrator API:
```bash
curl http://SERVER_IP:3000/health
curl http://SERVER_IP:3000/api/previews
```

Test webhook:
```bash
# Generate signature
SECRET="your-webhook-secret"
PAYLOAD='{"action":"opened",...}'
SIGNATURE=$(echo -n "$PAYLOAD" | openssl dgst -sha256 -hmac "$SECRET" | cut -d' ' -f2)

curl -X POST http://SERVER_IP:3000/webhook/github \
  -H "Content-Type: application/json" \
  -H "X-Hub-Signature-256: sha256=$SIGNATURE" \
  -d "$PAYLOAD"
```

## Getting Help

If you're still stuck:

1. Check logs for error messages
2. Review [Architecture Documentation](architecture.md)
3. Check [Configuration Reference](configuration.md)
4. Open an issue on GitHub with:
   - Error messages
   - Logs (sanitized)
   - Steps to reproduce
   - System information

## Common Error Messages

### "Repository not in allowed list"

- Add repository to `ALLOWED_REPOS` environment variable
- Restart orchestrator service

### "Port allocation out of range"

- PR number too large (>56,000)
- Use smaller PR numbers or upgrade port allocation strategy

### "Health check timeout"

- Verify health check endpoint exists
- Check health check path in config
- Increase timeout in docker-manager.ts

### "Docker build failed"

- Check Dockerfile syntax
- Verify all dependencies are available
- Check build logs for specific errors

### "Nginx reload failed"

- Check nginx config syntax: `nginx -t`
- Verify preview config file format
- Check nginx error logs
