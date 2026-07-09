import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

import { google } from 'googleapis'
import http from 'http'
import { URL } from 'url'

const PORT = 3001
const REDIRECT_URI = `http://localhost:${PORT}/callback`

async function main() {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    console.log(`
Missing GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET in .env.local

How to get them:
  1. Go to https://console.cloud.google.com
  2. Create a project (or select existing)
  3. APIs & Services > Enable APIs > enable "Gmail API"
  4. APIs & Services > OAuth consent screen
       - User type: External
       - Add your Gmail address as a Test user
  5. APIs & Services > Credentials > Create Credentials > OAuth 2.0 Client ID
       - Application type: Web application
       - Authorized redirect URIs: http://localhost:3001/callback
  6. Copy Client ID and Client Secret into .env.local:
       GOOGLE_CLIENT_ID=...
       GOOGLE_CLIENT_SECRET=...
  7. Re-run: npm run setup:google-auth
`)
    process.exit(1)
  }

  const oauth2 = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    REDIRECT_URI,
  )

  const authUrl = oauth2.generateAuthUrl({
    access_type: 'offline',
    scope: ['https://www.googleapis.com/auth/gmail.readonly'],
    prompt: 'consent',
  })

  console.log('\n1. Open this URL in your browser:\n')
  console.log('   ' + authUrl)
  console.log('\n2. Sign in and authorize Gmail read access')
  console.log('\nWaiting for OAuth callback on http://localhost:' + PORT + '...\n')

  await new Promise<void>((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      const url = new URL(req.url!, `http://localhost:${PORT}`)
      const code = url.searchParams.get('code')
      if (!code) {
        res.writeHead(400); res.end('No code received.')
        return
      }
      try {
        const { tokens } = await oauth2.getToken(code)
        res.writeHead(200, { 'Content-Type': 'text/html' })
        res.end('<h2>Done! You can close this tab.</h2>')
        server.close()
        console.log('\nAdd this to your .env.local:\n')
        console.log(`GOOGLE_REFRESH_TOKEN=${tokens.refresh_token}`)
        console.log('\nThen run: npm run daily:recommend\n')
        resolve()
      } catch (err: any) {
        res.writeHead(500); res.end('Error: ' + err.message)
        reject(err)
      }
    })
    server.listen(PORT)
    server.on('error', reject)
  })
}

main().catch(err => {
  console.error('Error:', err.message)
  process.exit(1)
})
