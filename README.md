# New World — Railway Deployment

## Deploy to Railway

### 1. Push to GitHub
```bash
git init && git add . && git commit -m "New World v6"
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
git push -u origin main
```

### 2. Create Railway project
- Go to railway.app → New Project → Deploy from GitHub repo
- Select your repo — Railway auto-detects the Dockerfile

### 3. Add environment variables in Railway dashboard → Variables:
```
PORT=8080
SESSION_SECRET=<generate a random 64-char hex string>
DISCORD_CLIENT_ID=<from discord.com/developers/applications>
DISCORD_CLIENT_SECRET=<from discord.com/developers/applications>
DISCORD_REDIRECT_URI=https://your-railway-domain.up.railway.app/api/auth/discord/callback
ADMIN_DISCORD_USER_IDS=1210535016904523789
DATA_DIR_OVERRIDE=/data
```

### 4. Add a Volume (for persistent data)
- Railway dashboard → your service → Volumes → Add Volume
- Mount path: `/data`
- This keeps users, bubbles, and leaderboard data across redeploys

### 5. Set your custom domain (optional)
- Railway dashboard → Settings → Domains → Add custom domain
- Point `newworld.qzz.io` CNAME to the Railway domain
- Update `DISCORD_REDIRECT_URI` to `https://newworld.qzz.io/api/auth/discord/callback`

### 6. Update Discord OAuth2 redirect URI
- discord.com/developers/applications → your app → OAuth2 → Redirects
- Add the same URL as DISCORD_REDIRECT_URI above
