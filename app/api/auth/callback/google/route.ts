import { google } from 'googleapis';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams;
    const code = searchParams.get('code');

    if (!code) {
        return NextResponse.json({ error: 'Código de autorização não encontrado.' }, { status: 400 });
    }

    try {
        const oauth2Client = new google.auth.OAuth2(
            process.env.GOOGLE_CLIENT_ID,
            process.env.GOOGLE_CLIENT_SECRET,
            `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/auth/callback/google`
        );

        const { tokens } = await oauth2Client.getToken(code);

        // O refresh_token só vem na primeira vez que o usuário autoriza com prompt=consent
        if (tokens.refresh_token) {
            return new NextResponse(`
                <html>
                    <body style="font-family: sans-serif; padding: 20px; line-height: 1.6;">
                        <h1 style="color: #059669;">Sucesso! Configuração Concluída.</h1>
                        <p>Copie o código abaixo e adicione-o à sua variável <b>GOOGLE_REFRESH_TOKEN</b> na Vercel:</p>
                        <div style="background: #f3f4f6; padding: 15px; border-radius: 8px; border: 1px solid #d1d5db; word-break: break-all; font-family: monospace;">
                            ${tokens.refresh_token}
                        </div>
                        <p style="margin-top: 20px; color: #6b7280;">Após adicionar, você já pode fechar esta janela e usar a sincronização do Drive.</p>
                    </body>
                </html>
            `, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
        } else {
            return new NextResponse(`
                <html>
                    <body style="font-family: sans-serif; padding: 20px;">
                        <h1 style="color: #dc2626;">Atenção: Refresh Token não recebido.</h1>
                        <p>Isso acontece se você já autorizou o app anteriormente.</p>
                        <p><a href="/api/auth/google">Clique aqui para tentar novamente</a> (certifique-se de aceitar todas as permissões).</p>
                    </body>
                </html>
            `, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
        }
    } catch (error: any) {
        console.error('Erro ao trocar código por tokens:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
