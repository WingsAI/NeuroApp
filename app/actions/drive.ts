'use server';

import { google } from 'googleapis';
import prisma from '@/lib/prisma';
import { revalidatePath } from 'next/cache';
import chromium from '@sparticuz/chromium-min';
import puppeteer from 'puppeteer-core';

const DRIVE_FOLDER_ID = '1JvBzyuBRnY_VAXeYZ_IX3cMsjBQ8x5jI';

/**
 * Action to sync all unsynced medical reports to Google Drive as PDFs.
 */
export async function syncReportsToDriveAction() {
    try {
        console.log('[DRIVE] Iniciando sincronização...');

        // 1. Fetch reports that are completed but not yet synced
        const reports = await prisma.medicalReport.findMany({
            where: {
                syncedToDrive: false,
            },
            include: {
                exam: {
                    include: {
                        patient: true,
                    },
                },
            },
        });

        if (reports.length === 0) {
            return { success: true, count: 0, message: 'Nenhum laudo pendente de sincronização.' };
        }

        console.log(`[DRIVE] Encontrados ${reports.length} laudos para sincronizar.`);

        // 2. Setup Google Drive Auth (OAuth2)
        const oauth2Client = new google.auth.OAuth2(
            process.env.GOOGLE_CLIENT_ID,
            process.env.GOOGLE_CLIENT_SECRET,
            `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/auth/callback/google`
        );

        oauth2Client.setCredentials({
            refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
        });

        const drive = google.drive({ version: 'v3', auth: oauth2Client });

        // 3. Setup Puppeteer for PDF generation
        const isLocal = process.env.NODE_ENV === 'development';
        const browser = await puppeteer.launch({
            args: isLocal ? [] : chromium.args,
            defaultViewport: { width: 1200, height: 1600 },
            executablePath: isLocal
                ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' // Ajuste conforme seu SO local
                : await chromium.executablePath(),
            headless: true,
        });

        let syncedCount = 0;

        for (const report of reports) {
            try {
                const patientName = report.exam?.patient?.name || 'Paciente';
                const examId = report.examId;

                console.log(`[DRIVE] Processando PDF para: ${patientName}`);

                const page = await browser.newPage();

                // Use a URL base do app (precisa estar configurada no env)
                const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
                await page.goto(`${baseUrl}/api/print/${examId}`, {
                    waitUntil: 'networkidle0',
                });

                // Gerar Buffer do PDF
                const pdfBuffer = await page.pdf({
                    format: 'A4',
                    margin: { top: '0', right: '0', bottom: '0', left: '0' },
                    printBackground: true,
                });

                await page.close();

                // 4. Upload to Google Drive
                const fileName = `LAUDO_${patientName.toUpperCase().replace(/\s+/g, '_')}_${report.id.slice(-6)}.pdf`;

                const response = await drive.files.create({
                    requestBody: {
                        name: fileName,
                        parents: [DRIVE_FOLDER_ID],
                        mimeType: 'application/pdf',
                    },
                    media: {
                        mimeType: 'application/pdf',
                        body: Buffer.from(pdfBuffer),
                    },
                } as any);

                const driveFileId = response.data.id;

                // 5. Update Database
                await prisma.medicalReport.update({
                    where: { id: report.id },
                    data: {
                        syncedToDrive: true,
                        driveFileId: driveFileId as string,
                    },
                });

                syncedCount++;
                console.log(`[DRIVE] ✅ Sucesso: ${fileName}`);
            } catch (error) {
                const patientName = report.exam?.patient?.name || 'Paciente';
                console.error(`[DRIVE] ❌ Falha ao processar ${patientName}:`, error);
            }
        }

        await browser.close();

        revalidatePath('/results');

        return {
            success: true,
            count: syncedCount,
            message: `${syncedCount} laudos sincronizados com sucesso para o Google Drive.`
        };
    } catch (error: any) {
        console.error('[DRIVE] Erro crítico na sincronização:', error);
        return { success: false, error: error.message };
    }
}
