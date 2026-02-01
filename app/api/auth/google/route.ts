import { google } from 'googleapis';
import { NextResponse } from 'next/server';

export async function GET() {
    const oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/auth/callback/google`
    );

    const scopes = ['https://www.googleapis.com/auth/drive.file'];

    const url = oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: scopes,
        prompt: 'consent', // Forçar a geração do refresh token
    });

    return NextResponse.redirect(url);
}
